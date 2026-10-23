// T-602: posting a stock count (BR-8, business-logic §6.2, OQ-13) against a
// real Postgres. Each test builds its own store: one warehouse with two
// sub-warehouses ("A" = the fixture's, "B"), a second warehouse, CASH
// 1 000 000; stock comes in through the inventory module at 5 000 a piece.
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
import type { StockCountUpdateInput } from '@drinks/shared/schemas';
import type { SubWarehouse } from '@drinks/db';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  inventory,
  purchases,
  sales,
  type ServiceContext,
  stockCounts,
  withTransaction,
} from '../../src/index';

let f: StoreFixture;
let owner: ServiceContext;
let staff: ServiceContext;
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
    requestId: 'req-stock-count-post',
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

const costOf = (product = productId) =>
  prisma.productCost.findUniqueOrThrow({
    where: { storeId_productId: { storeId: f.store.id, productId: product } },
  });

/** Pieces counted in a sub-warehouse (blocks 0). */
const line = (subWarehouseId: string, pieces: number, product = productId) => ({
  subWarehouseId,
  productId: product,
  blocks: 0,
  pieces,
});

/** Opens a count of f.warehouse and saves `lines` (version 1). */
async function counted(lines: StockCountUpdateInput['lines'], docDate = day(0)) {
  const { id } = await stockCounts.open(owner, {
    warehouseId: f.warehouse.id,
    docDate,
    note: null,
  });
  await stockCounts.update(owner, { id, version: 0, docDate, note: null, lines });
  return id;
}

const post = (id: string, ctx = owner, version = 1) => stockCounts.post(ctx, { id, version });

const resultsOf = (stockCountId: string) =>
  prisma.stockCountResult.findMany({ where: { stockCountId }, orderBy: { productId: 'asc' } });

const movementsOf = (stockCountId: string) =>
  prisma.stockMovement.findMany({ where: { stockCountId }, orderBy: { id: 'asc' } });

describe('stockCounts.post — the three SRS cases (BR-8, §6.2)', () => {
  it('shortage: the balance drops to the count, the loss is diff × avg; audit POST', async () => {
    await receive(20); // avg 5 000
    const id = await counted([line(subA.id, 17)]);

    const posted = await post(id);

    expect(posted).toMatchObject({
      status: 'POSTED',
      version: 2,
      postedBy: { id: f.owner.id },
      shortageAmount: 15_000,
      surplusAmount: 0,
      countedCount: 1,
    });
    expect(posted.postedAt).toBeInstanceOf(Date);
    expect(posted.rows).toEqual([
      expect.objectContaining({
        systemQty: 20,
        countedQty: 17,
        diffQty: -3,
        avgCost: '5000.0000',
        diffAmount: -15_000,
      }),
    ]);
    expect(posted).not.toHaveProperty('estimate');

    expect(await stockOf()).toBe(17);
    expect(await costOf()).toMatchObject({ totalQty: 17 });
    expect((await costOf()).avgCost.toFixed(4)).toBe('5000.0000');
    const [movement, ...rest] = await movementsOf(id);
    expect(rest).toEqual([]);
    expect(movement).toMatchObject({
      type: 'COUNT_ADJUSTMENT',
      subWarehouseId: subA.id,
      qtyDelta: -3,
      costAmount: -15_000n,
      createdById: f.owner.id,
    });
    expect(movement!.unitCost.toFixed(4)).toBe('5000.0000');
    const [result] = await resultsOf(id);
    expect(result).toMatchObject({ systemQty: 20, countedQty: 17, diffQty: -3, amount: -15_000n });
    expect(
      await prisma.stockCountLine.findFirstOrThrow({ where: { stockCountId: id } }),
    ).toMatchObject({ systemQty: 20, countedQty: 17 });

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: id, action: 'POST' },
    });
    expect(log).toMatchObject({ entityType: 'stock_count', userId: f.owner.id });
    expect(log.meta).not.toHaveProperty('backdated');
    expect(log.before).toMatchObject({ status: 'DRAFT', version: 1 });
    expect(log.after).toMatchObject({
      status: 'POSTED',
      number: 'I-000001',
      warehouseId: f.warehouse.id,
      shortageAmount: 15_000,
      surplusAmount: 0,
      results: [{ productId, systemQty: 20, countedQty: 17, qtyDelta: -3, amount: -15_000 }],
      movements: [{ productId, subWarehouseId: subA.id, qty: -3, unitCost: '5000.0000' }],
    });
  });

  it('surplus: the balance rises to the count, the gain is diff × avg', async () => {
    await receive(10, subA.id, productId, 4000); // avg 4 000
    const id = await counted([{ subWarehouseId: subA.id, productId, blocks: 2, pieces: 0 }]); // 12

    const posted = await post(id);

    expect(posted).toMatchObject({ shortageAmount: 0, surplusAmount: 8000 });
    expect(await stockOf()).toBe(12);
    expect(await costOf()).toMatchObject({ totalQty: 12 });
    expect((await resultsOf(id))[0]).toMatchObject({ diffQty: 2, amount: 8000n });
  });

  it('a move between sub-warehouses only fixes the location: no shortage, no surplus', async () => {
    await receive(20, subA.id);
    await receive(10, subB.id);
    const id = await counted([line(subA.id, 18), line(subB.id, 12)]);

    const posted = await post(id);

    expect(posted).toMatchObject({ shortageAmount: 0, surplusAmount: 0 });
    expect(posted.rows.map((row) => [row.diffQty, row.diffAmount])).toEqual([
      [-2, -10_000],
      [2, 10_000],
    ]);
    expect([await stockOf(subA.id), await stockOf(subB.id)]).toEqual([18, 12]);
    expect(await costOf()).toMatchObject({ totalQty: 30 });
    expect((await movementsOf(id)).map((m) => [m.subWarehouseId, m.qtyDelta])).toEqual([
      [subA.id, -2],
      [subB.id, 2],
    ]);
    expect(await resultsOf(id)).toEqual([
      expect.objectContaining({ systemQty: 30, countedQty: 30, diffQty: 0, amount: 0n }),
    ]);
  });
});

describe('stockCounts.post — rows', () => {
  it('OQ-13: an uncounted row keeps its balance; an explicit 0 writes the stock off', async () => {
    await receive(20, subA.id);
    await receive(10, subB.id);
    const water = (await makeProduct(prisma, { organizationId: f.organization.id })).id;
    await receive(5, subA.id, water, 1000);
    // Cola in B is left out; water in A is counted as 0.
    const id = await counted([line(subA.id, 20), line(subA.id, 0, water)]);

    const posted = await post(id);

    expect(await stockOf(subB.id)).toBe(10);
    expect(await stockOf(subA.id, water)).toBe(0);
    expect(posted.rows).toHaveLength(2);
    expect(posted).toMatchObject({ shortageAmount: 5000, surplusAmount: 0 });
    // Only the changed pair moves; an unchanged counted pair gets a result row, no movement.
    expect((await movementsOf(id)).map((m) => [m.productId, m.qtyDelta])).toEqual([[water, -5]]);
    const results = await resultsOf(id);
    expect(results.find((r) => r.productId === productId)).toMatchObject({
      systemQty: 20,
      countedQty: 20,
      diffQty: 0,
    });
    expect(await costOf()).toMatchObject({ totalQty: 30 });
  });

  it('extra goods found: a pair without stock gets it; never-bought goods are worth 0 (§6.4)', async () => {
    await receive(20, subA.id);
    const fresh = (await makeProduct(prisma, { organizationId: f.organization.id })).id;
    const id = await counted([line(subB.id, 4), line(subB.id, 3, fresh)]);

    const posted = await post(id);

    expect(await stockOf(subB.id)).toBe(4);
    expect(await stockOf(subB.id, fresh)).toBe(3);
    // Cola: +4 × 5 000; fresh: +3 × 0.
    expect(posted).toMatchObject({ shortageAmount: 0, surplusAmount: 20_000 });
    expect(await costOf(fresh)).toMatchObject({ totalQty: 3 });
    expect((await costOf(fresh)).avgCost.toFixed(4)).toBe('0.0000');
  });

  it('an archived product with stock can be counted to 0 (OQ-32)', async () => {
    await receive(6, subA.id);
    const id = await counted([line(subA.id, 0)]);
    await prisma.product.update({ where: { id: productId }, data: { archivedAt: new Date() } });

    await post(id);

    expect(await stockOf()).toBe(0);
  });

  it('a backdated count moves stock on its own date and is flagged in the audit (BR-13)', async () => {
    await receive(20);
    const id = await counted([line(subA.id, 19)], day(-3));

    const posted = await post(id);

    const [movement] = await movementsOf(id);
    expect(movement!.docDate).toEqual(posted.docDate);
    expect(
      await prisma.auditLog.findFirstOrThrow({ where: { entityId: id, action: 'POST' } }),
    ).toMatchObject({ meta: { backdated: true } });
  });
});

describe('stockCounts.post — after posting', () => {
  it('the warehouse block lifts: sales post there again and a new count may open', async () => {
    await receive(20);
    const id = await counted([line(subA.id, 12)]);
    await post(id);

    const sale = await sales.create(staff, {
      docDate: day(0),
      note: null,
      lines: [{ productId, subWarehouseId: subA.id, inputUnit: 'BLOCK', inputQty: 1 }],
      paidCash: 72_000,
      paidCard: 0,
      paidCredit: 0,
    });
    await sales.post(staff, { id: sale.id, version: 0 });
    expect(await stockOf()).toBe(6);
    const next = await stockCounts.open(staff, {
      warehouseId: f.warehouse.id,
      docDate: day(0),
      note: null,
    });
    expect(next.number).toBe('I-000002');
  });

  it('a posted count keeps the average it was adjusted at; it is read-only', async () => {
    await receive(20); // avg 5 000
    const id = await counted([line(subA.id, 18)]);
    await post(id);
    // A later purchase at 8 000 moves the average; the posted count must not.
    const later = await purchases.create(owner, {
      docDate: day(0),
      note: null,
      lines: [
        { productId, subWarehouseId: subA.id, inputUnit: 'PIECE', inputQty: 18, inputPrice: 8000 },
      ],
      paidCash: 144_000,
      paidCard: 0,
      paidCredit: 0,
    });
    await purchases.post(owner, { id: later.id, version: 0 });

    const detail = await stockCounts.get(owner, { id });
    expect(detail.rows).toEqual([
      expect.objectContaining({
        systemQty: 20,
        countedQty: 18,
        avgCost: '5000.0000',
        diffAmount: -10_000,
      }),
    ]);
    expect(detail.shortageAmount).toBe(10_000);

    for (const attempt of [
      () => post(id, owner, 2),
      () => stockCounts.update(owner, { id, version: 2, docDate: day(0), note: null, lines: [] }),
      () => stockCounts.cancel(owner, { id, version: 2 }),
    ]) {
      await expect(attempt()).rejects.toMatchObject({ code: ErrorCode.DOCUMENT_NOT_DRAFT });
    }
  });
});

describe('stockCounts.post — confidentiality (CLAUDE.md rule 6)', () => {
  it('STAFF posts and sees quantities only; OWNER sees the amounts in the list', async () => {
    await receive(20);
    const id = await counted([line(subA.id, 17)]);

    const posted = await post(id, staff);

    expect(posted).toMatchObject({ status: 'POSTED', postedBy: { id: f.staff.id } });
    expect(posted.rows.map((row) => row.diffQty)).toEqual([-3]);
    expect(JSON.stringify(posted)).not.toMatch(/cost|amount/i);
    expect(JSON.stringify(await stockCounts.get(staff, { id }))).not.toMatch(/cost|amount/i);
    expect(JSON.stringify((await stockCounts.list(staff)).items)).not.toMatch(/cost|amount/i);
    expect((await stockCounts.list(owner)).items[0]).toMatchObject({
      shortageAmount: 15_000,
      surplusAmount: 0,
    });
  });
});

describe('stockCounts.post — refusals', () => {
  it('a count with no counted line → STOCK_COUNT_EMPTY (OQ-33); it stays open', async () => {
    await receive(20);
    const id = await counted([]);

    await expect(post(id)).rejects.toMatchObject({ code: ErrorCode.STOCK_COUNT_EMPTY });
    expect(
      await prisma.stockCount.findUniqueOrThrow({ where: { id }, select: { status: true } }),
    ).toEqual({ status: 'DRAFT' });
  });

  it('a stale version → DOCUMENT_CHANGED; a cancelled count → DOCUMENT_NOT_DRAFT', async () => {
    await receive(20);
    const id = await counted([line(subA.id, 17)]);
    await expect(post(id, owner, 0)).rejects.toMatchObject({ code: ErrorCode.DOCUMENT_CHANGED });

    await stockCounts.cancel(owner, { id, version: 1 });
    await expect(post(id, owner, 2)).rejects.toMatchObject({ code: ErrorCode.DOCUMENT_NOT_DRAFT });
    expect(await stockOf()).toBe(20);
  });

  it('another store’s count is NOT_FOUND', async () => {
    const id = await counted([line(subA.id, 0)]);
    const foreign = await makeStoreFixture(prisma);
    const stranger: ServiceContext = {
      ...owner,
      user: { id: foreign.owner.id, role: 'OWNER', locale: 'uz' },
      storeId: foreign.store.id,
      organizationId: foreign.organization.id,
    };
    await expect(post(id, stranger)).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
  });

  it('two parallel posts of one version: one adjusts, the other gets DOCUMENT_NOT_DRAFT', async () => {
    await receive(20);
    const id = await counted([line(subA.id, 17)]);

    const outcomes = await Promise.allSettled([post(id), post(id, staff)]);

    expect(outcomes.map((o) => o.status).sort()).toEqual(['fulfilled', 'rejected']);
    const failed = outcomes.find((o) => o.status === 'rejected') as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ code: ErrorCode.DOCUMENT_NOT_DRAFT });
    expect(await stockOf()).toBe(17);
    expect(await movementsOf(id)).toHaveLength(1);
  });

  it('a count of the other warehouse leaves this one alone', async () => {
    await receive(20, subA.id);
    await receive(10, other.subWarehouses[0]!.id);
    const { id } = await stockCounts.open(owner, {
      warehouseId: other.id,
      docDate: day(0),
      note: null,
    });
    await stockCounts.update(owner, {
      id,
      version: 0,
      docDate: day(0),
      note: null,
      lines: [line(other.subWarehouses[0]!.id, 7)],
    });

    await post(id);

    expect([await stockOf(subA.id), await stockOf(other.subWarehouses[0]!.id)]).toEqual([20, 7]);
    expect(await costOf()).toMatchObject({ totalQty: 27 });
  });
});
