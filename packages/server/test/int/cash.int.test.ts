// T-402: cash core against a real Postgres. Each test builds its own store
// (CASH opening balance 100 000, CARD empty) and commits through
// withTransaction, so rollbacks are checked against committed state.
import { prisma } from '@drinks/db';
import { assertInvariants, makeStoreFixture, type StoreFixture } from '@drinks/db/test-utils';
import { type CashboxType, DomainError, ErrorCode, type UserRole } from '@drinks/shared';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  cash,
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

function ctxFor(role: UserRole): ServiceContext {
  const user = role === 'OWNER' ? f.owner : f.staff;
  return {
    user: { id: user.id, role, locale: 'uz' },
    storeId: f.store.id,
    organizationId: f.organization.id,
    requestId: `req-${role}`,
  };
}

async function lockOne(tx: Tx, type: CashboxType) {
  const [cashbox] = await lockCashboxes(tx, f.store.id, [type]);
  return cashbox!;
}

const balanceOf = async (id: string) =>
  (await prisma.cashbox.findUniqueOrThrow({ where: { id } })).balance;

/** The thrown error, so its fields can be inspected. */
async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

describe('cash.record', () => {
  it('BR-9: IN and OUT move the balance and store balance_after', async () => {
    const ctx = ctxFor('OWNER');
    const results = await withTransaction(async (tx) => {
      const box = await lockOne(tx, 'CASH');
      return [
        await cash.record(tx, ctx, box, { type: 'SALE_RECEIPT', amount: 25_000 }),
        await cash.record(tx, ctx, box, { type: 'PURCHASE_PAYMENT', amount: 40_000 }),
        await cash.record(tx, ctx, box, { type: 'TRAVEL_EXPENSE', amount: 5_000 }),
      ];
    });

    expect(results.map((r) => [r.direction, r.balanceAfter])).toEqual([
      ['IN', 125_000],
      ['OUT', 85_000],
      ['OUT', 80_000],
    ]);
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(80_000n);

    const rows = await prisma.cashTransaction.findMany({
      where: { id: { in: results.map((r) => r.id) } },
      orderBy: { id: 'asc' },
    });
    expect(rows.map((r) => [r.type, r.direction, r.amount, r.balanceAfter])).toEqual([
      ['SALE_RECEIPT', 'IN', 25_000n, 125_000n],
      ['PURCHASE_PAYMENT', 'OUT', 40_000n, 85_000n],
      ['TRAVEL_EXPENSE', 'OUT', 5_000n, 80_000n],
    ]);
    expect(rows.every((r) => r.storeId === f.store.id && r.createdById === f.owner.id)).toBe(true);
  });

  it('writes one audit row per entry', async () => {
    const ctx = ctxFor('OWNER');
    const { id } = await withTransaction(async (tx) =>
      cash.record(tx, ctx, await lockOne(tx, 'CARD'), { type: 'SALE_RECEIPT', amount: 7_000 }),
    );
    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'cash_transaction', storeId: f.store.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: 'CREATE',
      entityId: id.toString(),
      storeId: f.store.id,
      userId: f.owner.id,
      after: { type: 'SALE_RECEIPT', direction: 'IN', amount: '7000', balanceAfter: '7000' },
    });
  });

  it('BR-9: OUT may empty the cashbox exactly', async () => {
    const ctx = ctxFor('OWNER');
    const result = await withTransaction(async (tx) =>
      cash.record(tx, ctx, await lockOne(tx, 'CASH'), { type: 'DEBT_GIVEN', amount: 100_000 }),
    );
    expect(result.balanceAfter).toBe(0);
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(0n);
  });

  it('BR-9: OUT above the balance throws CASHBOX_INSUFFICIENT without any amount and rolls back', async () => {
    const ctx = ctxFor('STAFF');
    const error = await caught(
      withTransaction(async (tx) => {
        const box = await lockOne(tx, 'CASH');
        await cash.record(tx, ctx, box, { type: 'SALE_RECEIPT', amount: 1_000 });
        await cash.record(tx, ctx, box, { type: 'PURCHASE_PAYMENT', amount: 101_001 });
      }),
    );

    expect(error).toBeInstanceOf(DomainError);
    const domain = error as DomainError;
    expect(domain.code).toBe(ErrorCode.CASHBOX_INSUFFICIENT);
    expect(domain.params).toEqual({ cashbox: 'CASH' });
    expect(domain.fieldErrors).toBeUndefined();
    // Nothing a STAFF user sees may reveal the balance or the shortfall.
    expect(domain.message).not.toMatch(/\d/);
    expect(JSON.stringify(domain.params)).not.toMatch(/\d/);

    // The earlier IN of the same transaction is gone too.
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(100_000n);
    expect(await prisma.cashTransaction.count({ where: { storeId: f.store.id } })).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { entityType: 'cash_transaction', storeId: f.store.id },
      }),
    ).toBe(0);
  });

  it('BR-9: an empty cashbox rejects any OUT', async () => {
    const error = await caught(
      withTransaction(async (tx) =>
        cash.record(tx, ctxFor('OWNER'), await lockOne(tx, 'CARD'), {
          type: 'SALE_REFUND',
          amount: 1,
        }),
      ),
    );
    expect(error).toMatchObject({
      code: ErrorCode.CASHBOX_INSUFFICIENT,
      params: { cashbox: 'CARD' },
    });
    expect(await balanceOf(f.cashboxes.card.id)).toBe(0n);
  });

  it('BR-9: parallel OUTs never overdraw the cashbox', async () => {
    const ctx = ctxFor('OWNER');
    const spend = () =>
      withTransaction(async (tx) =>
        cash.record(tx, ctx, await lockOne(tx, 'CASH'), { type: 'TRAVEL_EXPENSE', amount: 60_000 }),
      );
    const outcomes = await Promise.allSettled([spend(), spend()]);

    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter((o) => o.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: ErrorCode.CASHBOX_INSUFFICIENT,
    });
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(40_000n);
  });

  it('BR-9: OTHER_EXPENSE without a note throws NOTE_REQUIRED', async () => {
    const error = await caught(
      withTransaction(async (tx) =>
        cash.record(tx, ctxFor('OWNER'), await lockOne(tx, 'CASH'), {
          type: 'OTHER_EXPENSE',
          amount: 1_000,
          note: '   ',
        }),
      ),
    );
    expect(error).toMatchObject({ code: ErrorCode.NOTE_REQUIRED });
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(100_000n);
  });

  it('OQ-08: MANUAL_REVERSAL takes the given direction and links the original entry', async () => {
    const ctx = ctxFor('OWNER');
    const { original, reversal } = await withTransaction(async (tx) => {
      const box = await lockOne(tx, 'CASH');
      const original = await cash.record(tx, ctx, box, {
        type: 'OTHER_EXPENSE',
        amount: 3_000,
        note: 'Ruchka',
      });
      const reversal = await cash.record(tx, ctx, box, {
        type: 'MANUAL_REVERSAL',
        direction: 'IN',
        amount: 3_000,
        reversalOfId: original.id,
      });
      return { original, reversal };
    });

    expect(reversal).toMatchObject({ direction: 'IN', balanceAfter: 100_000 });
    const row = await prisma.cashTransaction.findUniqueOrThrow({ where: { id: reversal.id } });
    expect(row.reversalOfId).toBe(original.id);
  });

  it('rejects non-positive or fractional amounts before touching the cashbox', async () => {
    for (const amount of [0, -5, 1.5]) {
      await expect(
        withTransaction(async (tx) =>
          cash.record(tx, ctxFor('OWNER'), await lockOne(tx, 'CASH'), {
            type: 'SALE_RECEIPT',
            amount,
          }),
        ),
      ).rejects.toBeInstanceOf(RangeError);
    }
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(100_000n);
  });
});
