// T-406: reversing a posted purchase (BR-3, business-logic §5.3) against a
// real Postgres. Each test builds its own store: one warehouse with one
// sub-warehouse, CASH opening balance 1 000 000, CARD 100 000.
import { prisma } from '@drinks/db';
import {
  assertInvariants,
  makeProduct,
  makeStoreFixture,
  makeWarehouse,
  type StoreFixture,
} from '@drinks/db/test-utils';
import { ErrorCode, storeToday } from '@drinks/shared';
import type { PurchaseDraftInput } from '@drinks/shared/schemas';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  cash,
  inventory,
  lockCashboxes,
  lockDebt,
  purchases,
  type ServiceContext,
  withTransaction,
} from '../../src/index';

let f: StoreFixture;
let owner: ServiceContext;
let staff: ServiceContext;
let productId: string;

beforeEach(async () => {
  f = await makeStoreFixture(prisma, { cashBalance: 1_000_000n });
  owner = {
    user: { id: f.owner.id, role: 'OWNER', locale: 'uz' },
    storeId: f.store.id,
    organizationId: f.organization.id,
    requestId: 'req-purchase-reverse',
  };
  staff = { ...owner, user: { id: f.staff.id, role: 'STAFF', locale: 'uz' } };
  productId = (await makeProduct(prisma, { organizationId: f.organization.id, unitsPerBlock: 6 }))
    .id;
  await fund(f.cashboxes.card.id, 100_000n);
});

afterEach(async () => {
  await assertInvariants(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** `YYYY-MM-DD` `days` days from today in the store zone. */
function day(days: number): string {
  const [y, m, d] = storeToday().split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

type Line = PurchaseDraftInput['lines'][number];

function line(patch: Partial<Line> = {}): Line {
  return {
    productId,
    subWarehouseId: f.subWarehouse.id,
    inputUnit: 'PIECE',
    inputQty: 10,
    inputPrice: 10_000,
    ...patch,
  };
}

/** 10 pieces × 10 000 = 100 000, paid in cash by default. */
function draft(patch: Partial<PurchaseDraftInput> = {}): PurchaseDraftInput {
  return {
    docDate: day(0),
    note: null,
    lines: [line()],
    paidCash: 100_000,
    paidCard: 0,
    paidCredit: 0,
    ...patch,
  };
}

async function createAndPost(input: PurchaseDraftInput) {
  const created = await purchases.create(staff, input);
  return purchases.post(staff, { id: created.id, version: created.version });
}

/** Tops up a cashbox the way the fixture does (IN entry + balance), keeping the invariant. */
async function fund(cashboxId: string, amount: bigint) {
  const box = await prisma.cashbox.update({
    where: { id: cashboxId },
    data: { balance: { increment: amount } },
  });
  await prisma.cashTransaction.create({
    data: {
      storeId: f.store.id,
      cashboxId,
      direction: 'IN',
      type: 'DEBT_TAKEN',
      amount,
      balanceAfter: box.balance,
      txDate: new Date(),
      note: 'test top-up',
      createdById: f.owner.id,
    },
  });
}

/** Sells `qty` pieces the way sale posting (T-502) will: inventory.issue(SALE). */
async function sell(subWarehouseId: string, qty: number) {
  await withTransaction((tx) =>
    inventory.issue(tx, owner, {
      type: 'SALE',
      docDate: new Date(),
      lines: [{ subWarehouseId, productId, qty }],
    }),
  );
}

/** Books a repayment the way T-704 will: cash entry + debt_repayment + repaid_amount. */
async function repay(debtId: string, amount: number) {
  await withTransaction(async (tx) => {
    const [box] = await lockCashboxes(tx, f.store.id, ['CASH']);
    const debt = await lockDebt(tx, f.store.id, debtId);
    const entry = await cash.record(tx, owner, box!, {
      type: 'DEBT_REPAID_BY_ME',
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

const balanceOf = async (id: string) =>
  (await prisma.cashbox.findUniqueOrThrow({ where: { id } })).balance;

const costOf = () =>
  prisma.productCost.findUniqueOrThrow({
    where: { storeId_productId: { storeId: f.store.id, productId } },
  });

const stockOf = async (subWarehouseId: string) =>
  (
    await prisma.stockBalance.findUnique({
      where: { subWarehouseId_productId: { subWarehouseId, productId } },
    })
  )?.qty ?? 0;

/** The reversal wrote nothing: still POSTED, no reversal movements, refunds or REVERSE row. */
async function expectNotReversed(purchaseId: string) {
  const row = await prisma.purchase.findUniqueOrThrow({ where: { id: purchaseId } });
  expect(row).toMatchObject({ status: 'POSTED', reversedAt: null, reverseReason: null });
  expect(
    await prisma.stockMovement.count({
      where: { storeId: f.store.id, type: 'PURCHASE_REVERSAL' },
    }),
  ).toBe(0);
  expect(
    await prisma.cashTransaction.count({ where: { purchaseId, type: 'PURCHASE_REFUND' } }),
  ).toBe(0);
  expect(await prisma.auditLog.count({ where: { entityId: purchaseId, action: 'REVERSE' } })).toBe(
    0,
  );
}

describe('purchases.reverse — happy path (BR-3, §5.3)', () => {
  it('cash + card + credit: goods leave, avg → 0 on empty stock, cash refunded, debt cancelled, audit REVERSE', async () => {
    const posted = await createAndPost(
      draft({
        docDate: day(-3),
        note: 'Aziz aka',
        lines: [
          line({ inputUnit: 'BLOCK', inputQty: 2, inputPrice: 60_000 }),
          line({ inputQty: 8, inputPrice: 10_000 }),
        ],
        paidCash: 100_000,
        paidCard: 40_000,
        paidCredit: 60_000,
      }),
    );
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(900_000n);
    expect(await balanceOf(f.cashboxes.card.id)).toBe(60_000n);
    const debt = await prisma.debt.findUniqueOrThrow({ where: { purchaseId: posted.id } });

    const reversed = await purchases.reverse(owner, {
      id: posted.id,
      reason: '  Wrong supplier  ',
    });
    expect(reversed).toMatchObject({
      status: 'REVERSED',
      version: 2,
      reverseReason: 'Wrong supplier',
    });
    expect(reversed.reversedAt).toBeInstanceOf(Date);
    const row = await prisma.purchase.findUniqueOrThrow({ where: { id: posted.id } });
    expect(row.reversedById).toBe(f.owner.id);

    // Stock and cost: Q − q = 0 → avg 0 (§5.3 step 7).
    expect(await stockOf(f.subWarehouse.id)).toBe(0);
    const cost = await costOf();
    expect(cost.totalQty).toBe(0);
    expect(cost.avgCost.toFixed(4)).toBe('0.0000');

    const movements = await prisma.stockMovement.findMany({
      where: { storeId: f.store.id, type: 'PURCHASE_REVERSAL' },
      orderBy: { id: 'asc' },
      include: { purchaseLine: { select: { lineNo: true } } },
    });
    expect(
      movements.map((m) => ({
        qty: m.qtyDelta,
        unitCost: m.unitCost.toFixed(4),
        costAmount: m.costAmount,
        before: m.avgCostBefore.toFixed(4),
        after: m.avgCostAfter.toFixed(4),
        lineNo: m.purchaseLine?.lineNo,
        docDate: m.docDate,
        createdById: m.createdById,
      })),
    ).toEqual([
      {
        qty: -12,
        unitCost: '10000.0000',
        costAmount: -120_000n,
        before: '10000.0000',
        after: '0.0000',
        lineNo: 1,
        docDate: posted.docDate,
        createdById: f.owner.id,
      },
      {
        qty: -8,
        unitCost: '10000.0000',
        costAmount: -80_000n,
        before: '10000.0000',
        after: '0.0000',
        lineNo: 2,
        docDate: posted.docDate,
        createdById: f.owner.id,
      },
    ]);

    // Cash: the paid parts come back IN, dated like the document (OQ-26).
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(1_000_000n);
    expect(await balanceOf(f.cashboxes.card.id)).toBe(100_000n);
    const refunds = await prisma.cashTransaction.findMany({
      where: { purchaseId: posted.id, type: 'PURCHASE_REFUND' },
      orderBy: { id: 'asc' },
    });
    expect(refunds.map((e) => [e.cashboxId, e.direction, e.amount, e.note])).toEqual([
      [f.cashboxes.cash.id, 'IN', 100_000n, 'Wrong supplier'],
      [f.cashboxes.card.id, 'IN', 40_000n, 'Wrong supplier'],
    ]);
    for (const entry of refunds) expect(entry.txDate).toEqual(posted.docDate);

    // Credit debt cancelled (OQ-04 path with no repayments).
    expect(await prisma.debt.findUniqueOrThrow({ where: { id: debt.id } })).toMatchObject({
      status: 'CANCELLED',
      repaidAmount: 0n,
    });
    expect(await prisma.auditLog.count({ where: { entityId: debt.id, action: 'CANCEL' } })).toBe(1);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: posted.id, action: 'REVERSE' },
    });
    expect(audit).toMatchObject({
      userId: f.owner.id,
      entityType: 'purchase',
      before: { status: 'POSTED', version: 1 },
      after: {
        status: 'REVERSED',
        number: posted.number,
        reverseReason: 'Wrong supplier',
        cancelledDebtId: debt.id,
        movements: [
          { lineNo: 1, qty: -12, avgCostBefore: '10000.0000', avgCostAfter: '0.0000' },
          { lineNo: 2, qty: -8, avgCostBefore: '10000.0000', avgCostAfter: '0.0000' },
        ],
      },
      meta: { reason: 'Wrong supplier', backdated: true },
    });
    expect((audit.after as { cashTransactionIds: string[] }).cashTransactionIds).toEqual(
      refunds.map((e) => e.id.toString()),
    );
  });

  it('OQ-09: on remaining stock newAvg = (Q × avg − outCost) / (Q − q)', async () => {
    await createAndPost(draft()); // 10 × 10 000 → avg 10 000
    const second = await makeWarehouse(prisma, { storeId: f.store.id });
    const otherSub = second.subWarehouses[0]!.id;
    const posted = await createAndPost(
      draft({
        lines: [line({ subWarehouseId: otherSub, inputQty: 20, inputPrice: 13_000 })],
        paidCash: 260_000,
      }),
    );
    // (100 000 + 260 000) / 30 = 12 000.
    expect((await costOf()).avgCost.toFixed(4)).toBe('12000.0000');

    await purchases.reverse(owner, { id: posted.id, reason: 'Returned to supplier' });
    // (30 × 12 000 − 260 000) / 10 = 10 000.
    const cost = await costOf();
    expect(cost.totalQty).toBe(10);
    expect(cost.avgCost.toFixed(4)).toBe('10000.0000');
    expect(await stockOf(f.subWarehouse.id)).toBe(10);
    expect(await stockOf(otherSub)).toBe(0);
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(900_000n);
  });

  it('OQ-09: a negative recalculated average is floored at 0', async () => {
    await createAndPost(draft({ lines: [line({ inputPrice: 1_000 })], paidCash: 10_000 }));
    const second = await makeWarehouse(prisma, { storeId: f.store.id });
    const otherSub = second.subWarehouses[0]!.id;
    const posted = await createAndPost(
      draft({
        lines: [line({ subWarehouseId: otherSub, inputPrice: 50_000 })],
        paidCash: 500_000,
      }),
    );
    // (10 000 + 500 000) / 20 = 25 500; 5 pieces sold from the first sub-warehouse.
    await sell(f.subWarehouse.id, 5);
    expect(await costOf()).toMatchObject({ totalQty: 15 });

    await purchases.reverse(owner, { id: posted.id, reason: 'Price error' });
    // 15 × 25 500 − 500 000 < 0 → 0, 5 pieces left.
    const cost = await costOf();
    expect(cost.totalQty).toBe(5);
    expect(cost.avgCost.toFixed(4)).toBe('0.0000');
  });
});

describe('purchases.reverse — blocks', () => {
  it('BR-3: goods already sold → PURCHASE_REVERSAL_INSUFFICIENT_STOCK with the numbers, nothing changes', async () => {
    const posted = await createAndPost(draft({ paidCash: 50_000, paidCard: 50_000 }));
    await sell(f.subWarehouse.id, 4);

    await expect(
      purchases.reverse(owner, { id: posted.id, reason: 'Too late' }),
    ).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_REVERSAL_INSUFFICIENT_STOCK,
      params: {
        productId,
        subWarehouseId: f.subWarehouse.id,
        subWarehouse: f.subWarehouse.name,
        available: 6,
        required: 10,
      },
    });
    await expectNotReversed(posted.id);
    expect(await stockOf(f.subWarehouse.id)).toBe(6);
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(950_000n);
    expect(await balanceOf(f.cashboxes.card.id)).toBe(50_000n);
  });

  it('OQ-04: a credit debt with repayments → DEBT_HAS_REPAYMENTS; the debt stays as it is', async () => {
    const posted = await createAndPost(
      draft({ note: 'Aziz aka', paidCash: 40_000, paidCredit: 60_000 }),
    );
    const debt = await prisma.debt.findUniqueOrThrow({ where: { purchaseId: posted.id } });
    await repay(debt.id, 10_000);

    await expect(
      purchases.reverse(owner, { id: posted.id, reason: 'Wrong goods' }),
    ).rejects.toMatchObject({ code: ErrorCode.DEBT_HAS_REPAYMENTS });
    await expectNotReversed(posted.id);
    expect(await prisma.debt.findUniqueOrThrow({ where: { id: debt.id } })).toMatchObject({
      status: 'OPEN',
      repaidAmount: 10_000n,
    });
    expect(await stockOf(f.subWarehouse.id)).toBe(10);
  });

  it('STAFF → FORBIDDEN (OQ-03)', async () => {
    const posted = await createAndPost(draft());
    await expect(purchases.reverse(staff, { id: posted.id, reason: 'Mine' })).rejects.toMatchObject(
      { code: ErrorCode.FORBIDDEN },
    );
    await expectNotReversed(posted.id);
  });

  it('BR-8: an open stock count blocks the reversal (WAREHOUSE_IN_STOCK_COUNT)', async () => {
    const posted = await createAndPost(draft());
    await prisma.stockCount.create({
      data: {
        storeId: f.store.id,
        warehouseId: f.warehouse.id,
        number: 'I-000001',
        docDate: new Date(),
        createdById: f.owner.id,
      },
    });
    await expect(
      purchases.reverse(owner, { id: posted.id, reason: 'Count' }),
    ).rejects.toMatchObject({
      code: ErrorCode.WAREHOUSE_IN_STOCK_COUNT,
      params: { warehouseName: f.warehouse.name, stockCountNumber: 'I-000001' },
    });
    await expectNotReversed(posted.id);
  });

  it('a draft or a reversed purchase → DOCUMENT_NOT_POSTED; another store → NOT_FOUND; no reason → VALIDATION_FAILED', async () => {
    const created = await purchases.create(owner, draft());
    await expect(
      purchases.reverse(owner, { id: created.id, reason: 'Draft' }),
    ).rejects.toMatchObject({ code: ErrorCode.DOCUMENT_NOT_POSTED });

    await purchases.post(owner, { id: created.id, version: 0 });
    await expect(purchases.reverse(owner, { id: created.id, reason: '   ' })).rejects.toMatchObject(
      { code: ErrorCode.VALIDATION_FAILED },
    );

    const other = await makeStoreFixture(prisma);
    const otherCtx = { ...owner, storeId: other.store.id, organizationId: other.organization.id };
    await expect(
      purchases.reverse(otherCtx, { id: created.id, reason: 'Elsewhere' }),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });

    await purchases.reverse(owner, { id: created.id, reason: 'Once' });
    await expect(
      purchases.reverse(owner, { id: created.id, reason: 'Twice' }),
    ).rejects.toMatchObject({ code: ErrorCode.DOCUMENT_NOT_POSTED });
    expect(
      await prisma.cashTransaction.count({
        where: { purchaseId: created.id, type: 'PURCHASE_REFUND' },
      }),
    ).toBe(1);
  });

  it('two concurrent reversals: exactly one wins, goods leave once', async () => {
    const posted = await createAndPost(draft());
    const results = await Promise.allSettled([
      purchases.reverse(owner, { id: posted.id, reason: 'A' }),
      purchases.reverse(owner, { id: posted.id, reason: 'B' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const [rejected] = results.filter((r) => r.status === 'rejected');
    expect(rejected?.reason).toMatchObject({ code: ErrorCode.DOCUMENT_NOT_POSTED });
    expect(await stockOf(f.subWarehouse.id)).toBe(0);
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(1_000_000n);
    expect(await prisma.auditLog.count({ where: { entityId: posted.id, action: 'REVERSE' } })).toBe(
      1,
    );
  });
});
