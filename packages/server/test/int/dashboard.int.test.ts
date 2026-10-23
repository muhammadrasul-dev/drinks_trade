// T-902: home page summary against a real Postgres. Low stock must follow the
// stock report's rule (business-logic §9, OQ-28) — store-wide sum, minimum 0
// ignored, archived products left out (OQ-39) — and drafts are counted per
// store. No cost or amount keys for either role (CLAUDE.md rule 6).
import { prisma } from '@drinks/db';
import {
  assertInvariants,
  makeOrganization,
  makeProduct,
  makeStore,
  makeStoreFixture,
  makeWarehouse,
  type StoreFixture,
} from '@drinks/db/test-utils';
import { DASHBOARD_LOW_STOCK_LIMIT, type UserRole } from '@drinks/shared';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  dashboard,
  inventory,
  reports,
  type ServiceContext,
  withTransaction,
} from '../../src/index';

let f: StoreFixture;
/** Warehouse "Asosiy" with A; warehouse "Zaxira" with C. */
let subA: string;
let subC: string;
const docDate = new Date('2026-10-01T09:00:00Z');

beforeEach(async () => {
  f = await makeStoreFixture(prisma);
  const main = await makeWarehouse(prisma, {
    storeId: f.store.id,
    name: 'Asosiy',
    subWarehouses: ['A'],
  });
  const reserve = await makeWarehouse(prisma, {
    storeId: f.store.id,
    name: 'Zaxira',
    subWarehouses: ['C'],
  });
  subA = main.subWarehouses[0]!.id;
  subC = reserve.subWarehouses[0]!.id;
});

afterEach(async () => {
  await assertInvariants(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

interface Scope {
  storeId: string;
  organizationId: string;
  owner: { id: string };
  staff: { id: string };
}

function scopeOf(fixture: StoreFixture): Scope {
  return {
    storeId: fixture.store.id,
    organizationId: fixture.organization.id,
    owner: fixture.owner,
    staff: fixture.staff,
  };
}

function ctxFor(role: UserRole, scope: Scope = scopeOf(f)): ServiceContext {
  const user = role === 'OWNER' ? scope.owner : scope.staff;
  return {
    user: { id: user.id, role, locale: 'uz' },
    storeId: scope.storeId,
    organizationId: scope.organizationId,
    requestId: `req-${role}`,
  };
}

function product(data: Parameters<typeof makeProduct>[1] = {}) {
  return makeProduct(prisma, { organizationId: f.organization.id, ...data });
}

function receive(
  lines: { product: string; sub: string; qty: number }[],
  scope: Scope = scopeOf(f),
) {
  return withTransaction((tx) =>
    inventory.receive(tx, ctxFor('STAFF', scope), {
      type: 'PURCHASE',
      docDate,
      lines: lines.map((l) => ({
        subWarehouseId: l.sub,
        productId: l.product,
        qty: l.qty,
        unitCost: '1000.0000',
        costAmount: l.qty * 1000,
      })),
    }),
  );
}

/** A second store of the same organization (products are shared, stock is not). */
async function siblingStore(): Promise<Scope & { sub: string; warehouseId: string }> {
  const store = await makeStore(prisma, { organizationId: f.organization.id });
  const warehouse = await makeWarehouse(prisma, { storeId: store.id, subWarehouses: ['X'] });
  return {
    storeId: store.id,
    organizationId: f.organization.id,
    owner: f.owner,
    staff: f.staff,
    sub: warehouse.subWarehouses[0]!.id,
    warehouseId: warehouse.id,
  };
}

const lowNames = async (role: UserRole = 'STAFF') =>
  (await dashboard.summary(ctxFor(role))).lowStock!.items.map((item) => item.name);

describe('dashboard: low stock (FR-1.3, business-logic §9)', () => {
  it('sums the stock of every warehouse in the store; minimum 0 is never low', async () => {
    const spread = await product({ name: 'Cola', minStock: 10 });
    const short = await product({ name: 'Fanta', minStock: 10 });
    const exact = await product({ name: 'Pepsi', minStock: 4 });
    const empty = await product({ name: 'Sprite', minStock: 3, unitsPerBlock: 12 });
    await product({ name: 'Suv', minStock: 0 });
    await receive([
      { product: spread.id, sub: subA, qty: 6 },
      { product: spread.id, sub: subC, qty: 5 },
      { product: short.id, sub: subA, qty: 4 },
      { product: short.id, sub: subC, qty: 5 },
      { product: exact.id, sub: subC, qty: 4 },
    ]);

    const { lowStock } = await dashboard.summary(ctxFor('STAFF'));
    expect(lowStock).toEqual({
      total: 2,
      items: [
        { id: empty.id, name: 'Sprite', unitsPerBlock: 12, stockQty: 0, minStock: 3 },
        { id: short.id, name: 'Fanta', unitsPerBlock: 6, stockQty: 9, minStock: 10 },
      ],
    });
  });

  it('matches the stock report low-stock filter over active products', async () => {
    const a = await product({ name: 'A', minStock: 5 });
    const b = await product({ name: 'B', minStock: 20 });
    const c = await product({ name: 'C', minStock: 2 });
    await product({ name: 'D', minStock: 1 });
    await product({ name: 'E' });
    await receive([
      { product: a.id, sub: subA, qty: 3 },
      { product: b.id, sub: subC, qty: 25 },
      { product: c.id, sub: subA, qty: 1 },
    ]);

    for (const role of ['OWNER', 'STAFF'] as const) {
      const ctx = ctxFor(role);
      const [{ lowStock }, report] = await Promise.all([
        dashboard.summary(ctx),
        reports.stock(ctx, { lowStock: true, archived: false }),
      ]);
      expect(lowStock!.total).toBe(report.totals.products);
      expect(lowStock!.items.map((item) => item.id).sort()).toEqual(
        report.items.map((row) => row.product.id).sort(),
      );
    }
  });

  it('leaves archived products out (OQ-39)', async () => {
    await product({ name: 'Arxiv', minStock: 5, archivedAt: new Date() });
    const active = await product({ name: 'Faol', minStock: 5 });
    expect(await lowNames()).toEqual(['Faol']);
    expect((await dashboard.summary(ctxFor('STAFF'))).lowStock!.items[0]!.id).toBe(active.id);
  });

  it('lists the most depleted first, at most the limit, and counts the rest (OQ-40)', async () => {
    const half = await product({ name: 'Half', minStock: 10 });
    const tenth = await product({ name: 'Tenth', minStock: 10 });
    await product({ name: 'Zero B', minStock: 4 });
    await product({ name: 'Zero A', minStock: 40 });
    await receive([
      { product: half.id, sub: subA, qty: 5 },
      { product: tenth.id, sub: subA, qty: 1 },
    ]);
    expect(await lowNames()).toEqual(['Zero A', 'Zero B', 'Tenth', 'Half']);

    const extra = DASHBOARD_LOW_STOCK_LIMIT;
    for (let i = 0; i < extra; i++) await product({ name: `Extra ${i}`, minStock: 1 });
    const { lowStock } = await dashboard.summary(ctxFor('OWNER'));
    expect(lowStock!.total).toBe(4 + extra);
    expect(lowStock!.items).toHaveLength(DASHBOARD_LOW_STOCK_LIMIT);
    expect(lowStock!.items.every((item) => item.stockQty === 0)).toBe(true);
  });

  it("uses only this store's stock; other organizations' products never show", async () => {
    const shared = await product({ name: 'Cola', minStock: 10 });
    const sibling = await siblingStore();
    await receive([{ product: shared.id, sub: sibling.sub, qty: 50 }], sibling);
    const otherOrg = await makeOrganization(prisma);
    await makeProduct(prisma, { organizationId: otherOrg.id, name: 'Begona', minStock: 5 });

    expect(await lowNames()).toEqual(['Cola']);
    const siblingLow = (await dashboard.summary(ctxFor('STAFF', sibling))).lowStock!;
    expect(siblingLow.total).toBe(0);
    expect(siblingLow.items).toEqual([]);
  });
});

describe('dashboard: open stock counts and drafts', () => {
  it('counts DRAFT sales and purchases of this store only; lists open stock counts', async () => {
    const sibling = await siblingStore();
    const doc = (storeId: string, number: string, status?: 'POSTED' | 'REVERSED') => ({
      storeId,
      number,
      docDate,
      createdById: f.staff.id,
      ...(status && { status }),
    });
    await prisma.sale.createMany({
      data: [
        doc(f.store.id, 'S-000001'),
        doc(f.store.id, 'S-000002'),
        doc(f.store.id, 'S-000003'),
        doc(f.store.id, 'S-000004', 'POSTED'),
        doc(f.store.id, 'S-000005', 'REVERSED'),
        doc(sibling.storeId, 'S-000001'),
      ],
    });
    await prisma.purchase.createMany({
      data: [
        doc(f.store.id, 'P-000001'),
        doc(f.store.id, 'P-000002', 'POSTED'),
        doc(sibling.storeId, 'P-000001'),
        doc(sibling.storeId, 'P-000002'),
      ],
    });
    const open = await prisma.stockCount.create({
      data: {
        storeId: f.store.id,
        warehouseId: f.warehouse.id,
        number: 'I-000002',
        docDate,
        createdById: f.staff.id,
      },
    });
    await prisma.stockCount.createMany({
      data: [
        {
          storeId: f.store.id,
          warehouseId: f.warehouse.id,
          number: 'I-000001',
          docDate,
          status: 'CANCELLED',
          createdById: f.staff.id,
        },
        {
          storeId: sibling.storeId,
          warehouseId: sibling.warehouseId,
          number: 'I-000001',
          docDate,
          createdById: f.staff.id,
        },
      ],
    });

    for (const role of ['OWNER', 'STAFF'] as const) {
      const summary = await dashboard.summary(ctxFor(role));
      expect(summary.draftSales).toBe(3);
      expect(summary.draftPurchases).toBe(1);
      expect(summary.openStockCounts).toEqual([
        {
          id: open.id,
          number: 'I-000002',
          warehouseId: f.warehouse.id,
          warehouseName: f.warehouse.name,
        },
      ]);
    }
    const siblingSummary = await dashboard.summary(ctxFor('OWNER', sibling));
    expect(siblingSummary.draftSales).toBe(1);
    expect(siblingSummary.draftPurchases).toBe(2);
    expect(siblingSummary.openStockCounts).toHaveLength(1);
  });

  it('an empty store: zero counts, empty lists', async () => {
    expect(await dashboard.summary(ctxFor('STAFF'))).toEqual({
      lowStock: { total: 0, items: [] },
      openStockCounts: [],
      draftSales: 0,
      draftPurchases: 0,
    });
  });
});

describe('dashboard: confidential data (CLAUDE.md rule 6)', () => {
  it('neither role gets cost, amount or cash keys', async () => {
    const cola = await product({ name: 'Cola', minStock: 10 });
    await receive([{ product: cola.id, sub: subA, qty: 3 }]);
    await prisma.sale.create({
      data: {
        storeId: f.store.id,
        number: 'S-000001',
        docDate,
        createdById: f.staff.id,
        totalAmount: 36_000n,
      },
    });

    for (const role of ['OWNER', 'STAFF'] as const) {
      const summary = await dashboard.summary(ctxFor(role));
      expect(Object.keys(summary).sort()).toEqual([
        'draftPurchases',
        'draftSales',
        'lowStock',
        'openStockCounts',
      ]);
      expect(Object.keys(summary.lowStock!.items[0]!).sort()).toEqual([
        'id',
        'minStock',
        'name',
        'stockQty',
        'unitsPerBlock',
      ]);
      const json = JSON.stringify(summary);
      for (const key of ['avgCost', 'value', 'cost', 'amount', 'Amount', 'balance', 'debt']) {
        expect(json).not.toContain(key);
      }
      // The average cost (1000.0000) of the only product.
      expect(json).not.toContain('1000.');
    }
  });
});
