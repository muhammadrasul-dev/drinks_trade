// T-703: reversal of manual cash entries (cashCommands.reverse, OQ-08,
// business-logic §7) against a real Postgres. Each test builds its own store
// (CASH opening balance 100 000 booked as one DEBT_TAKEN entry, CARD empty);
// stock/cash invariants after each.
import { prisma } from '@drinks/db';
import { assertInvariants, makeStoreFixture, type StoreFixture } from '@drinks/db/test-utils';
import { DomainError, ErrorCode, storeDateOf, storeToday, type UserRole } from '@drinks/shared';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cashCommands, debtCommands, type ServiceContext } from '../../src/index';

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
    requestId: `req-t703-${role}`,
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

const reversalsOf = () =>
  prisma.cashTransaction.findMany({
    where: { storeId: f.store.id, type: 'MANUAL_REVERSAL' },
    orderBy: { id: 'asc' },
  });

const countEntries = () => prisma.cashTransaction.count({ where: { storeId: f.store.id } });

async function caught(promise: Promise<unknown>): Promise<DomainError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error('expected a rejection');
}

const travel = (amount: number, date = today()) =>
  cashCommands.travelExpense(owner, { cashbox: 'CASH', amount, date });

describe('RBAC (CLAUDE.md rule 6)', () => {
  it('STAFF is FORBIDDEN and nothing is written', async () => {
    const { id } = await travel(10_000);
    const before = await countEntries();

    const error = await caught(cashCommands.reverse(ctxFor('STAFF'), { id }));

    expect(error.code).toBe(ErrorCode.FORBIDDEN);
    expect(await countEntries()).toBe(before);
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(90_000n);
  });
});

describe('cashCommands.reverse — expenses', () => {
  it('OQ-08: a travel expense gets an IN MANUAL_REVERSAL on its date; original kept; audited', async () => {
    const { id } = await travel(15_000, yesterday());
    const original = await prisma.cashTransaction.findUniqueOrThrow({ where: { id: BigInt(id) } });

    const result = await cashCommands.reverse(owner, { id, note: '  xato summa  ' });

    const [reversal] = await reversalsOf();
    expect(result.reversalIds).toEqual([reversal!.id.toString()]);
    expect(reversal).toMatchObject({
      cashboxId: f.cashboxes.cash.id,
      direction: 'IN',
      amount: 15_000n,
      balanceAfter: 100_000n,
      reversalOfId: BigInt(id),
      txDate: original.txDate,
      note: 'xato summa',
      createdById: f.owner.id,
    });
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(100_000n);
    // The original stays in the journal, now linked to its reversal.
    const kept = await prisma.cashTransaction.findUniqueOrThrow({
      where: { id: BigInt(id) },
      include: { reversedBy: { select: { id: true } } },
    });
    expect(kept).toMatchObject({ type: 'TRAVEL_EXPENSE', amount: 15_000n });
    expect(kept.reversedBy?.id).toBe(reversal!.id);

    const logs = await prisma.auditLog.findMany({
      where: {
        entityType: 'cash_transaction',
        entityId: { in: [id, reversal!.id.toString()] },
      },
      orderBy: { id: 'asc' },
    });
    expect(logs.map((log) => [log.entityId, log.action])).toEqual([
      [id, 'CREATE'],
      [reversal!.id.toString(), 'CREATE'],
      [id, 'REVERSE'],
    ]);
    expect(logs[2]).toMatchObject({ userId: f.owner.id, storeId: f.store.id });
  });

  it('BR-11: a reversed travel expense drops out of the P&L expense sum (§8 query)', async () => {
    const { id } = await travel(15_000);
    await travel(4_000);
    await cashCommands.reverse(owner, { id });

    const rows = await prisma.cashTransaction.findMany({
      where: { storeId: f.store.id, type: 'TRAVEL_EXPENSE', reversedBy: null },
      select: { amount: true },
    });
    expect(rows.reduce((sum, row) => sum + row.amount, 0n)).toBe(4_000n);
  });

  it('OQ-08: an other expense is reversed the same way', async () => {
    const { id } = await cashCommands.otherExpense(owner, {
      cashbox: 'CASH',
      amount: 30_000,
      note: 'Elektr',
      date: today(),
    });

    await cashCommands.reverse(owner, { id });

    const [reversal] = await reversalsOf();
    expect(reversal).toMatchObject({ direction: 'IN', amount: 30_000n, reversalOfId: BigInt(id) });
    expect(reversal!.note).toBeNull();
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(100_000n);
  });
});

describe('cashCommands.reverse — transfer', () => {
  it('FR-6.3: either side reverses the pair; both balances return', async () => {
    const t = await cashCommands.transfer(owner, {
      from: 'CASH',
      to: 'CARD',
      amount: 40_000,
      date: today(),
    });

    // Reversing through the IN side still takes the OUT side with it.
    const result = await cashCommands.reverse(owner, { id: t.inId });

    const reversals = await reversalsOf();
    expect(reversals).toHaveLength(2);
    expect(result.reversalIds).toEqual(reversals.map((row) => row.id.toString()));
    expect(reversals).toEqual([
      expect.objectContaining({
        cashboxId: f.cashboxes.cash.id,
        direction: 'IN',
        amount: 40_000n,
        reversalOfId: BigInt(t.outId),
        transferGroupId: null,
      }),
      expect.objectContaining({
        cashboxId: f.cashboxes.card.id,
        direction: 'OUT',
        amount: 40_000n,
        reversalOfId: BigInt(t.inId),
        balanceAfter: 0n,
      }),
    ]);
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(100_000n);
    expect(await balanceOf(f.cashboxes.card.id)).toBe(0n);
    const audits = await prisma.auditLog.findMany({
      where: { action: 'REVERSE', entityType: 'cash_transaction', storeId: f.store.id },
    });
    expect(audits.map((log) => log.entityId).sort()).toEqual([t.outId, t.inId].sort());
  });

  it('BR-9: the target no longer holds the amount → CASHBOX_INSUFFICIENT, nothing written', async () => {
    const t = await cashCommands.transfer(owner, {
      from: 'CASH',
      to: 'CARD',
      amount: 40_000,
      date: today(),
    });
    await cashCommands.travelExpense(owner, { cashbox: 'CARD', amount: 10_000, date: today() });
    const before = await countEntries();

    const error = await caught(cashCommands.reverse(owner, { id: t.outId }));

    expect(error.code).toBe(ErrorCode.CASHBOX_INSUFFICIENT);
    expect(error.params).toEqual({ cashbox: 'CARD' });
    expect(await countEntries()).toBe(before);
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(60_000n);
    expect(await balanceOf(f.cashboxes.card.id)).toBe(30_000n);
    expect(await prisma.auditLog.count({ where: { action: 'REVERSE', storeId: f.store.id } })).toBe(
      0,
    );
  });
});

describe('cashCommands.reverse — refusals', () => {
  it('sale/purchase/debt entries are CASH_TX_NOT_REVERSIBLE', async () => {
    const debt = await debtCommands.open(owner, {
      direction: 'RECEIVABLE',
      cashbox: 'CASH',
      amount: 5_000,
      note: 'Ali',
      date: today(),
    });
    const debtEntry = await prisma.cashTransaction.findFirstOrThrow({
      where: { debtId: debt.id },
    });
    const before = await countEntries();

    for (const id of [openingId, debtEntry.id]) {
      const error = await caught(cashCommands.reverse(owner, { id: id.toString() }));
      expect(error.code).toBe(ErrorCode.CASH_TX_NOT_REVERSIBLE);
    }
    expect(await countEntries()).toBe(before);
  });

  it('a MANUAL_REVERSAL itself is CASH_TX_NOT_REVERSIBLE', async () => {
    const { id } = await travel(1_000);
    const {
      reversalIds: [reversalId],
    } = await cashCommands.reverse(owner, { id });

    const error = await caught(cashCommands.reverse(owner, { id: reversalId! }));
    expect(error.code).toBe(ErrorCode.CASH_TX_NOT_REVERSIBLE);
  });

  it('a second reversal is CASH_TX_ALREADY_REVERSED (transfer: from either side)', async () => {
    const { id } = await travel(1_000);
    const t = await cashCommands.transfer(owner, {
      from: 'CASH',
      to: 'CARD',
      amount: 2_000,
      date: today(),
    });
    await cashCommands.reverse(owner, { id });
    await cashCommands.reverse(owner, { id: t.outId });
    const before = await countEntries();

    for (const again of [id, t.outId, t.inId]) {
      const error = await caught(cashCommands.reverse(owner, { id: again }));
      expect(error.code).toBe(ErrorCode.CASH_TX_ALREADY_REVERSED);
    }
    expect(await countEntries()).toBe(before);
  });

  it('missing or other-store entry is NOT_FOUND; a bad id is VALIDATION_FAILED', async () => {
    const other = await makeStoreFixture(prisma, { cashBalance: 10_000n });
    const otherOwner: ServiceContext = { ...owner, storeId: other.store.id };
    const foreign = await cashCommands.travelExpense(otherOwner, {
      cashbox: 'CASH',
      amount: 1_000,
      date: today(),
    });

    expect((await caught(cashCommands.reverse(owner, { id: foreign.id }))).code).toBe(
      ErrorCode.NOT_FOUND,
    );
    expect((await caught(cashCommands.reverse(owner, { id: '999999999' }))).code).toBe(
      ErrorCode.NOT_FOUND,
    );
    for (const id of ['0', 'abc', '-1', '1.5']) {
      expect((await caught(cashCommands.reverse(owner, { id }))).code).toBe(
        ErrorCode.VALIDATION_FAILED,
      );
    }
  });
});

describe('cashCommands.reverse — concurrency (§2)', () => {
  it('two parallel reversals of one entry: one wins, the other is CASH_TX_ALREADY_REVERSED', async () => {
    const t = await cashCommands.transfer(owner, {
      from: 'CASH',
      to: 'CARD',
      amount: 20_000,
      date: today(),
    });

    const results = await Promise.allSettled([
      cashCommands.reverse(owner, { id: t.outId }),
      cashCommands.reverse(owner, { id: t.inId }),
      cashCommands.reverse(owner, { id: t.outId }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(DomainError);
      expect((r.reason as DomainError).code).toBe(ErrorCode.CASH_TX_ALREADY_REVERSED);
    }
    expect(await reversalsOf()).toHaveLength(2);
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(100_000n);
    expect(await balanceOf(f.cashboxes.card.id)).toBe(0n);
  });

  it('reversals of different entries on both cashboxes run in parallel without deadlock', async () => {
    const a = await travel(1_000);
    const b = await cashCommands.travelExpense(owner, {
      cashbox: 'CASH',
      amount: 2_000,
      date: today(),
    });
    const t1 = await cashCommands.transfer(owner, {
      from: 'CASH',
      to: 'CARD',
      amount: 3_000,
      date: today(),
    });
    const t2 = await cashCommands.transfer(owner, {
      from: 'CASH',
      to: 'CARD',
      amount: 4_000,
      date: today(),
    });

    await Promise.all([
      cashCommands.reverse(owner, { id: a.id }),
      cashCommands.reverse(owner, { id: t1.inId }),
      cashCommands.reverse(owner, { id: b.id }),
      cashCommands.reverse(owner, { id: t2.outId }),
    ]);

    expect(await reversalsOf()).toHaveLength(6);
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(100_000n);
    expect(await balanceOf(f.cashboxes.card.id)).toBe(0n);
  });
});
