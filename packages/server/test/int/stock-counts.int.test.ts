// T-601: opening, editing and cancelling a stock count, and the warehouse
// block it puts on posting (BR-8, business-logic §3, §6.1, §6.3) against a
// real Postgres. Each test builds its own store: one warehouse with two
// sub-warehouses ("A", "B"), a second warehouse, CASH 1 000 000; stock
// comes in through the inventory module.
import { prisma } from '@drinks/db';
import {
  assertInvariants,
  makeProduct,
  makeStoreFixture,
  makeSubWarehouse,
  makeWarehouse,
  type StoreFixture,
  type WarehouseWithSubs,
} from '@drinks/db/test-utils';
import { ErrorCode, storeToday } from '@drinks/shared';
import type { SaleDraftInput, StockCountUpdateInput } from '@drinks/shared/schemas';
import type { SubWarehouse } from '@drinks/db';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  inventory,
  lockWarehouses,
  purchases,
  sales,
  type ServiceContext,
  stockCounts,
  withTransaction,
} from '../../src/index';

let f: StoreFixture;
let owner: ServiceContext;
let staff: ServiceContext;
/** Sub-warehouses of f.warehouse: the fixture's one and a second, "B". */
let subA: SubWarehouse;
let subB: SubWarehouse;
let other: WarehouseWithSubs;
/** 6 pieces per block. */
let productId: string;

beforeEach(async () => {
  f = await makeStoreFixture(prisma, { cashBalance: 1_000_000n });
  owner = {
    user: { id: f.owner.id, role: 'OWNER', locale: 'uz' },
    storeId: f.store.id,
    organizationId: f.organization.id,
    requestId: 'req-stock-count',
  };
  staff = { ...owner, user: { id: f.staff.id, role: 'STAFF', locale: 'uz' } };
  subA = f.subWarehouse;
  subB = await makeSubWarehouse(prisma, { warehouseId: f.warehouse.id, name: 'ZZ B' });
  other = await makeWarehouse(prisma, { storeId: f.store.id });
  productId = (
    await makeProduct(prisma, { organizationId: f.organization.id, unitsPerBlock: 6, name: 'Cola' })
  ).id;
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

function receive(qty: number, subWarehouseId = subA.id, product = productId, unitCost = 5000) {
  return withTransaction((tx) =>
    inventory.receive(tx, owner, {
      type: 'PURCHASE',
      docDate: new Date(),
      lines: [
        {
          subWarehouseId,
          productId: product,
          qty,
          unitCost: `${unitCost}.0000`,
          costAmount: qty * unitCost,
        },
      ],
    }),
  );
}

const stockOf = async (subWarehouseId = subA.id, product = productId) =>
  (
    await prisma.stockBalance.findUnique({
      where: { subWarehouseId_productId: { subWarehouseId, productId: product } },
    })
  )?.qty ?? 0;

const openCount = (ctx = owner, warehouseId = f.warehouse.id) =>
  stockCounts.open(ctx, { warehouseId, docDate: day(0), note: null });

function edit(
  id: string,
  version: number,
  lines: StockCountUpdateInput['lines'],
  ctx = owner,
): ReturnType<typeof stockCounts.update> {
  return stockCounts.update(ctx, { id, version, docDate: day(0), note: null, lines });
}

/** One block (6 × 12 000) from `subWarehouseId`, paid in cash. */
const oneBlock = (subWarehouseId = subA.id): SaleDraftInput => ({
  docDate: day(0),
  note: null,
  lines: [{ productId, subWarehouseId, inputUnit: 'BLOCK', inputQty: 1 }],
  paidCash: 72_000,
  paidCard: 0,
  paidCredit: 0,
});

/** 10 pieces × 1 000 into `subWarehouseId`, paid in cash. */
const purchase = (subWarehouseId = subA.id) => ({
  docDate: day(0),
  note: null,
  lines: [
    { productId, subWarehouseId, inputUnit: 'PIECE' as const, inputQty: 10, inputPrice: 1000 },
  ],
  paidCash: 10_000,
  paidCard: 0,
  paidCredit: 0,
});

const inStockCount = (number = 'I-000001', warehouseName = f.warehouse.name) => ({
  code: ErrorCode.WAREHOUSE_IN_STOCK_COUNT,
  params: { warehouseName, stockCountNumber: number },
});

/** Resolves after `ms`; used to check a call is still waiting on a lock. */
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function track<T>(promise: Promise<T>) {
  const state = { settled: false };
  const tracked = promise.finally(() => {
    state.settled = true;
  });
  return { promise: tracked, state };
}

describe('stockCounts.open (§6.1)', () => {
  it('STAFF opens a count: I-number, DRAFT, rows = every sub-warehouse × product with stock', async () => {
    await receive(20, subA.id);
    await receive(5, subB.id);

    const count = await openCount(staff);

    expect(count).toMatchObject({
      number: 'I-000001',
      status: 'DRAFT',
      version: 0,
      warehouse: { id: f.warehouse.id, name: f.warehouse.name },
      createdBy: { id: f.staff.id },
      countedCount: 0,
    });
    expect(count.rows.map((row) => [row.subWarehouse.id, row.systemQty, row.countedQty])).toEqual([
      [subA.id, 20, null],
      [subB.id, 5, null],
    ]);
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: count.id, action: 'CREATE' },
    });
    expect(log).toMatchObject({ entityType: 'stock_count', userId: f.staff.id });
    expect(log.after).toMatchObject({ number: 'I-000001', warehouseId: f.warehouse.id });
  });

  it('BR-8: one DRAFT per warehouse (STOCK_COUNT_ALREADY_OPEN); another warehouse may open its own', async () => {
    await openCount();
    await expect(openCount(staff)).rejects.toMatchObject({
      code: ErrorCode.STOCK_COUNT_ALREADY_OPEN,
      params: { warehouseName: f.warehouse.name, stockCountNumber: 'I-000001' },
    });
    const second = await openCount(owner, other.id);
    // The refused open took no number: the check runs before §2 step 3.
    expect(second.number).toBe('I-000002');
  });

  it('two parallel opens of one warehouse: one wins, the other gets STOCK_COUNT_ALREADY_OPEN', async () => {
    const results = await Promise.allSettled([openCount(owner), openCount(staff)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const [rejected] = results.filter((r) => r.status === 'rejected');
    expect(rejected?.reason).toMatchObject({ code: ErrorCode.STOCK_COUNT_ALREADY_OPEN });
    expect(
      await prisma.stockCount.count({ where: { warehouseId: f.warehouse.id, status: 'DRAFT' } }),
    ).toBe(1);
  });

  it('refuses an archived warehouse, another store’s one, a future date and bad input', async () => {
    await prisma.warehouse.update({ where: { id: other.id }, data: { archivedAt: new Date() } });
    await expect(openCount(owner, other.id)).rejects.toMatchObject({
      code: ErrorCode.ENTITY_ARCHIVED,
      params: { entity: 'warehouse', name: other.name },
    });
    const foreign = await makeStoreFixture(prisma);
    await expect(openCount(owner, foreign.warehouse.id)).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
      params: { entity: 'warehouse' },
    });
    await expect(
      stockCounts.open(owner, { warehouseId: f.warehouse.id, docDate: day(1) }),
    ).rejects.toMatchObject({ code: ErrorCode.DOC_DATE_IN_FUTURE });
    await expect(
      stockCounts.open(owner, { warehouseId: 'nope', docDate: day(0) }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
    expect(await prisma.stockCount.count({ where: { storeId: f.store.id } })).toBe(0);
  });

  it('a backdated count is flagged in the audit (BR-13)', async () => {
    const count = await stockCounts.open(owner, { warehouseId: f.warehouse.id, docDate: day(-3) });
    expect(count.docDay).toBe(day(-3));
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: count.id } });
    expect(log.meta).toMatchObject({ backdated: true });
  });
});

describe('stockCounts.update — the counting form (FR-5.1, OQ-13)', () => {
  it('saves blocks + pieces as pieces, shows the difference; uncounted rows stay; stock untouched', async () => {
    await receive(20, subA.id);
    await receive(5, subB.id);
    const extra = await makeProduct(prisma, {
      organizationId: f.organization.id,
      unitsPerBlock: 12,
      name: 'Fanta',
    });
    const count = await openCount();

    const saved = await edit(count.id, 0, [
      { subWarehouseId: subA.id, productId, blocks: 3, pieces: 1 }, // 19: one short
      { subWarehouseId: subB.id, productId: extra.id, blocks: 0, pieces: 0 }, // explicit 0, not in stock
    ]);

    expect(saved).toMatchObject({ version: 1, countedCount: 2 });
    const rows = saved.rows.map((row) => ({
      sub: row.subWarehouse.id,
      product: row.product.name,
      systemQty: row.systemQty,
      countedQty: row.countedQty,
      diffQty: row.diffQty,
    }));
    expect(rows).toEqual([
      { sub: subA.id, product: 'Cola', systemQty: 20, countedQty: 19, diffQty: -1 },
      { sub: subB.id, product: 'Cola', systemQty: 5, countedQty: null, diffQty: null },
      { sub: subB.id, product: 'Fanta', systemQty: 0, countedQty: 0, diffQty: 0 },
    ]);
    expect(await stockOf(subA.id)).toBe(20);
    expect(await prisma.stockMovement.count({ where: { stockCountId: count.id } })).toBe(0);

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: count.id, action: 'UPDATE' },
    });
    expect(log.before).toMatchObject({ lines: [] });
    expect(log.after).toMatchObject({
      lines: [
        { subWarehouseId: subA.id, productId, countedQty: 19 },
        { subWarehouseId: subB.id, productId: extra.id, countedQty: 0 },
      ],
    });
  });

  it('replaces the counted lines on every save; a stale version → DOCUMENT_CHANGED', async () => {
    await receive(20);
    const count = await openCount();
    await edit(count.id, 0, [{ subWarehouseId: subA.id, productId, blocks: 1, pieces: 0 }]);
    const second = await edit(count.id, 1, [], staff);
    expect(second.countedCount).toBe(0);
    expect(second.rows[0]).toMatchObject({ systemQty: 20, countedQty: null });

    await expect(
      edit(count.id, 1, [{ subWarehouseId: subA.id, productId, blocks: 0, pieces: 1 }]),
    ).rejects.toMatchObject({ code: ErrorCode.DOCUMENT_CHANGED });
  });

  it('two parallel saves of one version: one wins, the other gets DOCUMENT_CHANGED', async () => {
    const count = await openCount();
    const line = { subWarehouseId: subA.id, productId, blocks: 0, pieces: 2 };
    const results = await Promise.allSettled([
      edit(count.id, 0, [line]),
      edit(count.id, 0, [line], staff),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const [rejected] = results.filter((r) => r.status === 'rejected');
    expect(rejected?.reason).toMatchObject({ code: ErrorCode.DOCUMENT_CHANGED });
  });

  it('a sub-warehouse must be an active one of the counted warehouse', async () => {
    const count = await openCount();
    await expect(
      edit(count.id, 0, [
        { subWarehouseId: other.subWarehouses[0]!.id, productId, blocks: 0, pieces: 1 },
      ]),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND, params: { entity: 'sub_warehouse' } });

    const archived = await makeSubWarehouse(prisma, {
      warehouseId: f.warehouse.id,
      name: 'Old',
      archivedAt: new Date(),
    });
    await expect(
      edit(count.id, 0, [{ subWarehouseId: archived.id, productId, blocks: 0, pieces: 1 }]),
    ).rejects.toMatchObject({
      code: ErrorCode.ENTITY_ARCHIVED,
      params: { entity: 'sub_warehouse' },
    });
  });

  it('an archived product can be counted only where it still has stock (OQ-20, OQ-32)', async () => {
    await receive(4, subA.id);
    await prisma.product.update({ where: { id: productId }, data: { archivedAt: new Date() } });
    const count = await openCount();
    expect(count.rows[0]?.product).toMatchObject({ id: productId, archived: true });

    const saved = await edit(count.id, 0, [
      { subWarehouseId: subA.id, productId, blocks: 0, pieces: 0 },
    ]);
    expect(saved.rows[0]).toMatchObject({ systemQty: 4, countedQty: 0, diffQty: -4 });

    await expect(
      edit(count.id, 1, [{ subWarehouseId: subB.id, productId, blocks: 0, pieces: 1 }]),
    ).rejects.toMatchObject({ code: ErrorCode.ENTITY_ARCHIVED, params: { entity: 'product' } });
  });

  it('rejects another organization’s product, duplicate pairs and a too big count', async () => {
    const count = await openCount();
    const foreign = await makeProduct(prisma);
    await expect(
      edit(count.id, 0, [{ subWarehouseId: subA.id, productId: foreign.id, blocks: 0, pieces: 1 }]),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND, params: { entity: 'product' } });

    const line = { subWarehouseId: subA.id, productId, blocks: 0, pieces: 1 };
    await expect(edit(count.id, 0, [line, line])).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_FAILED,
    });

    const big = await makeProduct(prisma, {
      organizationId: f.organization.id,
      unitsPerBlock: 10_000,
    });
    await expect(
      edit(count.id, 0, [
        { subWarehouseId: subA.id, productId: big.id, blocks: 1_000_000, pieces: 0 },
      ]),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
  });
});

describe('confidentiality (CLAUDE.md rule 6)', () => {
  it('OWNER sees avg cost, row amounts and the BR-8 estimate; STAFF gets none of those keys', async () => {
    await receive(20, subA.id, productId, 5000); // avg 5 000
    await receive(10, subB.id, productId, 5000);
    const count = await openCount();
    // A moved 2 to B (−2 / +2: no money), and 1 more is missing in B.
    await edit(count.id, 0, [
      { subWarehouseId: subA.id, productId, blocks: 3, pieces: 0 }, // 18
      { subWarehouseId: subB.id, productId, blocks: 1, pieces: 5 }, // 11
    ]);

    const mine = await stockCounts.get(owner, { id: count.id });
    expect(mine.rows.map((row) => [row.diffQty, row.avgCost, row.diffAmount])).toEqual([
      [-2, '5000.0000', -10_000],
      [1, '5000.0000', 5_000],
    ]);
    expect(mine.estimate).toEqual({ shortageAmount: 5_000, surplusAmount: 0 });

    const theirs = await stockCounts.get(staff, { id: count.id });
    expect(theirs.rows.map((row) => row.diffQty)).toEqual([-2, 1]);
    for (const row of theirs.rows) {
      expect(row).not.toHaveProperty('avgCost');
      expect(row).not.toHaveProperty('diffAmount');
    }
    expect(theirs).not.toHaveProperty('estimate');
    expect(theirs).not.toHaveProperty('shortageAmount');
    expect(theirs).not.toHaveProperty('surplusAmount');
    expect(JSON.stringify(theirs)).not.toMatch(/cost|amount/i);

    const updated = await edit(count.id, 1, [], staff);
    expect(JSON.stringify(updated)).not.toMatch(/cost|amount/i);
    const page = await stockCounts.list(staff);
    expect(JSON.stringify(page.items)).not.toMatch(/cost|amount/i);
    expect((await stockCounts.list(owner)).items[0]).toMatchObject({
      shortageAmount: null,
      surplusAmount: null,
    });
  });
});

describe('stockCounts.cancel (§6.3)', () => {
  it('DRAFT → CANCELLED, stock untouched, audit CANCEL; the block lifts and a new count may open', async () => {
    await receive(20);
    const count = await openCount();
    await edit(count.id, 0, [{ subWarehouseId: subA.id, productId, blocks: 0, pieces: 3 }]);

    const cancelled = await stockCounts.cancel(staff, { id: count.id, version: 1 });
    expect(cancelled).toMatchObject({
      status: 'CANCELLED',
      version: 2,
      cancelledBy: { id: f.staff.id },
    });
    expect(cancelled.cancelledAt).toBeInstanceOf(Date);
    expect(cancelled.rows).toEqual([
      expect.objectContaining({ systemQty: null, countedQty: 3, diffQty: null }),
    ]);
    expect(await stockOf()).toBe(20);
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: count.id, action: 'CANCEL' },
    });
    expect(log).toMatchObject({ entityType: 'stock_count', userId: f.staff.id });
    expect(log.before).toMatchObject({ status: 'DRAFT', version: 1 });

    const sale = await sales.create(owner, oneBlock());
    await sales.post(owner, { id: sale.id, version: 0 });
    expect(await stockOf()).toBe(14);
    expect((await openCount()).number).toBe('I-000002');
  });

  it('a cancelled count cannot be cancelled or edited again; a stale version → DOCUMENT_CHANGED', async () => {
    const count = await openCount();
    await expect(stockCounts.cancel(owner, { id: count.id, version: 5 })).rejects.toMatchObject({
      code: ErrorCode.DOCUMENT_CHANGED,
    });
    await stockCounts.cancel(owner, { id: count.id, version: 0 });
    await expect(stockCounts.cancel(owner, { id: count.id, version: 1 })).rejects.toMatchObject({
      code: ErrorCode.DOCUMENT_NOT_DRAFT,
    });
    await expect(edit(count.id, 1, [])).rejects.toMatchObject({
      code: ErrorCode.DOCUMENT_NOT_DRAFT,
    });
  });

  it('another store’s count is NOT_FOUND', async () => {
    const count = await openCount();
    const foreign = await makeStoreFixture(prisma);
    const stranger: ServiceContext = {
      ...owner,
      user: { id: foreign.owner.id, role: 'OWNER', locale: 'uz' },
      storeId: foreign.store.id,
      organizationId: foreign.organization.id,
    };
    await expect(stockCounts.cancel(stranger, { id: count.id, version: 0 })).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
    await expect(stockCounts.get(stranger, { id: count.id })).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
  });
});

describe('the warehouse block (BR-8, §3)', () => {
  it('blocks sale posting, purchase posting and purchase reversal in the counted warehouse only', async () => {
    await receive(30, subA.id);
    await receive(30, other.subWarehouses[0]!.id);
    const posted = await purchases.create(owner, purchase());
    await purchases.post(owner, { id: posted.id, version: 0 });

    await openCount();

    // Drafts can still be created and edited (BR-8).
    const sale = await sales.create(staff, oneBlock());
    const savedSale = await sales.update(staff, { id: sale.id, version: 0, ...oneBlock() });
    const draft = await purchases.create(staff, purchase(subB.id));

    await expect(
      sales.post(staff, { id: sale.id, version: savedSale.version }),
    ).rejects.toMatchObject(inStockCount());
    await expect(purchases.post(staff, { id: draft.id, version: 0 })).rejects.toMatchObject(
      inStockCount(),
    );
    await expect(purchases.reverse(owner, { id: posted.id, reason: 'Xato' })).rejects.toMatchObject(
      inStockCount(),
    );
    expect(await stockOf(subA.id)).toBe(40);
    expect((await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })).status).toBe('DRAFT');

    // The other warehouse is not blocked.
    const elsewhere = await sales.create(staff, oneBlock(other.subWarehouses[0]!.id));
    await sales.post(staff, { id: elsewhere.id, version: 0 });
    const elsewherePurchase = await purchases.create(staff, purchase(other.subWarehouses[0]!.id));
    await purchases.post(staff, { id: elsewherePurchase.id, version: 0 });
    expect(await stockOf(other.subWarehouses[0]!.id)).toBe(34);
  });

  it('a document touching both warehouses is blocked by the counted one', async () => {
    await receive(10, subA.id);
    await receive(10, other.subWarehouses[0]!.id);
    await openCount(owner, other.id);
    const sale = await sales.create(owner, {
      ...oneBlock(),
      lines: [
        { productId, subWarehouseId: subA.id, inputUnit: 'PIECE', inputQty: 3 },
        { productId, subWarehouseId: other.subWarehouses[0]!.id, inputUnit: 'PIECE', inputQty: 3 },
      ],
    });
    await expect(sales.post(owner, { id: sale.id, version: 0 })).rejects.toMatchObject(
      inStockCount('I-000001', other.name),
    );
  });

  it('a count waits for a posting in flight (FOR SHARE held) and opens after it', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const posting = withTransaction(async (tx) => {
      await lockWarehouses(tx, f.store.id, [f.warehouse.id]);
      await gate;
    });
    await pause(100);

    const opening = track(openCount(staff));
    await pause(400);
    expect(opening.state.settled).toBe(false);

    release();
    await posting;
    expect((await opening.promise).status).toBe('DRAFT');
  });

  it('a posting that starts while a count is being opened waits and then fails', async () => {
    await receive(20);
    const sale = await sales.create(owner, oneBlock());

    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const opening = withTransaction(async (tx) => {
      await lockWarehouses(tx, f.store.id, [f.warehouse.id], { exclusive: true });
      await tx.stockCount.create({
        data: {
          storeId: f.store.id,
          warehouseId: f.warehouse.id,
          number: 'I-000009',
          docDate: new Date(),
          createdById: f.owner.id,
        },
      });
      await gate;
    });
    await pause(100);

    const posting = track(sales.post(owner, { id: sale.id, version: 0 }));
    await pause(400);
    expect(posting.state.settled).toBe(false);

    release();
    await opening;
    await expect(posting.promise).rejects.toMatchObject(inStockCount('I-000009'));
    expect(await stockOf()).toBe(20);
  });

  it('racing a sale against opening a count: never a sale posted after the count opened', async () => {
    await receive(60);
    for (let round = 0; round < 5; round++) {
      const sale = await sales.create(owner, oneBlock());
      const [posted, opened] = await Promise.allSettled([
        sales.post(staff, { id: sale.id, version: 0 }),
        openCount(owner),
      ]);
      expect(opened.status).toBe('fulfilled');
      if (posted.status === 'rejected') {
        expect(posted.reason).toMatchObject({ code: ErrorCode.WAREHOUSE_IN_STOCK_COUNT });
      }
      const count = (opened as PromiseFulfilledResult<Awaited<ReturnType<typeof openCount>>>).value;
      // The count's rows are the stock after the sale (if it won) — and stay so.
      expect(count.rows[0]?.systemQty).toBe(await stockOf());
      await stockCounts.cancel(owner, { id: count.id, version: 0 });
    }
  });
});

describe('queries', () => {
  it('list: open counts first, filters by status, warehouse and number; openCounts', async () => {
    const first = await openCount();
    await stockCounts.cancel(owner, { id: first.id, version: 0 });
    const second = await openCount(owner, other.id);

    const page = await stockCounts.list(staff);
    expect(page.items.map((item) => [item.number, item.status])).toEqual([
      ['I-000002', 'DRAFT'],
      ['I-000001', 'CANCELLED'],
    ]);
    expect((await stockCounts.list(owner, { status: 'CANCELLED' })).items).toHaveLength(1);
    expect((await stockCounts.list(owner, { warehouseId: other.id })).items[0]?.id).toBe(second.id);
    expect((await stockCounts.list(owner, { q: '2' })).total).toBe(1);

    expect(await stockCounts.openCounts(staff)).toEqual([
      { id: second.id, number: 'I-000002', warehouseId: other.id, warehouseName: other.name },
    ]);
  });
});
