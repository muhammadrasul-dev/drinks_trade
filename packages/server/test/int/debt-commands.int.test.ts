// T-704: the debts screen services (debtCommands.open / repay, debtQueries)
// against a real Postgres. Each test builds its own store (CASH opening
// balance 100 000, CARD empty). After each test: stock/cash invariants and
// debt consistency (repaid_amount = Σ repayments, CLOSED ⇔ fully repaid).
import { prisma } from '@drinks/db';
import { assertInvariants, makeStoreFixture, type StoreFixture } from '@drinks/db/test-utils';
import {
  type DebtDirection,
  DomainError,
  ErrorCode,
  storeToday,
  type UserRole,
} from '@drinks/shared';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  debtCommands,
  debtQueries,
  debts,
  lockCashboxes,
  lockDebt,
  type ServiceContext,
  withTransaction,
} from '../../src/index';

let f: StoreFixture;
let owner: ServiceContext;
const today = () => storeToday();

function ctxFor(role: UserRole, fixture: StoreFixture = f): ServiceContext {
  const user = role === 'OWNER' ? fixture.owner : fixture.staff;
  return {
    user: { id: user.id, role, locale: 'uz' },
    storeId: fixture.store.id,
    organizationId: fixture.organization.id,
    requestId: `req-t704-${role}`,
  };
}

beforeEach(async () => {
  f = await makeStoreFixture(prisma, { cashBalance: 100_000n });
  owner = ctxFor('OWNER');
});

afterEach(async () => {
  await assertInvariants(prisma);
  const broken = await prisma.$queryRaw<{ id: string }[]>`
    SELECT d.id::text AS id
      FROM debt d
      LEFT JOIN (SELECT debt_id, SUM(amount) AS total FROM debt_repayment GROUP BY debt_id) r
        ON r.debt_id = d.id
     WHERE d.repaid_amount <> COALESCE(r.total, 0)
        OR (d.status = 'CLOSED') <> (d.repaid_amount = d.amount AND d.status <> 'CANCELLED')`;
  expect(broken).toEqual([]);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const balanceOf = async (id: string) =>
  (await prisma.cashbox.findUniqueOrThrow({ where: { id } })).balance;

const debtOf = (id: string) => prisma.debt.findUniqueOrThrow({ where: { id } });

async function caught(promise: Promise<unknown>): Promise<DomainError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error('expected a rejection');
}

function give(amount: number, note = 'Aziz aka', direction: DebtDirection = 'RECEIVABLE') {
  return debtCommands.open(owner, { direction, cashbox: 'CASH', amount, note, date: today() });
}

describe('RBAC (CLAUDE.md rule 6)', () => {
  it('STAFF is refused on every debt endpoint and nothing is written', async () => {
    const opened = await give(10_000);
    const staff = ctxFor('STAFF');
    const before = await prisma.cashTransaction.count();

    const errors = await Promise.all([
      caught(debtQueries.list(staff)),
      caught(debtQueries.totals(staff)),
      caught(
        debtCommands.open(staff, {
          direction: 'PAYABLE',
          cashbox: 'CASH',
          amount: 5_000,
          note: 'x',
          date: today(),
        }),
      ),
      caught(
        debtCommands.repay(staff, {
          debtId: opened.id,
          cashbox: 'CASH',
          amount: 5_000,
          date: today(),
        }),
      ),
    ]);

    for (const error of errors) expect(error.code).toBe(ErrorCode.FORBIDDEN);
    expect(await prisma.cashTransaction.count()).toBe(before);
    expect(await debtOf(opened.id)).toMatchObject({ repaidAmount: 0n });
  });
});

describe('debtCommands.open', () => {
  it('BR-10: giving a debt is a DEBT_GIVEN cash OUT on the picked cashbox', async () => {
    const { id } = await give(30_000);

    expect(await debtOf(id)).toMatchObject({
      direction: 'RECEIVABLE',
      source: 'MANUAL',
      status: 'OPEN',
      amount: 30_000n,
      note: 'Aziz aka',
      createdById: f.owner.id,
    });
    const entry = await prisma.cashTransaction.findFirstOrThrow({ where: { debtId: id } });
    expect(entry).toMatchObject({ type: 'DEBT_GIVEN', direction: 'OUT', balanceAfter: 70_000n });
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(70_000n);
  });

  it('BR-10: taking a debt is a DEBT_TAKEN cash IN', async () => {
    const { id } = await debtCommands.open(owner, {
      direction: 'PAYABLE',
      cashbox: 'CARD',
      amount: 50_000,
      note: '  Bank  ',
      date: today(),
    });

    expect(await debtOf(id)).toMatchObject({ direction: 'PAYABLE', note: 'Bank' });
    expect(await prisma.cashTransaction.findFirstOrThrow({ where: { debtId: id } })).toMatchObject({
      type: 'DEBT_TAKEN',
      direction: 'IN',
      cashboxId: f.cashboxes.card.id,
    });
    expect(await balanceOf(f.cashboxes.card.id)).toBe(50_000n);
  });

  it('BR-10: a blank note is NOTE_REQUIRED and nothing is written', async () => {
    const error = await caught(give(10_000, '   '));

    expect(error.code).toBe(ErrorCode.NOTE_REQUIRED);
    expect(await prisma.debt.count({ where: { storeId: f.store.id } })).toBe(0);
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(100_000n);
  });

  it('BR-9: cash cannot go negative — giving more than the cashbox holds rolls back', async () => {
    const error = await caught(give(100_001));

    expect(error.code).toBe(ErrorCode.CASHBOX_INSUFFICIENT);
    expect(error.params).toEqual({ cashbox: 'CASH' });
    expect(await prisma.debt.count({ where: { storeId: f.store.id } })).toBe(0);
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(100_000n);
  });

  it('OQ-07: a past day is booked at noon, a future day is refused', async () => {
    const { id } = await debtCommands.open(owner, {
      direction: 'RECEIVABLE',
      cashbox: 'CASH',
      amount: 1_000,
      note: 'Eski qarz',
      date: '2026-10-01',
    });
    const debt = await debtOf(id);
    expect(debt.debtDate.toISOString()).toBe('2026-10-01T07:00:00.000Z');
    expect(
      (await prisma.cashTransaction.findFirstOrThrow({ where: { debtId: id } })).txDate,
    ).toEqual(debt.debtDate);

    const error = await caught(
      debtCommands.open(owner, {
        direction: 'RECEIVABLE',
        cashbox: 'CASH',
        amount: 1_000,
        note: 'Kelajak',
        date: '2999-01-01',
      }),
    );
    expect(error.code).toBe(ErrorCode.DOC_DATE_IN_FUTURE);
  });

  it('rejects invalid input with VALIDATION_FAILED', async () => {
    const error = await caught(
      debtCommands.open(owner, {
        direction: 'RECEIVABLE',
        cashbox: 'CASH',
        amount: 0,
        note: 'x',
        date: 'yesterday',
      }),
    );
    expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(Object.keys(error.fieldErrors ?? {}).sort()).toEqual(['amount', 'date']);
  });
});

describe('debtCommands.repay', () => {
  it('§7: a partial then the final repayment of a debt given — IN entries, CLOSED at the end', async () => {
    const { id } = await give(30_000);

    // FR-7.2: the user picks the cashbox — the money may come back by card.
    const first = await debtCommands.repay(owner, {
      debtId: id,
      cashbox: 'CARD',
      amount: 10_000,
      note: 'Birinchi qism',
      date: today(),
    });
    expect(first).toMatchObject({ repaidAmount: 10_000, status: 'OPEN' });
    expect(await debtOf(id)).toMatchObject({ repaidAmount: 10_000n, status: 'OPEN' });
    expect(
      await prisma.cashTransaction.findUniqueOrThrow({ where: { id: first.cashTransactionId } }),
    ).toMatchObject({
      type: 'DEBT_REPAID_TO_ME',
      direction: 'IN',
      cashboxId: f.cashboxes.card.id,
      amount: 10_000n,
      debtId: id,
      note: 'Birinchi qism',
    });
    expect(await prisma.debtRepayment.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject(
      {
        debtId: id,
        amount: 10_000n,
        cashTransactionId: first.cashTransactionId,
        note: 'Birinchi qism',
        createdById: f.owner.id,
      },
    );

    const last = await debtCommands.repay(owner, {
      debtId: id,
      cashbox: 'CASH',
      amount: 20_000,
      date: today(),
    });
    expect(last).toMatchObject({ repaidAmount: 30_000, status: 'CLOSED' });
    expect(await debtOf(id)).toMatchObject({ repaidAmount: 30_000n, status: 'CLOSED' });
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(90_000n);
    expect(await balanceOf(f.cashboxes.card.id)).toBe(10_000n);

    const logs = await prisma.auditLog.findMany({
      where: { entityId: { in: [id, first.id, last.id] }, action: { not: 'CREATE' } },
      orderBy: { id: 'asc' },
    });
    expect(logs.map((log) => [log.entityType, log.action, log.after])).toEqual([
      ['debt', 'UPDATE', { repaidAmount: 10_000, status: 'OPEN' }],
      ['debt', 'UPDATE', { repaidAmount: 30_000, status: 'CLOSED' }],
    ]);
    expect(
      await prisma.auditLog.count({
        where: {
          entityType: 'debt_repayment',
          action: 'CREATE',
          entityId: { in: [first.id, last.id] },
        },
      }),
    ).toBe(2);
  });

  it('§7: repaying a debt taken is a DEBT_REPAID_BY_ME cash OUT', async () => {
    const { id } = await give(40_000, 'Bank', 'PAYABLE');

    const result = await debtCommands.repay(owner, {
      debtId: id,
      cashbox: 'CASH',
      amount: 40_000,
      date: today(),
    });

    expect(result.status).toBe('CLOSED');
    expect(
      await prisma.cashTransaction.findUniqueOrThrow({ where: { id: result.cashTransactionId } }),
    ).toMatchObject({ type: 'DEBT_REPAID_BY_ME', direction: 'OUT', balanceAfter: 100_000n });
  });

  it('BR-9: cash cannot go negative — repaying beyond the balance rolls back', async () => {
    const { id } = await debtCommands.open(owner, {
      direction: 'PAYABLE',
      cashbox: 'CASH',
      amount: 50_000,
      note: 'Bank',
      date: today(),
    });

    const error = await caught(
      debtCommands.repay(owner, { debtId: id, cashbox: 'CARD', amount: 1, date: today() }),
    );

    expect(error.code).toBe(ErrorCode.CASHBOX_INSUFFICIENT);
    expect(error.params).toEqual({ cashbox: 'CARD' });
    expect(await debtOf(id)).toMatchObject({ repaidAmount: 0n, status: 'OPEN' });
    expect(await prisma.debtRepayment.count({ where: { debtId: id } })).toBe(0);
  });

  it('BR-10: overpayment is DEBT_OVERPAYMENT, also on a CLOSED debt', async () => {
    const { id } = await give(30_000);
    await debtCommands.repay(owner, { debtId: id, cashbox: 'CASH', amount: 25_000, date: today() });

    const over = await caught(
      debtCommands.repay(owner, { debtId: id, cashbox: 'CASH', amount: 5_001, date: today() }),
    );
    expect(over.code).toBe(ErrorCode.DEBT_OVERPAYMENT);
    expect(over.params).toBeUndefined();

    await debtCommands.repay(owner, { debtId: id, cashbox: 'CASH', amount: 5_000, date: today() });
    const closed = await caught(
      debtCommands.repay(owner, { debtId: id, cashbox: 'CASH', amount: 1, date: today() }),
    );
    expect(closed.code).toBe(ErrorCode.DEBT_OVERPAYMENT);
    expect(await debtOf(id)).toMatchObject({ repaidAmount: 30_000n, status: 'CLOSED' });
  });

  it('two repayments racing for the same remainder: one wins, the other is DEBT_OVERPAYMENT', async () => {
    const { id } = await give(30_000);

    const results = await Promise.allSettled([
      debtCommands.repay(owner, { debtId: id, cashbox: 'CASH', amount: 20_000, date: today() }),
      debtCommands.repay(owner, { debtId: id, cashbox: 'CARD', amount: 20_000, date: today() }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect((rejected as PromiseRejectedResult).reason).toMatchObject({
      code: ErrorCode.DEBT_OVERPAYMENT,
    });
    expect(await debtOf(id)).toMatchObject({ repaidAmount: 20_000n, status: 'OPEN' });
  });

  it('a credit purchase debt is repaid the same way (§7)', async () => {
    const purchase = await prisma.purchase.create({
      data: { storeId: f.store.id, number: 'P-T704', docDate: new Date(), createdById: f.staff.id },
    });
    const debt = await withTransaction((tx) =>
      debts.open(tx, owner, {
        source: 'PURCHASE',
        purchaseId: purchase.id,
        amount: 15_000,
        note: 'Ulgurji',
      }),
    );

    const result = await debtCommands.repay(owner, {
      debtId: debt.id,
      cashbox: 'CASH',
      amount: 15_000,
      date: today(),
    });

    expect(result.status).toBe('CLOSED');
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(85_000n);
  });

  it('a cancelled debt is DEBT_CANCELLED', async () => {
    const { id } = await give(10_000);
    await withTransaction(async (tx) => {
      const [box] = await lockCashboxes(tx, f.store.id, ['CASH']);
      await debts.cancel(tx, owner, await lockDebt(tx, f.store.id, id), { cashbox: box });
    });

    const error = await caught(
      debtCommands.repay(owner, { debtId: id, cashbox: 'CASH', amount: 1, date: today() }),
    );
    expect(error.code).toBe(ErrorCode.DEBT_CANCELLED);
  });

  it('OQ-27: a repayment dated before its debt is refused', async () => {
    const { id } = await debtCommands.open(owner, {
      direction: 'RECEIVABLE',
      cashbox: 'CASH',
      amount: 1_000,
      note: 'Eski qarz',
      date: '2026-10-10',
    });

    const error = await caught(
      debtCommands.repay(owner, { debtId: id, cashbox: 'CASH', amount: 500, date: '2026-10-09' }),
    );
    expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(error.fieldErrors).toHaveProperty('date');

    // The same day is fine, booked at noon like the debt itself.
    const result = await debtCommands.repay(owner, {
      debtId: id,
      cashbox: 'CASH',
      amount: 500,
      date: '2026-10-10',
    });
    expect(
      (await prisma.debtRepayment.findUniqueOrThrow({ where: { id: result.id } })).repaidAt,
    ).toEqual(new Date('2026-10-10T07:00:00.000Z'));
  });

  it("another store's debt is NOT_FOUND", async () => {
    const other = await makeStoreFixture(prisma, { cashBalance: 10_000n });
    const { id } = await debtCommands.open(ctxFor('OWNER', other), {
      direction: 'RECEIVABLE',
      cashbox: 'CASH',
      amount: 1_000,
      note: 'Boshqa do`kon',
      date: today(),
    });

    const error = await caught(
      debtCommands.repay(owner, { debtId: id, cashbox: 'CASH', amount: 1, date: today() }),
    );
    expect(error.code).toBe(ErrorCode.NOT_FOUND);
  });
});

describe('debtQueries', () => {
  it('FR-7.1: list shows amount, repaid, remaining, repayments; totals are open balances', async () => {
    const given = await give(30_000, 'Aziz aka');
    const taken = await give(50_000, 'Bank krediti', 'PAYABLE');
    const closed = await give(5_000, 'Sardor');
    await debtCommands.repay(owner, {
      debtId: given.id,
      cashbox: 'CARD',
      amount: 10_000,
      note: 'qism',
      date: today(),
    });
    await debtCommands.repay(owner, {
      debtId: closed.id,
      cashbox: 'CASH',
      amount: 5_000,
      date: today(),
    });
    const backdated = await debtCommands.open(owner, {
      direction: 'RECEIVABLE',
      cashbox: 'CASH',
      amount: 2_000,
      note: 'Eski',
      date: '2026-09-15',
    });
    // Another store's debt never shows.
    const other = await makeStoreFixture(prisma, { cashBalance: 10_000n });
    await debtCommands.open(ctxFor('OWNER', other), {
      direction: 'RECEIVABLE',
      cashbox: 'CASH',
      amount: 1_000,
      note: 'Aziz aka',
      date: today(),
    });

    const all = await debtQueries.list(owner);
    expect(all.total).toBe(4);
    expect(all.items.at(-1)!.id).toBe(backdated.id);
    const row = all.items.find((item) => item.id === given.id)!;
    expect(row).toMatchObject({
      direction: 'RECEIVABLE',
      source: 'MANUAL',
      status: 'OPEN',
      amount: 30_000,
      repaidAmount: 10_000,
      remaining: 20_000,
      note: 'Aziz aka',
      createdBy: { id: f.owner.id },
      repayments: [{ amount: 10_000, cashbox: 'CARD', note: 'qism' }],
    });

    const ids = async (query: Parameters<typeof debtQueries.list>[1]) =>
      (await debtQueries.list(owner, query)).items.map((item) => item.id).sort();
    expect(await ids({ direction: 'PAYABLE' })).toEqual([taken.id]);
    expect(await ids({ status: 'CLOSED' })).toEqual([closed.id]);
    expect(await ids({ status: 'OPEN', direction: 'RECEIVABLE' })).toEqual(
      [given.id, backdated.id].sort(),
    );
    expect(await ids({ source: 'PURCHASE' })).toEqual([]);
    expect(await ids({ search: 'aziz' })).toEqual([given.id]);
    expect(await ids({ from: '2026-09-15', to: '2026-09-15' })).toEqual([backdated.id]);

    expect(await debtQueries.totals(owner)).toEqual({ receivable: 22_000, payable: 50_000 });

    const invalid = await caught(debtQueries.list(owner, { status: 'LOST' as never }));
    expect(invalid.code).toBe(ErrorCode.VALIDATION_FAILED);
  });
});
