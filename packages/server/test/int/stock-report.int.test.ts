// T-801: stock report against a real Postgres. Stock arrives and leaves only
// through inventory.receive / issue, so stock_balance and product_cost match
// stock_movement (assertInvariants), and the report is checked against the
// movement sums. Cost columns must be absent from the STAFF response.
import { prisma } from '@drinks/db';
import {
  assertInvariants,
  makeBrand,
  makeCategory,
  makeProduct,
  makeStoreFixture,
  makeWarehouse,
  type StoreFixture,
} from '@drinks/db/test-utils';
import { DomainError, ErrorCode, type StockReport, type UserRole } from '@drinks/shared';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { inventory, reports, type ServiceContext, withTransaction } from '../../src/index';

let f: StoreFixture;
/** Warehouse "Asosiy" with A, B; warehouse "Zaxira" with C. */
let subA: string;
let subB: string;
let subC: string;
let mainId: string;
let reserveId: string;
const docDate = new Date('2026-10-01T09:00:00Z');

beforeEach(async () => {
  f = await makeStoreFixture(prisma);
  const main = await makeWarehouse(prisma, {
    storeId: f.store.id,
    name: 'Asosiy',
    subWarehouses: ['A', 'B'],
  });
  const reserve = await makeWarehouse(prisma, {
    storeId: f.store.id,
    name: 'Zaxira',
    subWarehouses: ['C'],
  });
  [subA, subB] = main.subWarehouses.map((s) => s.id) as [string, string];
  subC = reserve.subWarehouses[0]!.id;
  mainId = main.id;
  reserveId = reserve.id;
});

afterEach(async () => {
  await assertInvariants(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

function ctxFor(role: UserRole, fixture: StoreFixture = f): ServiceContext {
  const user = role === 'OWNER' ? fixture.owner : fixture.staff;
  return {
    user: { id: user.id, role, locale: 'uz' },
    storeId: fixture.store.id,
    organizationId: fixture.organization.id,
    requestId: `req-${role}`,
  };
}

function product(data: Parameters<typeof makeProduct>[1] = {}) {
  return makeProduct(prisma, { organizationId: f.organization.id, ...data });
}

function receive(lines: { product: string; sub: string; qty: number; total: number }[]) {
  return withTransaction((tx) =>
    inventory.receive(tx, ctxFor('STAFF'), {
      type: 'PURCHASE',
      docDate,
      lines: lines.map((l) => ({
        subWarehouseId: l.sub,
        productId: l.product,
        qty: l.qty,
        unitCost: (l.total / l.qty).toFixed(4),
        costAmount: l.total,
      })),
    }),
  );
}

function issue(lines: { product: string; sub: string; qty: number }[]) {
  return withTransaction((tx) =>
    inventory.issue(tx, ctxFor('STAFF'), {
      type: 'SALE',
      docDate,
      lines: lines.map((l, i) => ({
        subWarehouseId: l.sub,
        productId: l.product,
        qty: l.qty,
        lineNo: i + 1,
      })),
    }),
  );
}

/** Σ stock_movement.qty_delta per (product, sub-warehouse) and per product. */
async function movementSums() {
  const rows = await prisma.stockMovement.groupBy({
    by: ['productId', 'subWarehouseId'],
    where: { storeId: f.store.id },
    _sum: { qtyDelta: true },
  });
  const perLocation = new Map<string, number>();
  const perProduct = new Map<string, number>();
  for (const row of rows) {
    const qty = row._sum.qtyDelta ?? 0;
    perLocation.set(`${row.productId}/${row.subWarehouseId}`, qty);
    perProduct.set(row.productId, (perProduct.get(row.productId) ?? 0) + qty);
  }
  return { perLocation, perProduct };
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

const names = (report: StockReport) => report.items.map((row) => row.product.name);

describe('stock report: totals (SRS §7.1)', () => {
  it('per product and per sub-warehouse match the stock movements', async () => {
    const cola = await product({ name: 'Cola', unitsPerBlock: 12 });
    const fanta = await product({ name: 'Fanta', unitsPerBlock: 6 });
    const water = await product({ name: 'Suv' });
    await receive([
      { product: cola.id, sub: subA, qty: 30, total: 150_000 },
      { product: cola.id, sub: subB, qty: 10, total: 60_000 },
      { product: cola.id, sub: subC, qty: 5, total: 25_000 },
      { product: fanta.id, sub: subB, qty: 8, total: 40_000 },
      { product: water.id, sub: subC, qty: 4, total: 8_000 },
    ]);
    await issue([
      { product: cola.id, sub: subA, qty: 7 },
      { product: fanta.id, sub: subB, qty: 3 },
      { product: water.id, sub: subC, qty: 4 },
    ]);

    const report = await reports.stock(ctxFor('OWNER'));
    const { perLocation, perProduct } = await movementSums();

    // Suv is sold out: no stock_balance row with qty > 0, so it is not listed.
    expect(names(report)).toEqual(['Cola', 'Fanta']);
    for (const row of report.items) {
      expect(row.qty).toBe(perProduct.get(row.product.id));
      expect(row.storeQty).toBe(row.qty);
      for (const location of row.locations) {
        expect(location.qty).toBe(perLocation.get(`${row.product.id}/${location.subWarehouse.id}`));
      }
    }
    const [colaRow, fantaRow] = report.items as [StockReport['items'][0], StockReport['items'][0]];
    expect(colaRow.qty).toBe(38);
    expect(colaRow.product.unitsPerBlock).toBe(12);
    expect(colaRow.locations).toEqual([
      { warehouse: { id: mainId, name: 'Asosiy' }, subWarehouse: { id: subA, name: 'A' }, qty: 23 },
      { warehouse: { id: mainId, name: 'Asosiy' }, subWarehouse: { id: subB, name: 'B' }, qty: 10 },
      {
        warehouse: { id: reserveId, name: 'Zaxira' },
        subWarehouse: { id: subC, name: 'C' },
        qty: 5,
      },
    ]);
    expect(fantaRow.locations).toEqual([
      { warehouse: { id: mainId, name: 'Asosiy' }, subWarehouse: { id: subB, name: 'B' }, qty: 5 },
    ]);
  });

  it('OWNER gets average cost and value; value total sums the rows', async () => {
    const cola = await product({ name: 'Cola' });
    const fanta = await product({ name: 'Fanta' });
    // Cola: (10 × 5000 + 20 × 5600) / 30 = 5400.0000; Fanta: 7000 / 3 = 2333.3333.
    await receive([
      { product: cola.id, sub: subA, qty: 10, total: 50_000 },
      { product: fanta.id, sub: subA, qty: 3, total: 7_000 },
    ]);
    await receive([{ product: cola.id, sub: subC, qty: 20, total: 112_000 }]);
    await issue([{ product: cola.id, sub: subA, qty: 5 }]);

    const report = await reports.stock(ctxFor('OWNER'));
    expect(report.items.map((r) => [r.product.name, r.qty, r.avgCost, r.value])).toEqual([
      ['Cola', 25, '5400.0000', 135_000],
      ['Fanta', 3, '2333.3333', 7_000], // 6999.9999 → 7000 (half up)
    ]);
    expect(report.totals).toEqual({ products: 2, value: 142_000 });

    // A warehouse filter narrows qty and value; the average stays store-wide.
    const reserve = await reports.stock(ctxFor('OWNER'), { warehouseId: reserveId });
    expect(reserve.items.map((r) => [r.product.name, r.qty, r.storeQty, r.value])).toEqual([
      ['Cola', 20, 25, 108_000],
    ]);
    expect(reserve.totals).toEqual({ products: 1, value: 108_000 });
  });
});

describe('stock report: access (CLAUDE.md rule 6)', () => {
  it('STAFF response has no cost or value fields at all', async () => {
    const cola = await product({ name: 'Cola' });
    await receive([{ product: cola.id, sub: subA, qty: 7, total: 43_211 }]);

    const report = await reports.stock(ctxFor('STAFF'));
    expect(report.items).toHaveLength(1);
    expect(report.items[0]).not.toHaveProperty('avgCost');
    expect(report.items[0]).not.toHaveProperty('value');
    expect(report.totals).toEqual({ products: 1 });

    const json = JSON.stringify(report);
    expect(json).not.toMatch(/avgCost|value|cost/i);
    // Neither the average (6173.0000) nor the stock value (43 211) leaks.
    expect(json).not.toContain('6173');
    expect(json).not.toContain('43211');

    const owner = JSON.stringify(await reports.stock(ctxFor('OWNER')));
    expect(owner).toContain('"avgCost":"6173.0000"');
    expect(owner).toContain('"value":43211');
  });

  it('OWNER with no rows still gets a value total of 0', async () => {
    expect((await reports.stock(ctxFor('OWNER'))).totals).toEqual({ products: 0, value: 0 });
    expect((await reports.stock(ctxFor('STAFF'))).totals).toEqual({ products: 0 });
  });

  it('shows only the own store and organization', async () => {
    const cola = await product({ name: 'Cola' });
    await receive([{ product: cola.id, sub: subA, qty: 3, total: 3_000 }]);
    const other = await makeStoreFixture(prisma);
    const otherReport = await reports.stock(ctxFor('OWNER', other));
    expect(otherReport.items).toEqual([]);
    // Another store's warehouse id matches nothing here.
    const foreign = await makeWarehouse(prisma, { storeId: other.store.id });
    expect((await reports.stock(ctxFor('OWNER'), { warehouseId: foreign.id })).items).toEqual([]);
  });

  it('rejects invalid filters with VALIDATION_FAILED', async () => {
    for (const query of [{ warehouseId: 'abc' }, { lowStock: 'yes' as unknown as boolean }]) {
      const error = await caught(reports.stock(ctxFor('OWNER'), query));
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
    }
  });
});

describe('stock report: filters', () => {
  it('by warehouse and sub-warehouse', async () => {
    const cola = await product({ name: 'Cola' });
    const fanta = await product({ name: 'Fanta' });
    await receive([
      { product: cola.id, sub: subA, qty: 4, total: 4_000 },
      { product: cola.id, sub: subC, qty: 6, total: 6_000 },
      { product: fanta.id, sub: subB, qty: 2, total: 2_000 },
    ]);
    const main = await reports.stock(ctxFor('STAFF'), { warehouseId: mainId });
    expect(main.items.map((r) => [r.product.name, r.qty, r.locations.length])).toEqual([
      ['Cola', 4, 1],
      ['Fanta', 2, 1],
    ]);
    const onlyB = await reports.stock(ctxFor('STAFF'), { subWarehouseId: subB });
    expect(names(onlyB)).toEqual(['Fanta']);
    // A sub-warehouse of another warehouse: nothing.
    expect(
      (await reports.stock(ctxFor('STAFF'), { warehouseId: reserveId, subWarehouseId: subB }))
        .items,
    ).toEqual([]);
  });

  it('by category and brand', async () => {
    const soda = await makeCategory(prisma, { organizationId: f.organization.id });
    const juice = await makeCategory(prisma, { organizationId: f.organization.id });
    const brand = await makeBrand(prisma, { organizationId: f.organization.id });
    const cola = await product({ name: 'Cola', categoryId: soda.id, brandId: brand.id });
    const fanta = await product({ name: 'Fanta', categoryId: soda.id });
    const apple = await product({ name: 'Olma sharbati', categoryId: juice.id, brandId: brand.id });
    await receive(
      [cola, fanta, apple].map((p) => ({ product: p.id, sub: subA, qty: 1, total: 1_000 })),
    );
    expect(names(await reports.stock(ctxFor('STAFF'), { categoryId: soda.id }))).toEqual([
      'Cola',
      'Fanta',
    ]);
    expect(names(await reports.stock(ctxFor('STAFF'), { brandId: brand.id }))).toEqual([
      'Cola',
      'Olma sharbati',
    ]);
    const both = await reports.stock(ctxFor('STAFF'), { categoryId: soda.id, brandId: brand.id });
    expect(both.items.map((r) => [r.product.name, r.product.category, r.product.brand])).toEqual([
      ['Cola', { id: soda.id, name: soda.name }, { id: brand.id, name: brand.name }],
    ]);
  });

  it('low stock: store-wide total below the minimum, out-of-stock included (OQ-28)', async () => {
    const low = await product({ name: 'Cola', minStock: 12 });
    const enough = await product({ name: 'Fanta', minStock: 5 });
    const noMin = await product({ name: 'Pepsi', minStock: 0 });
    await product({ name: 'Sprite', minStock: 6 }); // never received
    await product({ name: 'Tarxun', minStock: 0 }); // never received, no minimum
    await receive([
      { product: low.id, sub: subA, qty: 5, total: 5_000 },
      { product: low.id, sub: subC, qty: 6, total: 6_000 },
      { product: enough.id, sub: subA, qty: 5, total: 5_000 },
      { product: noMin.id, sub: subA, qty: 1, total: 1_000 },
    ]);

    const all = await reports.stock(ctxFor('STAFF'));
    expect(all.items.map((r) => [r.product.name, r.lowStock])).toEqual([
      ['Cola', true],
      ['Fanta', false],
      ['Pepsi', false],
    ]);

    const lowOnly = await reports.stock(ctxFor('STAFF'), { lowStock: true });
    expect(lowOnly.items.map((r) => [r.product.name, r.qty, r.storeQty, r.locations])).toEqual([
      ['Cola', 11, 11, expect.any(Array)],
      ['Sprite', 0, 0, []],
    ]);

    // With a location filter only products stocked there are listed; low
    // stock still compares the store-wide total (5 + 6 = 11 < 12).
    const lowInC = await reports.stock(ctxFor('STAFF'), { lowStock: true, warehouseId: reserveId });
    expect(lowInC.items.map((r) => [r.product.name, r.qty, r.storeQty])).toEqual([['Cola', 6, 11]]);
  });

  it('archived: both by default, active or archived on request', async () => {
    const cola = await product({ name: 'Cola' });
    const old = await product({ name: 'Eski limonad', archivedAt: new Date() });
    await receive([
      { product: cola.id, sub: subA, qty: 2, total: 2_000 },
      { product: old.id, sub: subA, qty: 3, total: 3_000 },
    ]);
    const all = await reports.stock(ctxFor('STAFF'));
    expect(all.items.map((r) => [r.product.name, r.product.archived])).toEqual([
      ['Cola', false],
      ['Eski limonad', true],
    ]);
    expect(names(await reports.stock(ctxFor('STAFF'), { archived: false }))).toEqual(['Cola']);
    expect(names(await reports.stock(ctxFor('STAFF'), { archived: true }))).toEqual([
      'Eski limonad',
    ]);
  });
});
