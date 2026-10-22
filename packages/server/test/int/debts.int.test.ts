// T-403: debt core against a real Postgres. Each test builds its own store
// (CASH opening balance 100 000, CARD empty) and commits through
// withTransaction, so rollbacks are checked against committed state.
import { prisma } from '@drinks/db';
import { assertInvariants, makeStoreFixture, type StoreFixture } from '@drinks/db/test-utils';
import { type CashboxType, DomainError, ErrorCode } from '@drinks/shared';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  cash,
  debts,
  lockCashboxes,
  lockDebt,
  type ServiceContext,
  type Tx,
  withTransaction,
} from '../../src/index';

let f: StoreFixture;
let ctx: ServiceContext;

beforeEach(async () => {
  f = await makeStoreFixture(prisma, { cashBalance: 100_000n });
  ctx = {
    user: { id: f.owner.id, role: 'OWNER', locale: 'uz' },
    storeId: f.store.id,
    organizationId: f.organization.id,
    requestId: 'req-debts',
  };
});

afterEach(async () => {
  await assertInvariants(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function lockOne(tx: Tx, type: CashboxType) {
  const [cashbox] = await lockCashboxes(tx, f.store.id, [type]);
  return cashbox!;
}

const balanceOf = async (id: string) =>
  (await prisma.cashbox.findUniqueOrThrow({ where: { id } })).balance;

const debtOf = (id: string) => prisma.debt.findUniqueOrThrow({ where: { id } });

/** The thrown error, so its fields can be inspected. */
async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

/** A MANUAL debt committed on the CASH cashbox. */
function openManual(direction: 'RECEIVABLE' | 'PAYABLE', amount: number) {
  return withTransaction(async (tx) =>
    debts.open(tx, ctx, {
      source: 'MANUAL',
      direction,
      amount,
      note: 'Aziz aka',
      cashbox: await lockOne(tx, 'CASH'),
    }),
  );
}

/** Books a repayment the way T-704 will: cash entry + debt_repayment + repaid_amount. */
async function repay(debtId: string, amount: number) {
  await withTransaction(async (tx) => {
    const box = await lockOne(tx, 'CASH');
    const debt = await lockDebt(tx, f.store.id, debtId);
    const entry = await cash.record(tx, ctx, box, {
      type: debt.direction === 'RECEIVABLE' ? 'DEBT_REPAID_TO_ME' : 'DEBT_REPAID_BY_ME',
      amount,
      debtId,
    });
    await tx.debtRepayment.create({
      data: {
        debtId,
        amount: BigInt(amount),
        repaidAt: new Date(),
        cashTransactionId: entry.id,
        createdById: f.owner.id,
      },
    });
    const repaid = debt.repaidAmount + amount;
    await tx.debt.update({
      where: { id: debtId },
      data: { repaidAmount: BigInt(repaid), status: repaid === debt.amount ? 'CLOSED' : 'OPEN' },
    });
  });
}

describe('debts.open', () => {
  it('BR-10: debt given is RECEIVABLE with a DEBT_GIVEN cash OUT', async () => {
    const result = await openManual('RECEIVABLE', 30_000);

    expect(result.direction).toBe('RECEIVABLE');
    expect(await debtOf(result.id)).toMatchObject({
      storeId: f.store.id,
      direction: 'RECEIVABLE',
      source: 'MANUAL',
      status: 'OPEN',
      amount: 30_000n,
      repaidAmount: 0n,
      note: 'Aziz aka',
      createdById: f.owner.id,
    });
    const entry = await prisma.cashTransaction.findUniqueOrThrow({
      where: { id: result.cashTransactionId! },
    });
    expect(entry).toMatchObject({
      type: 'DEBT_GIVEN',
      direction: 'OUT',
      amount: 30_000n,
      balanceAfter: 70_000n,
      debtId: result.id,
      cashboxId: f.cashboxes.cash.id,
      note: 'Aziz aka',
    });
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(70_000n);

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: 'debt', entityId: result.id },
    });
    expect(log).toMatchObject({
      action: 'CREATE',
      userId: f.owner.id,
      after: { direction: 'RECEIVABLE', source: 'MANUAL', amount: '30000' },
    });
  });

  it('BR-10: debt taken is PAYABLE with a DEBT_TAKEN cash IN', async () => {
    const result = await withTransaction(async (tx) =>
      debts.open(tx, ctx, {
        source: 'MANUAL',
        direction: 'PAYABLE',
        amount: 50_000,
        note: 'Bank',
        cashbox: await lockOne(tx, 'CARD'),
      }),
    );

    expect(await debtOf(result.id)).toMatchObject({ direction: 'PAYABLE', status: 'OPEN' });
    const entry = await prisma.cashTransaction.findUniqueOrThrow({
      where: { id: result.cashTransactionId! },
    });
    expect(entry).toMatchObject({ type: 'DEBT_TAKEN', direction: 'IN', balanceAfter: 50_000n });
    expect(await balanceOf(f.cashboxes.card.id)).toBe(50_000n);
  });

  it('BR-10: credit parts of a sale and a purchase open debts without moving cash', async () => {
    const sale = await prisma.sale.create({
      data: { storeId: f.store.id, number: 'S-T403', docDate: new Date(), createdById: f.staff.id },
    });
    const purchase = await prisma.purchase.create({
      data: { storeId: f.store.id, number: 'P-T403', docDate: new Date(), createdById: f.staff.id },
    });
    const debtDate = new Date('2026-10-01T09:00:00Z');
    // STAFF posts documents, so it opens their debts too.
    const staff: ServiceContext = { ...ctx, user: { ...ctx.user, id: f.staff.id, role: 'STAFF' } };

    const [receivable, payable] = await withTransaction(async (tx) => [
      await debts.open(tx, staff, { source: 'SALE', saleId: sale.id, amount: 12_000, debtDate }),
      await debts.open(tx, staff, {
        source: 'PURCHASE',
        purchaseId: purchase.id,
        amount: 40_000,
        note: ' Ulgurji ',
        debtDate,
      }),
    ]);

    expect(receivable).toMatchObject({ direction: 'RECEIVABLE', cashTransactionId: null });
    expect(payable).toMatchObject({ direction: 'PAYABLE', cashTransactionId: null });
    expect(await debtOf(receivable!.id)).toMatchObject({
      source: 'SALE',
      saleId: sale.id,
      purchaseId: null,
      note: '',
      debtDate,
      createdById: f.staff.id,
    });
    expect(await debtOf(payable!.id)).toMatchObject({
      source: 'PURCHASE',
      purchaseId: purchase.id,
      note: 'Ulgurji',
    });
    expect(await prisma.cashTransaction.count({ where: { storeId: f.store.id } })).toBe(1);
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(100_000n);
  });

  it('BR-10: a MANUAL debt without a note throws NOTE_REQUIRED', async () => {
    const error = await caught(
      withTransaction(async (tx) =>
        debts.open(tx, ctx, {
          source: 'MANUAL',
          direction: 'PAYABLE',
          amount: 1_000,
          note: '  ',
          cashbox: await lockOne(tx, 'CASH'),
        }),
      ),
    );
    expect(error).toMatchObject({ code: ErrorCode.NOTE_REQUIRED });
    expect(await prisma.debt.count({ where: { storeId: f.store.id } })).toBe(0);
  });

  it('BR-9: giving more than the cashbox holds throws CASHBOX_INSUFFICIENT and rolls the debt back', async () => {
    const staff: ServiceContext = { ...ctx, user: { ...ctx.user, id: f.staff.id, role: 'STAFF' } };
    const error = await caught(
      withTransaction(async (tx) =>
        debts.open(tx, staff, {
          source: 'MANUAL',
          direction: 'RECEIVABLE',
          amount: 100_001,
          note: 'Qoʻshni',
          cashbox: await lockOne(tx, 'CASH'),
        }),
      ),
    );

    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({
      code: ErrorCode.CASHBOX_INSUFFICIENT,
      params: { cashbox: 'CASH' },
    });
    // CLAUDE.md rule 6: nothing in the error reveals an amount or a balance.
    expect(JSON.stringify(error) + (error as Error).message).not.toMatch(/\d/);

    expect(await prisma.debt.count({ where: { storeId: f.store.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { storeId: f.store.id } })).toBe(0);
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(100_000n);
  });

  it('rejects non-positive or fractional amounts', async () => {
    for (const amount of [0, -1, 2.5]) {
      await expect(
        withTransaction(async (tx) =>
          debts.open(tx, ctx, {
            source: 'MANUAL',
            direction: 'PAYABLE',
            amount,
            note: 'x',
            cashbox: await lockOne(tx, 'CASH'),
          }),
        ),
      ).rejects.toBeInstanceOf(RangeError);
    }
    expect(await prisma.debt.count({ where: { storeId: f.store.id } })).toBe(0);
  });
});

describe('debts.cancel', () => {
  it('OQ-08: cancelling a debt given reverses its DEBT_GIVEN entry', async () => {
    const opened = await openManual('RECEIVABLE', 30_000);

    const result = await withTransaction(async (tx) => {
      const box = await lockOne(tx, 'CASH');
      return debts.cancel(tx, ctx, await lockDebt(tx, f.store.id, opened.id), { cashbox: box });
    });

    expect((await debtOf(opened.id)).status).toBe('CANCELLED');
    const reversal = await prisma.cashTransaction.findUniqueOrThrow({
      where: { id: result.cashTransactionId! },
    });
    expect(reversal).toMatchObject({
      type: 'MANUAL_REVERSAL',
      direction: 'IN',
      amount: 30_000n,
      balanceAfter: 100_000n,
      reversalOfId: opened.cashTransactionId,
      debtId: opened.id,
    });
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(100_000n);

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: 'debt', entityId: opened.id, action: 'CANCEL' },
    });
    expect(log).toMatchObject({ before: { status: 'OPEN' }, after: { status: 'CANCELLED' } });
  });

  it('OQ-08: cancelling a debt taken is a cash OUT and needs the balance', async () => {
    const opened = await openManual('PAYABLE', 20_000);
    // Spend the borrowed money, leaving less than the debt in the cashbox.
    await withTransaction(async (tx) =>
      cash.record(tx, ctx, await lockOne(tx, 'CASH'), { type: 'TRAVEL_EXPENSE', amount: 110_000 }),
    );

    const cancel = () =>
      withTransaction(async (tx) => {
        const box = await lockOne(tx, 'CASH');
        return debts.cancel(tx, ctx, await lockDebt(tx, f.store.id, opened.id), { cashbox: box });
      });

    const error = await caught(cancel());
    expect(error).toMatchObject({
      code: ErrorCode.CASHBOX_INSUFFICIENT,
      params: { cashbox: 'CASH' },
    });
    // Rolled back: still OPEN, no reversal, no audit row.
    expect((await debtOf(opened.id)).status).toBe('OPEN');
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(10_000n);
    expect(
      await prisma.auditLog.count({
        where: { storeId: f.store.id, entityType: 'debt', action: 'CANCEL' },
      }),
    ).toBe(0);

    await withTransaction(async (tx) =>
      cash.record(tx, ctx, await lockOne(tx, 'CASH'), { type: 'SALE_RECEIPT', amount: 10_000 }),
    );
    const { cashTransactionId } = await cancel();
    expect(
      await prisma.cashTransaction.findUniqueOrThrow({ where: { id: cashTransactionId! } }),
    ).toMatchObject({ type: 'MANUAL_REVERSAL', direction: 'OUT', balanceAfter: 0n });
    expect((await debtOf(opened.id)).status).toBe('CANCELLED');
  });

  it('§5.3: a purchase debt is cancelled without moving cash', async () => {
    const purchase = await prisma.purchase.create({
      data: { storeId: f.store.id, number: 'P-T403', docDate: new Date(), createdById: f.owner.id },
    });
    const opened = await withTransaction(async (tx) =>
      debts.open(tx, ctx, { source: 'PURCHASE', purchaseId: purchase.id, amount: 8_000 }),
    );

    const result = await withTransaction(async (tx) =>
      debts.cancel(tx, ctx, await lockDebt(tx, f.store.id, opened.id)),
    );

    expect(result.cashTransactionId).toBeNull();
    expect((await debtOf(opened.id)).status).toBe('CANCELLED');
    expect(await prisma.cashTransaction.count({ where: { storeId: f.store.id } })).toBe(1);
  });

  it('OQ-04: a partly repaid debt cannot be cancelled', async () => {
    const opened = await openManual('RECEIVABLE', 30_000);
    await repay(opened.id, 10_000);

    const error = await caught(
      withTransaction(async (tx) => {
        const box = await lockOne(tx, 'CASH');
        return debts.cancel(tx, ctx, await lockDebt(tx, f.store.id, opened.id), { cashbox: box });
      }),
    );

    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({ code: ErrorCode.DEBT_HAS_REPAYMENTS });
    expect((error as DomainError).params).toBeUndefined();
    expect(await debtOf(opened.id)).toMatchObject({ status: 'OPEN', repaidAmount: 10_000n });
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(80_000n);
  });

  it('OQ-04: a fully repaid (CLOSED) debt cannot be cancelled', async () => {
    const sale = await prisma.sale.create({
      data: { storeId: f.store.id, number: 'S-T403', docDate: new Date(), createdById: f.owner.id },
    });
    const opened = await withTransaction(async (tx) =>
      debts.open(tx, ctx, { source: 'SALE', saleId: sale.id, amount: 5_000 }),
    );
    await repay(opened.id, 5_000);
    expect((await debtOf(opened.id)).status).toBe('CLOSED');

    await expect(
      withTransaction(async (tx) =>
        debts.cancel(tx, ctx, await lockDebt(tx, f.store.id, opened.id)),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.DEBT_HAS_REPAYMENTS });
    expect((await debtOf(opened.id)).status).toBe('CLOSED');
  });

  it('a cancelled debt cannot be cancelled again (DEBT_CANCELLED)', async () => {
    const opened = await openManual('RECEIVABLE', 1_000);
    const cancel = () =>
      withTransaction(async (tx) => {
        const box = await lockOne(tx, 'CASH');
        return debts.cancel(tx, ctx, await lockDebt(tx, f.store.id, opened.id), { cashbox: box });
      });

    // Two clicks at once: the debt lock serialises them, the second one sees CANCELLED.
    const outcomes = await Promise.allSettled([cancel(), cancel()]);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find((o) => o.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: ErrorCode.DEBT_CANCELLED });

    expect(
      await prisma.cashTransaction.count({ where: { debtId: opened.id, type: 'MANUAL_REVERSAL' } }),
    ).toBe(1);
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(100_000n);
  });

  it('a MANUAL debt needs the cashbox of its cash entry', async () => {
    const opened = await openManual('RECEIVABLE', 1_000);
    for (const type of [null, 'CARD'] as const) {
      await expect(
        withTransaction(async (tx) => {
          const box = type ? await lockOne(tx, type) : undefined;
          const debt = await lockDebt(tx, f.store.id, opened.id);
          return debts.cancel(tx, ctx, debt, box ? { cashbox: box } : {});
        }),
      ).rejects.toThrow(/locked cashbox/);
    }
    expect((await debtOf(opened.id)).status).toBe('OPEN');
  });
});
