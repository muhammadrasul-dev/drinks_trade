// T-701: cash balances and journal against a real Postgres. Each test builds
// its own store (CASH opening balance 100 000 booked by the fixture, CARD
// empty); every other cash row goes through cash.record / debts.open, so
// balances and balance_after stay consistent (assertInvariants).
import { prisma } from '@drinks/db';
import { assertInvariants, makeStoreFixture, type StoreFixture } from '@drinks/db/test-utils';
import {
  type CashboxType,
  type CashTxType,
  DomainError,
  ErrorCode,
  type UserRole,
} from '@drinks/shared';
import { CASH_JOURNAL_PAGE_SIZE } from '@drinks/shared/schemas';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  cash,
  cashQueries,
  debts,
  lockCashboxes,
  type ServiceContext,
  type Tx,
  withTransaction,
} from '../../src/index';

let f: StoreFixture;

beforeEach(async () => {
  f = await makeStoreFixture(prisma, { cashBalance: 100_000n });
});

afterEach(async () => {
  await assertInvariants(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

function ctxFor(role: UserRole, fixture: StoreFixture = f): ServiceContext {
  const user = role === 'OWNER' ? fixture.owner : fixture.staff;
  return {
    user: { id: user.id, role, locale: 'uz' },
    storeId: fixture.store.id,
    organizationId: fixture.organization.id,
    requestId: `req-${role}`,
  };
}

async function lockOne(tx: Tx, type: CashboxType, fixture: StoreFixture = f) {
  const [cashbox] = await lockCashboxes(tx, fixture.store.id, [type]);
  return cashbox!;
}

type Entry = Parameters<typeof cash.record>[3];

/** Books entries one by one (each committed), in order. */
async function book(...entries: (Entry & { box?: CashboxType })[]) {
  const ids: bigint[] = [];
  for (const { box = 'CASH', ...input } of entries) {
    const result = await withTransaction(async (tx) =>
      cash.record(tx, ctxFor('OWNER'), await lockOne(tx, box), input as Entry),
    );
    ids.push(result.id);
  }
  return ids;
}

/** The thrown error, so its fields can be inspected. */
async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

/** Noon of a store-zone day (UTC+5). */
const day = (iso: string) => new Date(`${iso}T12:00:00+05:00`);

describe('cash queries: access (CLAUDE.md rule 6)', () => {
  it('STAFF gets FORBIDDEN from balances and journal', async () => {
    for (const call of [
      cashQueries.balances(ctxFor('STAFF')),
      cashQueries.journal(ctxFor('STAFF')),
    ]) {
      const error = await caught(call);
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({
        code: ErrorCode.FORBIDDEN,
        params: { permission: 'cash.read' },
      });
    }
  });

  it('rejects invalid filters with VALIDATION_FAILED', async () => {
    for (const query of [
      { type: 'BRIBE' as CashTxType },
      { from: '2026-02-30' },
      { page: 0 },
      { cashbox: 'SAFE' as CashboxType },
    ]) {
      const error = await caught(cashQueries.journal(ctxFor('OWNER'), query));
      expect(error).toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
    }
  });

  it('shows only the own store', async () => {
    const other = await makeStoreFixture(prisma, { cashBalance: 5_000n });
    const ctx = ctxFor('OWNER');
    const page = await cashQueries.journal(ctx);
    expect(page.total).toBe(1);
    expect(page.items[0]!.cashbox.id).toBe(f.cashboxes.cash.id);
    expect((await cashQueries.balances(ctx)).map((b) => b.id)).toEqual([
      f.cashboxes.cash.id,
      f.cashboxes.card.id,
    ]);
    expect((await cashQueries.journal(ctxFor('OWNER', other))).total).toBe(1);
  });
});

describe('cashQueries.balances (FR-6.1)', () => {
  it('returns CASH then CARD with balances equal to the last balance_after', async () => {
    await book(
      { type: 'SALE_RECEIPT', amount: 25_000 },
      { box: 'CARD', type: 'SALE_RECEIPT', amount: 40_000 },
      { type: 'TRAVEL_EXPENSE', amount: 5_000 },
      // Backdated: report date in the past, still the latest entry of CARD.
      {
        box: 'CARD',
        type: 'OTHER_EXPENSE',
        amount: 1_500,
        note: 'Lampochka',
        txDate: day('2025-03-01'),
      },
    );

    const balances = await cashQueries.balances(ctxFor('OWNER'));
    expect(balances.map((b) => [b.type, b.name, b.balance])).toEqual([
      ['CASH', 'Naqd', 120_000],
      ['CARD', 'Karta', 38_500],
    ]);
    for (const box of balances) {
      const last = await prisma.cashTransaction.findFirstOrThrow({
        where: { cashboxId: box.id },
        orderBy: { id: 'desc' },
      });
      expect(BigInt(box.balance)).toBe(last.balanceAfter);
    }
  });

  it('shows an untouched cashbox as 0', async () => {
    const balances = await cashQueries.balances(ctxFor('OWNER'));
    expect(balances.find((b) => b.type === 'CARD')?.balance).toBe(0);
  });
});

describe('cashQueries.journal (FR-6.1)', () => {
  it('maps every reference: document, debt, transfer, reversal, author', async () => {
    const purchase = await prisma.purchase.create({
      data: {
        storeId: f.store.id,
        number: 'P-000007',
        docDate: new Date(),
        createdById: f.owner.id,
      },
    });
    const sale = await prisma.sale.create({
      data: {
        storeId: f.store.id,
        number: 'S-000003',
        docDate: new Date(),
        createdById: f.staff.id,
      },
    });
    const [purchaseEntry, saleEntry, travel] = await book(
      { type: 'PURCHASE_PAYMENT', amount: 30_000, purchaseId: purchase.id },
      { box: 'CARD', type: 'SALE_RECEIPT', amount: 12_000, saleId: sale.id },
      { type: 'TRAVEL_EXPENSE', amount: 2_000, note: 'Taksi' },
    );
    const debt = await withTransaction(async (tx) =>
      debts.open(tx, ctxFor('OWNER'), {
        source: 'MANUAL',
        direction: 'RECEIVABLE',
        amount: 10_000,
        note: 'Aziz aka',
        cashbox: await lockOne(tx, 'CASH'),
      }),
    );
    const group = '0199f000-0000-7000-8000-000000000001';
    await book(
      { type: 'TRANSFER_OUT', amount: 3_000, transferGroupId: group },
      { box: 'CARD', type: 'TRANSFER_IN', amount: 3_000, transferGroupId: group },
    );
    const [reversal] = await book({
      type: 'MANUAL_REVERSAL',
      direction: 'IN',
      amount: 2_000,
      reversalOfId: travel!,
    });

    const page = await cashQueries.journal(ctxFor('OWNER'));
    expect(page.total).toBe(8);
    const byId = new Map(page.items.map((item) => [item.id, item]));

    expect(byId.get(purchaseEntry!.toString())).toMatchObject({
      type: 'PURCHASE_PAYMENT',
      direction: 'OUT',
      amount: 30_000,
      balanceAfter: 70_000,
      cashbox: { id: f.cashboxes.cash.id, type: 'CASH', name: 'Naqd' },
      purchase: { id: purchase.id, number: 'P-000007' },
      sale: null,
      debt: null,
      createdBy: { id: f.owner.id, fullName: f.owner.fullName },
    });
    expect(byId.get(saleEntry!.toString())).toMatchObject({
      cashbox: { type: 'CARD' },
      sale: { id: sale.id, number: 'S-000003' },
      purchase: null,
    });
    expect(byId.get(debt.cashTransactionId!.toString())).toMatchObject({
      type: 'DEBT_GIVEN',
      direction: 'OUT',
      note: 'Aziz aka',
      debt: { id: debt.id, direction: 'RECEIVABLE', source: 'MANUAL', note: 'Aziz aka' },
    });
    const transfers = page.items.filter((item) => item.transferGroupId === group);
    expect(transfers.map((item) => [item.type, item.cashbox.type])).toEqual([
      ['TRANSFER_IN', 'CARD'],
      ['TRANSFER_OUT', 'CASH'],
    ]);
    expect(byId.get(travel!.toString())).toMatchObject({
      note: 'Taksi',
      reversalOfId: null,
      reversedById: reversal!.toString(),
    });
    expect(byId.get(reversal!.toString())).toMatchObject({
      type: 'MANUAL_REVERSAL',
      direction: 'IN',
      reversalOfId: travel!.toString(),
      reversedById: null,
    });
    // Same report day → newest entry first; the last one carries the balance.
    expect(page.items[0]!.id).toBe(reversal!.toString());
    const cashBox = (await cashQueries.balances(ctxFor('OWNER')))[0]!;
    expect(page.items.find((item) => item.cashbox.type === 'CASH')!.balanceAfter).toBe(
      cashBox.balance,
    );
  });

  it('orders by report date, newest first, and filters by store-zone days (OQ-24)', async () => {
    const [d10, lateD10, earlyD11, d12, sameD10] = await book(
      { type: 'TRAVEL_EXPENSE', amount: 1_000, txDate: day('2025-03-10') },
      // 23:59 and 00:00 Tashkent time around the 10/11 boundary.
      { type: 'TRAVEL_EXPENSE', amount: 2_000, txDate: new Date('2025-03-10T18:59:59Z') },
      { type: 'TRAVEL_EXPENSE', amount: 4_000, txDate: new Date('2025-03-10T19:00:00Z') },
      { type: 'TRAVEL_EXPENSE', amount: 8_000, txDate: day('2025-03-12') },
      // Booked last, same tx_date as the first: the id breaks the tie.
      { type: 'TRAVEL_EXPENSE', amount: 16_000, txDate: day('2025-03-10') },
    );
    const ids = async (query: Parameters<typeof cashQueries.journal>[1]) =>
      (await cashQueries.journal(ctxFor('OWNER'), query)).items.map((item) => item.id);
    const s = (...list: (bigint | undefined)[]) => list.map((id) => id!.toString());

    expect(await ids({ to: '2025-03-31' })).toEqual(s(d12, earlyD11, lateD10, sameD10, d10));
    expect(await ids({ from: '2025-03-10', to: '2025-03-10' })).toEqual(s(lateD10, sameD10, d10));
    expect(await ids({ from: '2025-03-11', to: '2025-03-11' })).toEqual(s(earlyD11));
    expect(await ids({ from: '2025-03-11', to: '2025-03-12' })).toEqual(s(d12, earlyD11));
    // Open-ended: the fixture's opening entry (today) comes in with `from` only.
    expect(await ids({ from: '2025-03-12' })).toHaveLength(2);
    expect(await ids({ from: '2025-03-13', to: '2025-03-12' })).toEqual([]);
  });

  it('filters by cashbox, type and direction, with totals over all pages', async () => {
    await book(
      { type: 'SALE_RECEIPT', amount: 25_000 },
      { box: 'CARD', type: 'SALE_RECEIPT', amount: 40_000 },
      { box: 'CARD', type: 'PURCHASE_PAYMENT', amount: 15_000 },
      { type: 'TRAVEL_EXPENSE', amount: 5_000 },
      { type: 'OTHER_EXPENSE', amount: 7_000, note: 'Suv' },
    );
    const ctx = ctxFor('OWNER');
    const summary = async (query: Parameters<typeof cashQueries.journal>[1]) => {
      const page = await cashQueries.journal(ctx, query);
      return { types: page.items.map((item) => item.type), totals: page.totals, total: page.total };
    };

    expect(await summary({})).toEqual({
      types: [
        'OTHER_EXPENSE',
        'TRAVEL_EXPENSE',
        'PURCHASE_PAYMENT',
        'SALE_RECEIPT',
        'SALE_RECEIPT',
        'DEBT_TAKEN',
      ],
      totals: { in: 165_000, out: 27_000 },
      total: 6,
    });
    expect(await summary({ cashbox: 'CARD' })).toEqual({
      types: ['PURCHASE_PAYMENT', 'SALE_RECEIPT'],
      totals: { in: 40_000, out: 15_000 },
      total: 2,
    });
    expect(await summary({ type: 'SALE_RECEIPT' })).toMatchObject({
      totals: { in: 65_000, out: 0 },
      total: 2,
    });
    expect(await summary({ direction: 'OUT', cashbox: 'CASH' })).toEqual({
      types: ['OTHER_EXPENSE', 'TRAVEL_EXPENSE'],
      totals: { in: 0, out: 12_000 },
      total: 2,
    });
    expect(await summary({ type: 'TRANSFER_IN' })).toEqual({
      types: [],
      totals: { in: 0, out: 0 },
      total: 0,
    });
  });

  it('pages by CASH_JOURNAL_PAGE_SIZE, newest first', async () => {
    const amounts = Array.from({ length: CASH_JOURNAL_PAGE_SIZE + 4 }, (_, i) => i + 1);
    await withTransaction(async (tx) => {
      const box = await lockOne(tx, 'CARD');
      for (const amount of amounts) {
        await cash.record(tx, ctxFor('OWNER'), box, { type: 'SALE_RECEIPT', amount });
      }
    });
    const ctx = ctxFor('OWNER');
    const first = await cashQueries.journal(ctx, { cashbox: 'CARD' });
    const second = await cashQueries.journal(ctx, { cashbox: 'CARD', page: 2 });

    expect(first).toMatchObject({
      total: amounts.length,
      page: 1,
      pageSize: CASH_JOURNAL_PAGE_SIZE,
    });
    expect(first.items).toHaveLength(CASH_JOURNAL_PAGE_SIZE);
    expect(first.items[0]!.amount).toBe(amounts.length);
    expect(second.items.map((item) => item.amount)).toEqual([4, 3, 2, 1]);
    const sum = amounts.reduce((a, b) => a + b, 0);
    expect(second.totals).toEqual({ in: sum, out: 0 });
    expect(first.items[0]!.balanceAfter).toBe(sum);
    expect((await cashQueries.journal(ctx, { cashbox: 'CARD', page: 9 })).items).toEqual([]);
  });
});
