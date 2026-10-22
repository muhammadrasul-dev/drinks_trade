// T-405: posting a purchase (BR-4, business-logic §5.2) against a real
// Postgres. Each test builds its own store: one warehouse with one
// sub-warehouse, CASH opening balance 1 000 000, CARD empty.
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

import { purchases, type ServiceContext } from '../../src/index';

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
    requestId: 'req-purchase-post',
  };
  staff = { ...owner, user: { id: f.staff.id, role: 'STAFF', locale: 'uz' } };
  productId = (await makeProduct(prisma, { organizationId: f.organization.id, unitsPerBlock: 6 }))
    .id;
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

/**
 * 3 blocks × 60 000 (18 pieces) + 7 pieces × 9 500 = 246 500 for 25 pieces,
 * paid in cash by default.
 */
function draft(patch: Partial<PurchaseDraftInput> = {}): PurchaseDraftInput {
  return {
    docDate: day(0),
    note: null,
    lines: [
      line({ inputUnit: 'BLOCK', inputQty: 3, inputPrice: 60_000 }),
      line({ inputQty: 7, inputPrice: 9_500 }),
    ],
    paidCash: 246_500,
    paidCard: 0,
    paidCredit: 0,
    ...patch,
  };
}

/** Creates a draft and posts it at version 0. */
async function createAndPost(ctx: ServiceContext, input: PurchaseDraftInput) {
  const created = await purchases.create(ctx, input);
  return purchases.post(ctx, { id: created.id, version: created.version });
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

const balanceOf = async (id: string) =>
  (await prisma.cashbox.findUniqueOrThrow({ where: { id } })).balance;

const costOf = (id = productId) =>
  prisma.productCost.findUniqueOrThrow({
    where: { storeId_productId: { storeId: f.store.id, productId: id } },
  });

const stockOf = async (subWarehouseId: string, id = productId) =>
  (
    await prisma.stockBalance.findUnique({
      where: { subWarehouseId_productId: { subWarehouseId, productId: id } },
    })
  )?.qty ?? 0;

/** Nothing of the posting was written: still a draft, no stock, cash or debt rows. */
async function expectUntouched(purchaseId: string) {
  const row = await prisma.purchase.findUniqueOrThrow({ where: { id: purchaseId } });
  expect(row).toMatchObject({ status: 'DRAFT', version: 0, postedAt: null, postedById: null });
  expect(await prisma.stockMovement.count({ where: { storeId: f.store.id } })).toBe(0);
  expect(await prisma.cashTransaction.count({ where: { purchaseId } })).toBe(0);
  expect(await prisma.debt.count({ where: { purchaseId } })).toBe(0);
  expect(await prisma.auditLog.count({ where: { entityId: purchaseId, action: 'POST' } })).toBe(0);
  expect(await balanceOf(f.cashboxes.cash.id)).toBe(1_000_000n);
}

describe('purchases.post — stock and cost (BR-4, BR-6)', () => {
  it('on empty stock: goods arrive, avg = inCost / q, cash leaves, POSTED with audit', async () => {
    const created = await purchases.create(staff, draft());
    const posted = await purchases.post(staff, { id: created.id, version: 0 });

    expect(posted).toMatchObject({
      status: 'POSTED',
      version: 1,
      postedBy: { id: f.staff.id },
    });
    expect(posted.postedAt).toBeInstanceOf(Date);
    // The DTO carries purchase prices only, never the store's average cost.
    expect(JSON.stringify(posted)).not.toMatch(/avgCost/);

    expect(await stockOf(f.subWarehouse.id)).toBe(25);
    // 246 500 / 25 pieces.
    expect(await costOf()).toMatchObject({ totalQty: 25 });
    expect((await costOf()).avgCost.toFixed(4)).toBe('9860.0000');

    const movements = await prisma.stockMovement.findMany({
      where: { storeId: f.store.id },
      orderBy: { id: 'asc' },
      include: { purchaseLine: { select: { lineNo: true } } },
    });
    expect(
      movements.map((m) => ({
        type: m.type,
        qty: m.qtyDelta,
        unitCost: m.unitCost.toFixed(4),
        costAmount: m.costAmount,
        before: m.avgCostBefore.toFixed(4),
        after: m.avgCostAfter.toFixed(4),
        lineNo: m.purchaseLine?.lineNo,
        createdById: m.createdById,
      })),
    ).toEqual([
      {
        type: 'PURCHASE',
        qty: 18,
        unitCost: '10000.0000',
        costAmount: 180_000n,
        before: '0.0000',
        after: '9860.0000',
        lineNo: 1,
        createdById: f.staff.id,
      },
      {
        type: 'PURCHASE',
        qty: 7,
        unitCost: '9500.0000',
        costAmount: 66_500n,
        before: '0.0000',
        after: '9860.0000',
        lineNo: 2,
        createdById: f.staff.id,
      },
    ]);
    expect(movements[0]?.docDate).toEqual(created.docDate);

    expect(await balanceOf(f.cashboxes.cash.id)).toBe(753_500n);
    const [entry] = await prisma.cashTransaction.findMany({ where: { purchaseId: created.id } });
    expect(entry).toMatchObject({
      cashboxId: f.cashboxes.cash.id,
      direction: 'OUT',
      type: 'PURCHASE_PAYMENT',
      amount: 246_500n,
      balanceAfter: 753_500n,
      txDate: created.docDate,
    });
    expect(await prisma.debt.count({ where: { purchaseId: created.id } })).toBe(0);

    const audit = await prisma.auditLog.findMany({
      where: { entityId: created.id },
      orderBy: { id: 'asc' },
    });
    expect(audit.map((row) => row.action)).toEqual(['CREATE', 'POST']);
    expect(audit[1]).toMatchObject({
      userId: f.staff.id,
      entityType: 'purchase',
      before: { status: 'DRAFT', version: 0 },
      after: {
        status: 'POSTED',
        number: created.number,
        totalAmount: 246_500,
        paidCash: 246_500,
        debtId: null,
        movements: [
          { lineNo: 1, qty: 18, avgCostBefore: '0.0000', avgCostAfter: '9860.0000' },
          { lineNo: 2, qty: 7, avgCostBefore: '0.0000', avgCostAfter: '9860.0000' },
        ],
      },
    });
    expect(audit[1]?.meta).not.toHaveProperty('backdated');
  });

  it('on existing stock: newAvg = (Q × avg + inCost) / (Q + q); a 0-price bonus line lowers it (OQ-23)', async () => {
    // 10 pieces × 10 000 → avg 10 000.
    await createAndPost(owner, draft({ lines: [line()], paidCash: 100_000 }));
    const second = await makeWarehouse(prisma, { storeId: f.store.id });
    const otherSub = second.subWarehouses[0]!.id;

    // 20 × 13 000 + 5 bonus pieces → (100 000 + 260 000) / 35 = 10 285.7142857… → 10 285.7143.
    await createAndPost(
      staff,
      draft({
        lines: [
          line({ subWarehouseId: otherSub, inputQty: 20, inputPrice: 13_000 }),
          line({ subWarehouseId: otherSub, inputQty: 5, inputPrice: 0 }),
        ],
        paidCash: 260_000,
      }),
    );

    expect(await stockOf(f.subWarehouse.id)).toBe(10);
    expect(await stockOf(otherSub)).toBe(25);
    const cost = await costOf();
    expect(cost.totalQty).toBe(35);
    expect(cost.avgCost.toFixed(4)).toBe('10285.7143');

    const last = await prisma.stockMovement.findMany({
      where: { subWarehouseId: otherSub },
      orderBy: { id: 'asc' },
    });
    expect(last.map((m) => [m.avgCostBefore.toFixed(4), m.avgCostAfter.toFixed(4)])).toEqual([
      ['10000.0000', '10285.7143'],
      ['10000.0000', '10285.7143'],
    ]);
    expect(last[1]).toMatchObject({ qtyDelta: 5, costAmount: 0n });
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(640_000n);
  });

  it('an all-bonus purchase (total 0) posts without cash or debt', async () => {
    const posted = await createAndPost(
      owner,
      draft({ lines: [line({ inputPrice: 0 })], paidCash: 0 }),
    );
    expect(posted.status).toBe('POSTED');
    expect(await stockOf(f.subWarehouse.id)).toBe(10);
    expect((await costOf()).avgCost.toFixed(4)).toBe('0.0000');
    expect(await prisma.cashTransaction.count({ where: { purchaseId: posted.id } })).toBe(0);
    expect(await prisma.debt.count({ where: { purchaseId: posted.id } })).toBe(0);
  });
});

describe('purchases.post — payment (BR-9, BR-10)', () => {
  it('cash + card + credit: both cashboxes pay out, the credit part opens a PAYABLE debt with the note', async () => {
    await fund(f.cashboxes.card.id, 50_000n);
    const created = await purchases.create(
      staff,
      draft({
        docDate: day(-2),
        note: ' Aziz aka (Coca-Cola) ',
        paidCash: 100_000,
        paidCard: 46_500,
        paidCredit: 100_000,
      }),
    );
    const posted = await purchases.post(staff, { id: created.id, version: 0 });
    expect(posted.status).toBe('POSTED');

    expect(await balanceOf(f.cashboxes.cash.id)).toBe(900_000n);
    expect(await balanceOf(f.cashboxes.card.id)).toBe(3_500n);
    const entries = await prisma.cashTransaction.findMany({
      where: { purchaseId: created.id },
      orderBy: { id: 'asc' },
    });
    expect(entries.map((e) => [e.cashboxId, e.direction, e.type, e.amount])).toEqual([
      [f.cashboxes.cash.id, 'OUT', 'PURCHASE_PAYMENT', 100_000n],
      [f.cashboxes.card.id, 'OUT', 'PURCHASE_PAYMENT', 46_500n],
    ]);
    // Backdated: cash entries and the debt carry the document date (BR-13).
    for (const entry of entries) expect(entry.txDate).toEqual(created.docDate);

    const debt = await prisma.debt.findUniqueOrThrow({ where: { purchaseId: created.id } });
    expect(debt).toMatchObject({
      direction: 'PAYABLE',
      source: 'PURCHASE',
      status: 'OPEN',
      amount: 100_000n,
      repaidAmount: 0n,
      note: 'Aziz aka (Coca-Cola)',
      debtDate: created.docDate,
      createdById: f.staff.id,
    });

    const post = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: created.id, action: 'POST' },
    });
    expect(post.meta).toMatchObject({ backdated: true });
    expect(post.after).toMatchObject({ debtId: debt.id, paidCredit: 100_000 });
    expect((post.after as { cashTransactionIds: string[] }).cashTransactionIds).toHaveLength(2);
  });

  it('a cashbox short of money throws CASHBOX_INSUFFICIENT without amounts and changes nothing', async () => {
    const created = await purchases.create(
      staff,
      draft({ paidCash: 200_000, paidCard: 46_500 }), // CARD is empty
    );
    let error: unknown;
    try {
      await purchases.post(staff, { id: created.id, version: 0 });
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ code: ErrorCode.CASHBOX_INSUFFICIENT });
    expect((error as { params: unknown }).params).toEqual({ cashbox: 'CARD' });
    await expectUntouched(created.id);

    const big = await purchases.create(
      staff,
      draft({ lines: [line({ inputQty: 101, inputPrice: 10_000 })], paidCash: 1_010_000 }),
    );
    await expect(purchases.post(staff, { id: big.id, version: 0 })).rejects.toMatchObject({
      code: ErrorCode.CASHBOX_INSUFFICIENT,
      params: { cashbox: 'CASH' },
    });
    await expectUntouched(big.id);
  });

  it('PAYMENT_SPLIT_MISMATCH when the parts do not add up to the total', async () => {
    const created = await purchases.create(owner, draft({ paidCash: 246_000 }));
    await expect(purchases.post(owner, { id: created.id, version: 0 })).rejects.toMatchObject({
      code: ErrorCode.PAYMENT_SPLIT_MISMATCH,
    });
    await expectUntouched(created.id);
  });

  it('OQ-19: a credit part without a note throws NOTE_REQUIRED', async () => {
    const created = await purchases.create(
      owner,
      draft({ note: '   ', paidCash: 146_500, paidCredit: 100_000 }),
    );
    await expect(purchases.post(owner, { id: created.id, version: 0 })).rejects.toMatchObject({
      code: ErrorCode.NOTE_REQUIRED,
    });
    await expectUntouched(created.id);
  });
});

describe('purchases.post — blocks and document state', () => {
  it('OQ-06: units per block changed after saving → UNITS_PER_BLOCK_CHANGED; re-saving fixes it', async () => {
    const created = await purchases.create(owner, draft());
    await prisma.product.update({ where: { id: productId }, data: { unitsPerBlock: 12 } });

    await expect(purchases.post(staff, { id: created.id, version: 0 })).rejects.toMatchObject({
      code: ErrorCode.UNITS_PER_BLOCK_CHANGED,
      params: { lines: [{ lineNo: 1, productId, qty: 18, unitsPerBlock: 12 }] },
    });
    await expectUntouched(created.id);

    // Re-saving recomputes 3 blocks = 36 pieces; the PIECE line never mattered.
    const saved = await purchases.update(staff, { id: created.id, version: 0, ...draft() });
    expect(saved.lines[0]?.qty).toBe(36);
    await purchases.post(staff, { id: created.id, version: saved.version });
    expect(await stockOf(f.subWarehouse.id)).toBe(43);
  });

  it('BR-8: an open stock count blocks the warehouse (WAREHOUSE_IN_STOCK_COUNT), not another one', async () => {
    await prisma.stockCount.create({
      data: {
        storeId: f.store.id,
        warehouseId: f.warehouse.id,
        number: 'I-000001',
        docDate: new Date(),
        createdById: f.owner.id,
      },
    });
    const created = await purchases.create(owner, draft());
    await expect(purchases.post(owner, { id: created.id, version: 0 })).rejects.toMatchObject({
      code: ErrorCode.WAREHOUSE_IN_STOCK_COUNT,
      params: { warehouseName: f.warehouse.name, stockCountNumber: 'I-000001' },
    });
    await expectUntouched(created.id);

    const other = await makeWarehouse(prisma, { storeId: f.store.id });
    const elsewhere = await createAndPost(
      owner,
      draft({
        lines: [line({ subWarehouseId: other.subWarehouses[0]!.id })],
        paidCash: 100_000,
      }),
    );
    expect(elsewhere.status).toBe('POSTED');
  });

  it('an archived sub-warehouse or product cannot receive goods (ENTITY_ARCHIVED)', async () => {
    const created = await purchases.create(owner, draft());
    await prisma.subWarehouse.update({
      where: { id: f.subWarehouse.id },
      data: { archivedAt: new Date() },
    });
    await expect(purchases.post(owner, { id: created.id, version: 0 })).rejects.toMatchObject({
      code: ErrorCode.ENTITY_ARCHIVED,
      params: { entity: 'sub_warehouse' },
    });

    await prisma.subWarehouse.update({
      where: { id: f.subWarehouse.id },
      data: { archivedAt: null },
    });
    await prisma.product.update({ where: { id: productId }, data: { archivedAt: new Date() } });
    await expect(purchases.post(owner, { id: created.id, version: 0 })).rejects.toMatchObject({
      code: ErrorCode.ENTITY_ARCHIVED,
      params: { entity: 'product' },
    });
    await expectUntouched(created.id);
  });

  it('a stale version → DOCUMENT_CHANGED; posting twice → DOCUMENT_NOT_DRAFT; another store → NOT_FOUND', async () => {
    const created = await purchases.create(owner, draft());
    await purchases.update(staff, { id: created.id, version: 0, ...draft() });
    await expect(purchases.post(owner, { id: created.id, version: 0 })).rejects.toMatchObject({
      code: ErrorCode.DOCUMENT_CHANGED,
    });

    await purchases.post(owner, { id: created.id, version: 1 });
    await expect(purchases.post(owner, { id: created.id, version: 2 })).rejects.toMatchObject({
      code: ErrorCode.DOCUMENT_NOT_DRAFT,
    });
    await expect(
      purchases.update(owner, { id: created.id, version: 2, ...draft() }),
    ).rejects.toMatchObject({ code: ErrorCode.DOCUMENT_NOT_DRAFT });

    const other = await makeStoreFixture(prisma);
    const otherCtx = { ...owner, storeId: other.store.id, organizationId: other.organization.id };
    await expect(purchases.post(otherCtx, { id: created.id, version: 2 })).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
    expect(await stockOf(f.subWarehouse.id)).toBe(25);
  });

  it('two concurrent posts of one draft: exactly one wins, goods arrive once', async () => {
    const created = await purchases.create(owner, draft());
    const results = await Promise.allSettled([
      purchases.post(owner, { id: created.id, version: 0 }),
      purchases.post(staff, { id: created.id, version: 0 }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const [rejected] = results.filter((r) => r.status === 'rejected');
    expect(rejected?.reason).toMatchObject({ code: ErrorCode.DOCUMENT_NOT_DRAFT });
    expect(await stockOf(f.subWarehouse.id)).toBe(25);
    expect(await prisma.cashTransaction.count({ where: { purchaseId: created.id } })).toBe(1);
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(753_500n);
    expect(await prisma.auditLog.count({ where: { entityId: created.id, action: 'POST' } })).toBe(
      1,
    );
  });

  it('rejects invalid input with VALIDATION_FAILED', async () => {
    await expect(purchases.post(owner, { id: 'nope', version: 0 })).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_FAILED,
    });
  });
});
