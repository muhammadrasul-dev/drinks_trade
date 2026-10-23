// T-702: manual cash actions (cashCommands.travelExpense / otherExpense /
// transfer) against a real Postgres. Each test builds its own store (CASH
// opening balance 100 000 booked as one entry, CARD empty); stock/cash
// invariants after each.
import { prisma } from '@drinks/db';
import { assertInvariants, makeStoreFixture, type StoreFixture } from '@drinks/db/test-utils';
import { DomainError, ErrorCode, storeDateOf, storeToday, type UserRole } from '@drinks/shared';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cashCommands, type ServiceContext } from '../../src/index';

let f: StoreFixture;
let owner: ServiceContext;
let openingId: bigint;
const today = () => storeToday();
const yesterday = () => storeDateOf(new Date(Date.now() - 86_400_000));

function ctxFor(role: UserRole): ServiceContext {
  const user = role === 'OWNER' ? f.owner : f.staff;
  return {
    user: { id: user.id, role, locale: 'uz' },
    storeId: f.store.id,
    organizationId: f.organization.id,
    requestId: `req-t702-${role}`,
  };
}

beforeEach(async () => {
  f = await makeStoreFixture(prisma, { cashBalance: 100_000n });
  owner = ctxFor('OWNER');
  const opening = await prisma.cashTransaction.findFirstOrThrow({
    where: { storeId: f.store.id },
    select: { id: true },
  });
  openingId = opening.id;
});

afterEach(async () => {
  await assertInvariants(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const balanceOf = async (id: string) =>
  (await prisma.cashbox.findUniqueOrThrow({ where: { id } })).balance;

/** Entries written by the test (the fixture books the CASH opening balance first). */
const entriesOf = () =>
  prisma.cashTransaction.findMany({
    where: { storeId: f.store.id, id: { gt: openingId } },
    orderBy: { id: 'asc' },
  });

async function caught(promise: Promise<unknown>): Promise<DomainError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error('expected a rejection');
}

describe('RBAC (CLAUDE.md rule 6)', () => {
  it('STAFF is refused on every cash action and nothing is written', async () => {
    const staff = ctxFor('STAFF');
    const expense = { cashbox: 'CASH', amount: 1_000, note: 'x', date: today() } as const;

    const errors = await Promise.all([
      caught(cashCommands.travelExpense(staff, expense)),
      caught(cashCommands.otherExpense(staff, expense)),
      caught(
        cashCommands.transfer(staff, { from: 'CASH', to: 'CARD', amount: 1_000, date: today() }),
      ),
    ]);

    for (const error of errors) expect(error.code).toBe(ErrorCode.FORBIDDEN);
    expect(await entriesOf()).toEqual([]);
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(100_000n);
  });
});

describe('cashCommands.travelExpense', () => {
  it('BR-9: a TRAVEL_EXPENSE OUT with balance_after, note optional, audited', async () => {
    const first = await cashCommands.travelExpense(owner, {
      cashbox: 'CASH',
      amount: 15_000,
      date: today(),
    });
    const second = await cashCommands.travelExpense(owner, {
      cashbox: 'CASH',
      amount: 5_000,
      note: '  Taksi  ',
      date: today(),
    });

    const [a, b] = await entriesOf();
    expect(a).toMatchObject({
      id: BigInt(first.id),
      cashboxId: f.cashboxes.cash.id,
      type: 'TRAVEL_EXPENSE',
      direction: 'OUT',
      amount: 15_000n,
      balanceAfter: 85_000n,
      note: null,
      transferGroupId: null,
      createdById: f.owner.id,
    });
    expect(b).toMatchObject({ id: BigInt(second.id), balanceAfter: 80_000n, note: 'Taksi' });
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(80_000n);

    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'cash_transaction', entityId: { in: [first.id, second.id] } },
    });
    expect(logs).toHaveLength(2);
    for (const log of logs) {
      expect(log).toMatchObject({ action: 'CREATE', userId: f.owner.id, storeId: f.store.id });
    }
  });

  it('OQ-07: a past day is stored at 12:00 that day; a future day is refused', async () => {
    await cashCommands.travelExpense(owner, { cashbox: 'CASH', amount: 1_000, date: yesterday() });
    const [entry] = await entriesOf();
    expect(storeDateOf(entry!.txDate)).toBe(yesterday());

    const error = await caught(
      cashCommands.travelExpense(owner, { cashbox: 'CASH', amount: 1_000, date: '2999-01-01' }),
    );
    expect(error.code).toBe(ErrorCode.DOC_DATE_IN_FUTURE);
    expect(await entriesOf()).toHaveLength(1);
  });

  it('BR-9: more than the balance is CASHBOX_INSUFFICIENT and nothing is written', async () => {
    const error = await caught(
      cashCommands.travelExpense(owner, { cashbox: 'CARD', amount: 1, date: today() }),
    );
    expect(error.code).toBe(ErrorCode.CASHBOX_INSUFFICIENT);
    expect(error.params).toEqual({ cashbox: 'CARD' });
    expect(await entriesOf()).toEqual([]);
    expect(await balanceOf(f.cashboxes.card.id)).toBe(0n);
  });

  it('rejects invalid input with VALIDATION_FAILED', async () => {
    const error = await caught(
      cashCommands.travelExpense(owner, { cashbox: 'CASH', amount: 1.5, date: 'today' }),
    );
    expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(Object.keys(error.fieldErrors ?? {}).sort()).toEqual(['amount', 'date']);
  });
});

describe('cashCommands.otherExpense', () => {
  it('FR-6.2: an OTHER_EXPENSE OUT with its note', async () => {
    const { id } = await cashCommands.otherExpense(owner, {
      cashbox: 'CASH',
      amount: 40_000,
      note: 'Elektr uchun',
      date: today(),
    });
    expect(await entriesOf()).toMatchObject([
      {
        id: BigInt(id),
        type: 'OTHER_EXPENSE',
        direction: 'OUT',
        amount: 40_000n,
        balanceAfter: 60_000n,
        note: 'Elektr uchun',
      },
    ]);
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(60_000n);
  });

  it('FR-6.2: a missing or blank note is NOTE_REQUIRED and nothing is written', async () => {
    for (const note of [undefined, null, '', '   ']) {
      const error = await caught(
        cashCommands.otherExpense(owner, { cashbox: 'CASH', amount: 1_000, note, date: today() }),
      );
      expect(error.code).toBe(ErrorCode.NOTE_REQUIRED);
    }
    expect(await entriesOf()).toEqual([]);
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(100_000n);
  });

  it('BR-9: the cashbox never goes negative', async () => {
    const error = await caught(
      cashCommands.otherExpense(owner, {
        cashbox: 'CASH',
        amount: 100_001,
        note: 'Ortiqcha',
        date: today(),
      }),
    );
    expect(error.code).toBe(ErrorCode.CASHBOX_INSUFFICIENT);
    expect(await entriesOf()).toEqual([]);

    // Exactly the balance is fine: down to zero.
    await cashCommands.otherExpense(owner, {
      cashbox: 'CASH',
      amount: 100_000,
      note: 'Hammasi',
      date: today(),
    });
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(0n);
  });
});

describe('cashCommands.transfer', () => {
  it('FR-6.3: TRANSFER_OUT + TRANSFER_IN with one transfer_group_id, both balances move', async () => {
    const result = await cashCommands.transfer(owner, {
      from: 'CASH',
      to: 'CARD',
      amount: 30_000,
      note: 'Bankka',
      date: yesterday(),
    });

    const entries = await entriesOf();
    expect(entries).toHaveLength(2);
    const [out, into] = entries;
    expect(out).toMatchObject({
      id: BigInt(result.outId),
      cashboxId: f.cashboxes.cash.id,
      type: 'TRANSFER_OUT',
      direction: 'OUT',
      amount: 30_000n,
      balanceAfter: 70_000n,
      note: 'Bankka',
      transferGroupId: result.transferGroupId,
    });
    expect(into).toMatchObject({
      id: BigInt(result.inId),
      cashboxId: f.cashboxes.card.id,
      type: 'TRANSFER_IN',
      direction: 'IN',
      amount: 30_000n,
      balanceAfter: 30_000n,
      note: 'Bankka',
      transferGroupId: result.transferGroupId,
    });
    expect(into!.txDate).toEqual(out!.txDate);
    expect(storeDateOf(out!.txDate)).toBe(yesterday());
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(70_000n);
    expect(await balanceOf(f.cashboxes.card.id)).toBe(30_000n);
    expect(
      await prisma.auditLog.count({
        where: {
          entityType: 'cash_transaction',
          action: 'CREATE',
          entityId: { in: [result.outId, result.inId] },
        },
      }),
    ).toBe(2);

    // And back: CARD → CASH, a new group.
    const back = await cashCommands.transfer(owner, {
      from: 'CARD',
      to: 'CASH',
      amount: 30_000,
      date: today(),
    });
    expect(back.transferGroupId).not.toBe(result.transferGroupId);
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(100_000n);
    expect(await balanceOf(f.cashboxes.card.id)).toBe(0n);
  });

  it('BR-9: a short source is CASHBOX_INSUFFICIENT and neither side is written', async () => {
    const error = await caught(
      cashCommands.transfer(owner, { from: 'CARD', to: 'CASH', amount: 1, date: today() }),
    );
    expect(error.code).toBe(ErrorCode.CASHBOX_INSUFFICIENT);
    expect(error.params).toEqual({ cashbox: 'CARD' });
    expect(await entriesOf()).toEqual([]);
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(100_000n);
    expect(await balanceOf(f.cashboxes.card.id)).toBe(0n);
  });

  it('§7: source = target is VALIDATION_FAILED on `to`', async () => {
    const error = await caught(
      cashCommands.transfer(owner, { from: 'CASH', to: 'CASH', amount: 1_000, date: today() }),
    );
    expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(Object.keys(error.fieldErrors ?? {})).toEqual(['to']);
    expect(await entriesOf()).toEqual([]);
  });

  it('OQ-07: a future day is refused', async () => {
    const error = await caught(
      cashCommands.transfer(owner, { from: 'CASH', to: 'CARD', amount: 1, date: '2999-01-01' }),
    );
    expect(error.code).toBe(ErrorCode.DOC_DATE_IN_FUTURE);
  });

  it('§2: concurrent transfers both ways do not deadlock and keep the balances exact', async () => {
    await cashCommands.transfer(owner, { from: 'CASH', to: 'CARD', amount: 50_000, date: today() });
    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        cashCommands.transfer(owner, {
          from: i % 2 ? 'CASH' : 'CARD',
          to: i % 2 ? 'CARD' : 'CASH',
          amount: 10_000,
          date: today(),
        }),
      ),
    );
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(50_000n);
    expect(await balanceOf(f.cashboxes.card.id)).toBe(50_000n);
    expect(await entriesOf()).toHaveLength(14);
  });
});
