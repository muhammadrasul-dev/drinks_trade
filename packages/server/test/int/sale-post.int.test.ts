// T-502: posting a sale (BR-5, BR-7, business-logic §4.2) against a real
// Postgres. Each test builds its own store (one warehouse with one
// sub-warehouse, empty cashboxes); stock comes in through the inventory
// module, the only writer of the stock tables.
import { prisma } from '@drinks/db';
import {
  assertInvariants,
  makeProduct,
  makeStoreFixture,
  makeWarehouse,
  type StoreFixture,
} from '@drinks/db/test-utils';
import { ErrorCode, storeToday } from '@drinks/shared';
import type { SaleDraftInput } from '@drinks/shared/schemas';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { inventory, sales, type ServiceContext, withTransaction } from '../../src/index';

let f: StoreFixture;
let owner: ServiceContext;
let staff: ServiceContext;
/** 6 pieces per block, 12 000 so'm per piece (factory default). */
let productId: string;

beforeEach(async () => {
  f = await makeStoreFixture(prisma);
  owner = {
    user: { id: f.owner.id, role: 'OWNER', locale: 'uz' },
    storeId: f.store.id,
    organizationId: f.organization.id,
    requestId: 'req-sale-post',
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

function receive(qty: number, unitCost = 5000, subWarehouseId = f.subWarehouse.id) {
  return withTransaction((tx) =>
    inventory.receive(tx, owner, {
      type: 'PURCHASE',
      docDate: new Date(),
      lines: [
        {
          subWarehouseId,
          productId,
          qty,
          unitCost: `${unitCost}.0000`,
          costAmount: qty * unitCost,
        },
      ],
    }),
  );
}

/** 2 blocks (12 pieces) + 3 pieces = 15 × 12 000 = 180 000: cash, card and credit. */
function draft(patch: Partial<SaleDraftInput> = {}): SaleDraftInput {
  return {
    docDate: day(0),
    note: 'Mijoz Anvar',
    lines: [
      { productId, subWarehouseId: f.subWarehouse.id, inputUnit: 'BLOCK', inputQty: 2 },
      { productId, subWarehouseId: f.subWarehouse.id, inputUnit: 'PIECE', inputQty: 3 },
    ],
    paidCash: 100_000,
    paidCard: 50_000,
    paidCredit: 30_000,
    ...patch,
  };
}

/** One block (6 pieces × 12 000) paid in cash. */
const oneBlock = (): SaleDraftInput =>
  draft({
    note: null,
    lines: [{ productId, subWarehouseId: f.subWarehouse.id, inputUnit: 'BLOCK', inputQty: 1 }],
    paidCash: 72_000,
    paidCard: 0,
    paidCredit: 0,
  });

const balanceOf = async (id: string) =>
  (await prisma.cashbox.findUniqueOrThrow({ where: { id } })).balance;

const costOf = () =>
  prisma.productCost.findUniqueOrThrow({
    where: { storeId_productId: { storeId: f.store.id, productId } },
  });

const stockOf = async (subWarehouseId = f.subWarehouse.id) =>
  (
    await prisma.stockBalance.findUnique({
      where: { subWarehouseId_productId: { subWarehouseId, productId } },
    })
  )?.qty ?? 0;

/** Nothing of the posting was written: still a draft, no SALE movement, cash, debt or POST. */
async function expectUntouched(saleId: string, version = 0) {
  const row = await prisma.sale.findUniqueOrThrow({
    where: { id: saleId },
    include: { lines: true },
  });
  expect(row).toMatchObject({ status: 'DRAFT', version, postedAt: null, costTotal: null });
  for (const line of row.lines) expect(line).toMatchObject({ unitCost: null, costAmount: null });
  expect(await prisma.stockMovement.count({ where: { saleLine: { saleId } } })).toBe(0);
  expect(await prisma.cashTransaction.count({ where: { saleId } })).toBe(0);
  expect(await prisma.debt.count({ where: { saleId } })).toBe(0);
  expect(await prisma.auditLog.count({ where: { entityId: saleId, action: 'POST' } })).toBe(0);
}

/** Error params STAFF sees must not leak cash balances or costs (CLAUDE.md rule 6). */
function expectNoSecrets(error: unknown) {
  expect(JSON.stringify((error as { params?: unknown }).params ?? {})).not.toMatch(
    /balance|cost|avg/i,
  );
}

describe('sales.post — stock, cost and payment (BR-5, BR-6, BR-9, BR-10)', () => {
  it('STAFF posts: stock leaves at the average, cost frozen on the lines, cash/card IN, credit → RECEIVABLE', async () => {
    // avg = (10 × 5 000 + 10 × 5 500) / 20 = 5 250.
    await receive(10, 5000);
    await receive(10, 5500);
    const created = await sales.create(staff, draft());
    const posted = await sales.post(staff, { id: created.id, version: 0 });

    expect(posted).toMatchObject({
      status: 'POSTED',
      version: 1,
      postedBy: { id: f.staff.id },
      totalAmount: 180_000,
      stockShort: false,
    });
    expect(posted.postedAt).toBeInstanceOf(Date);
    // The DTO never carries costs (CLAUDE.md rule 6).
    expect(JSON.stringify(posted)).not.toMatch(/unitCost|costAmount|costTotal|avgCost/);

    expect(await stockOf()).toBe(5);
    // A sale does not move the average; total_qty drops by 15.
    const cost = await costOf();
    expect(cost.totalQty).toBe(5);
    expect(cost.avgCost.toFixed(4)).toBe('5250.0000');

    const lines = await prisma.saleLine.findMany({
      where: { saleId: created.id },
      orderBy: { lineNo: 'asc' },
    });
    expect(lines.map((l) => [l.lineNo, l.qty, l.unitCost?.toFixed(4), l.costAmount])).toEqual([
      [1, 12, '5250.0000', 63_000n],
      [2, 3, '5250.0000', 15_750n],
    ]);
    const row = await prisma.sale.findUniqueOrThrow({ where: { id: created.id } });
    expect(row).toMatchObject({ costTotal: 78_750n, postedById: f.staff.id });

    const movements = await prisma.stockMovement.findMany({
      where: { saleLine: { saleId: created.id } },
      orderBy: { id: 'asc' },
      include: { saleLine: { select: { lineNo: true } } },
    });
    expect(
      movements.map((m) => ({
        type: m.type,
        qty: m.qtyDelta,
        unitCost: m.unitCost.toFixed(4),
        costAmount: m.costAmount,
        before: m.avgCostBefore.toFixed(4),
        after: m.avgCostAfter.toFixed(4),
        lineNo: m.saleLine?.lineNo,
        docDate: m.docDate,
      })),
    ).toEqual([
      {
        type: 'SALE',
        qty: -12,
        unitCost: '5250.0000',
        costAmount: -63_000n,
        before: '5250.0000',
        after: '5250.0000',
        lineNo: 1,
        docDate: created.docDate,
      },
      {
        type: 'SALE',
        qty: -3,
        unitCost: '5250.0000',
        costAmount: -15_750n,
        before: '5250.0000',
        after: '5250.0000',
        lineNo: 2,
        docDate: created.docDate,
      },
    ]);

    const entries = await prisma.cashTransaction.findMany({
      where: { saleId: created.id },
      orderBy: { id: 'asc' },
    });
    expect(entries.map((e) => [e.cashboxId, e.direction, e.type, e.amount, e.note])).toEqual([
      [f.cashboxes.cash.id, 'IN', 'SALE_RECEIPT', 100_000n, 'Mijoz Anvar'],
      [f.cashboxes.card.id, 'IN', 'SALE_RECEIPT', 50_000n, 'Mijoz Anvar'],
    ]);
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(100_000n);
    expect(await balanceOf(f.cashboxes.card.id)).toBe(50_000n);

    const debt = await prisma.debt.findUniqueOrThrow({ where: { saleId: created.id } });
    expect(debt).toMatchObject({
      direction: 'RECEIVABLE',
      source: 'SALE',
      status: 'OPEN',
      amount: 30_000n,
      repaidAmount: 0n,
      note: 'Mijoz Anvar',
      createdById: f.staff.id,
    });

    const post = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: created.id, action: 'POST' },
    });
    expect(post).toMatchObject({ entityType: 'sale', userId: f.staff.id });
    expect(post.before).toEqual({ status: 'DRAFT', version: 0 });
    expect(post.after).toMatchObject({
      status: 'POSTED',
      number: created.number,
      totalAmount: 180_000,
      paidCash: 100_000,
      paidCard: 50_000,
      paidCredit: 30_000,
      costTotal: 78_750,
      debtId: debt.id,
      movements: [
        { lineNo: 1, qty: -12, unitCost: '5250.0000', costAmount: 63_000 },
        { lineNo: 2, qty: -3, unitCost: '5250.0000', costAmount: 15_750 },
      ],
    });
    expect((post.after as { cashTransactionIds: string[] }).cashTransactionIds).toHaveLength(2);
  });

  it('cost rounds half up per line; a backdated cash-only sale books entries on the document date', async () => {
    // avg = (4 × 5 000 + 2 × 5 001) / 6 = 5 000.3333; 6 × that = 30 001.9998 → 30 002.
    await receive(4, 5000);
    await receive(2, 5001);
    const created = await sales.create(owner, { ...oneBlock(), docDate: day(-1) });
    expect(created.docDay).toBe(day(-1));
    await sales.post(owner, { id: created.id, version: 0 });

    const [line] = await prisma.saleLine.findMany({ where: { saleId: created.id } });
    expect(line?.unitCost?.toFixed(4)).toBe('5000.3333');
    expect(line?.costAmount).toBe(30_002n);
    expect(await stockOf()).toBe(0);

    const entries = await prisma.cashTransaction.findMany({ where: { saleId: created.id } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      cashboxId: f.cashboxes.cash.id,
      direction: 'IN',
      type: 'SALE_RECEIPT',
      amount: 72_000n,
      txDate: created.docDate,
    });
    expect(await prisma.debt.count({ where: { saleId: created.id } })).toBe(0);
    const post = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: created.id, action: 'POST' },
    });
    expect(post.meta).toMatchObject({ backdated: true });
  });

  it('PAYMENT_SPLIT_MISMATCH when the parts do not add up to the total', async () => {
    await receive(20);
    const created = await sales.create(owner, draft({ paidCash: 99_999 }));
    await expect(sales.post(owner, { id: created.id, version: 0 })).rejects.toMatchObject({
      code: ErrorCode.PAYMENT_SPLIT_MISMATCH,
    });
    await expectUntouched(created.id);
  });

  it('OQ-19: a credit part without a note throws NOTE_REQUIRED', async () => {
    await receive(20);
    const created = await sales.create(staff, draft({ note: '   ' }));
    await expect(sales.post(staff, { id: created.id, version: 0 })).rejects.toMatchObject({
      code: ErrorCode.NOTE_REQUIRED,
    });
    await expectUntouched(created.id);
  });
});

describe('sales.post — stock (BR-7)', () => {
  it('two parallel sales racing for the last stock: one posts, the other gets INSUFFICIENT_STOCK', async () => {
    await receive(6);
    const first = await sales.create(owner, oneBlock());
    const second = await sales.create(staff, oneBlock());

    const results = await Promise.allSettled([
      sales.post(owner, { id: first.id, version: 0 }),
      sales.post(staff, { id: second.id, version: 0 }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({
      code: ErrorCode.INSUFFICIENT_STOCK,
      params: { lines: [{ lineNo: 1, productId, available: 0, required: 6 }] },
    });
    expectNoSecrets(rejected[0]?.reason);

    expect(await stockOf()).toBe(0);
    expect((await costOf()).totalQty).toBe(0);
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(72_000n);
    const loser = results[0]?.status === 'rejected' ? first : second;
    await expectUntouched(loser.id);
  });

  it('lines of one pair are summed: 15 needed, 14 in stock → INSUFFICIENT_STOCK for both lines', async () => {
    await receive(14);
    const created = await sales.create(staff, draft());
    expect(created.stockShort).toBe(true);

    const error = await sales.post(staff, { id: created.id, version: 0 }).catch((e: unknown) => e);
    expect(error).toMatchObject({
      code: ErrorCode.INSUFFICIENT_STOCK,
      params: {
        lines: [
          { lineNo: 1, productId, available: 14, required: 15 },
          { lineNo: 2, productId, available: 14, required: 15 },
        ],
      },
    });
    expectNoSecrets(error);
    await expectUntouched(created.id);
    expect(await stockOf()).toBe(14);
  });

  it('another sub-warehouse with stock does not help: the line sells from its own', async () => {
    const other = await makeWarehouse(prisma, { storeId: f.store.id });
    await receive(6, 5000, other.subWarehouses[0]!.id);
    const created = await sales.create(owner, oneBlock());
    await expect(sales.post(owner, { id: created.id, version: 0 })).rejects.toMatchObject({
      code: ErrorCode.INSUFFICIENT_STOCK,
    });
    await expectUntouched(created.id);
  });
});

describe('sales.post — re-save cases and document state', () => {
  it('OQ-29: sale price changed after saving → SALE_PRICE_CHANGED; re-saving fixes it', async () => {
    await receive(20);
    const created = await sales.create(staff, oneBlock());
    await prisma.product.update({ where: { id: productId }, data: { salePrice: 13_000n } });

    const error = await sales.post(staff, { id: created.id, version: 0 }).catch((e: unknown) => e);
    expect(error).toMatchObject({
      code: ErrorCode.SALE_PRICE_CHANGED,
      params: { lines: [{ lineNo: 1, productId, unitPrice: 12_000, salePrice: 13_000 }] },
    });
    expectNoSecrets(error);
    await expectUntouched(created.id);

    // Re-saving copies the new price: 6 × 13 000 = 78 000.
    const saved = await sales.update(staff, {
      id: created.id,
      version: 0,
      ...oneBlock(),
      paidCash: 78_000,
    });
    expect(saved.totalAmount).toBe(78_000);
    const posted = await sales.post(staff, { id: created.id, version: saved.version });
    expect(posted.status).toBe('POSTED');
    expect(await balanceOf(f.cashboxes.cash.id)).toBe(78_000n);
  });

  it('OQ-06: units per block changed after saving → UNITS_PER_BLOCK_CHANGED; re-saving fixes it', async () => {
    await receive(20);
    const created = await sales.create(staff, draft());
    await prisma.product.update({ where: { id: productId }, data: { unitsPerBlock: 8 } });

    await expect(sales.post(staff, { id: created.id, version: 0 })).rejects.toMatchObject({
      code: ErrorCode.UNITS_PER_BLOCK_CHANGED,
      params: { lines: [{ lineNo: 1, productId, qty: 12, unitsPerBlock: 8 }] },
    });
    await expectUntouched(created.id);

    // 2 blocks = 16 pieces + 3 = 19 × 12 000 = 228 000.
    const saved = await sales.update(staff, {
      id: created.id,
      version: 0,
      ...draft({ paidCash: 148_000 }),
    });
    expect(saved.lines[0]?.qty).toBe(16);
    await sales.post(staff, { id: created.id, version: saved.version });
    expect(await stockOf()).toBe(1);
  });

  it('BR-8: an open stock count blocks the warehouse (WAREHOUSE_IN_STOCK_COUNT)', async () => {
    await receive(20);
    await prisma.stockCount.create({
      data: {
        storeId: f.store.id,
        warehouseId: f.warehouse.id,
        number: 'I-000001',
        docDate: new Date(),
        createdById: f.owner.id,
      },
    });
    const created = await sales.create(owner, oneBlock());
    await expect(sales.post(owner, { id: created.id, version: 0 })).rejects.toMatchObject({
      code: ErrorCode.WAREHOUSE_IN_STOCK_COUNT,
      params: { warehouseName: f.warehouse.name, stockCountNumber: 'I-000001' },
    });
    await expectUntouched(created.id);
  });

  it('an archived product or sub-warehouse cannot be sold (ENTITY_ARCHIVED)', async () => {
    await receive(20);
    const created = await sales.create(owner, oneBlock());
    await prisma.product.update({ where: { id: productId }, data: { archivedAt: new Date() } });
    await expect(sales.post(owner, { id: created.id, version: 0 })).rejects.toMatchObject({
      code: ErrorCode.ENTITY_ARCHIVED,
      params: { entity: 'product' },
    });
    await prisma.product.update({ where: { id: productId }, data: { archivedAt: null } });

    await prisma.subWarehouse.update({
      where: { id: f.subWarehouse.id },
      data: { archivedAt: new Date() },
    });
    await expect(sales.post(owner, { id: created.id, version: 0 })).rejects.toMatchObject({
      code: ErrorCode.ENTITY_ARCHIVED,
    });
    await prisma.subWarehouse.update({
      where: { id: f.subWarehouse.id },
      data: { archivedAt: null },
    });
    await expectUntouched(created.id);
  });

  it('a stale version → DOCUMENT_CHANGED; posting twice → DOCUMENT_NOT_DRAFT; another store → NOT_FOUND', async () => {
    await receive(20);
    const created = await sales.create(owner, oneBlock());
    await sales.update(owner, { id: created.id, version: 0, ...oneBlock() });
    await expect(sales.post(owner, { id: created.id, version: 0 })).rejects.toMatchObject({
      code: ErrorCode.DOCUMENT_CHANGED,
    });
    await expectUntouched(created.id, 1);

    await sales.post(owner, { id: created.id, version: 1 });
    await expect(sales.post(owner, { id: created.id, version: 2 })).rejects.toMatchObject({
      code: ErrorCode.DOCUMENT_NOT_DRAFT,
    });
    await expect(
      sales.update(owner, { id: created.id, version: 2, ...oneBlock() }),
    ).rejects.toMatchObject({ code: ErrorCode.DOCUMENT_NOT_DRAFT });

    const other = await makeStoreFixture(prisma);
    const otherCtx = { ...owner, storeId: other.store.id, organizationId: other.organization.id };
    await expect(sales.post(otherCtx, { id: created.id, version: 2 })).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
    expect(await stockOf()).toBe(14);
  });

  it('two concurrent posts of one draft: exactly one wins, goods leave once', async () => {
    await receive(20);
    const created = await sales.create(owner, oneBlock());
    const results = await Promise.allSettled([
      sales.post(owner, { id: created.id, version: 0 }),
      sales.post(staff, { id: created.id, version: 0 }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const [rejected] = results.filter((r) => r.status === 'rejected');
    expect(rejected?.reason).toMatchObject({ code: ErrorCode.DOCUMENT_NOT_DRAFT });
    expect(await stockOf()).toBe(14);
    expect(await prisma.cashTransaction.count({ where: { saleId: created.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: created.id, action: 'POST' } })).toBe(
      1,
    );
  });

  it('rejects invalid input with VALIDATION_FAILED', async () => {
    await expect(sales.post(owner, { id: 'nope', version: 0 })).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_FAILED,
    });
  });
});
