// T-802: sales report against a real Postgres. Stock comes in through the
// inventory module, sales go through sales.create → post (→ reverse), so the
// lines carry the cost frozen at posting exactly as in production. Period
// edges are checked by moving posted sales to given instants around Tashkent
// midnight (UTC+5). Cost and profit must be absent from the STAFF response.
import { prisma } from '@drinks/db';
import {
  assertInvariants,
  makeBrand,
  makeCategory,
  makeProduct,
  makeStoreFixture,
  type StoreFixture,
} from '@drinks/db/test-utils';
import { DomainError, ErrorCode, type SalesReport, storeToday } from '@drinks/shared';
import type { SaleDraftInput } from '@drinks/shared/schemas';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { inventory, reports, sales, type ServiceContext, withTransaction } from '../../src/index';

let f: StoreFixture;
let owner: ServiceContext;
let staff: ServiceContext;

function contexts(fixture: StoreFixture): { owner: ServiceContext; staff: ServiceContext } {
  const base = {
    storeId: fixture.store.id,
    organizationId: fixture.organization.id,
    requestId: 'req-sales-report',
  };
  return {
    owner: { ...base, user: { id: fixture.owner.id, role: 'OWNER', locale: 'uz' } },
    staff: { ...base, user: { id: fixture.staff.id, role: 'STAFF', locale: 'uz' } },
  };
}

beforeEach(async () => {
  f = await makeStoreFixture(prisma);
  ({ owner, staff } = contexts(f));
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

function product(data: Parameters<typeof makeProduct>[1] = {}, fixture: StoreFixture = f) {
  return makeProduct(prisma, { organizationId: fixture.organization.id, ...data });
}

function receive(
  productId: string,
  qty: number,
  costAmount: number,
  fixture: StoreFixture = f,
  ctx: ServiceContext = owner,
) {
  return withTransaction((tx) =>
    inventory.receive(tx, ctx, {
      type: 'PURCHASE',
      docDate: new Date(),
      lines: [
        {
          subWarehouseId: fixture.subWarehouse.id,
          productId,
          qty,
          unitCost: (costAmount / qty).toFixed(4),
          costAmount,
        },
      ],
    }),
  );
}

interface Line {
  productId: string;
  qty: number;
  /** Per piece — the product's salePrice. */
  price: number;
}

/** A cash sale in pieces on `docDate` (a store day). */
function draft(lines: Line[], docDate = day(-1), fixture: StoreFixture = f): SaleDraftInput {
  return {
    docDate,
    note: null,
    lines: lines.map((line) => ({
      productId: line.productId,
      subWarehouseId: fixture.subWarehouse.id,
      inputUnit: 'PIECE',
      inputQty: line.qty,
    })),
    paidCash: lines.reduce((sum, line) => sum + line.qty * line.price, 0),
    paidCard: 0,
    paidCredit: 0,
  };
}

async function postSale(lines: Line[], docDate?: string) {
  const created = await sales.create(staff, draft(lines, docDate));
  return sales.post(staff, { id: created.id, version: created.version });
}

/** Moves a posted sale to an exact instant (period edges); stock and cash are untouched. */
function moveTo(saleId: string, iso: string) {
  return prisma.sale.update({ where: { id: saleId }, data: { docDate: new Date(iso) } });
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

const qtyOf = (report: SalesReport) =>
  Object.fromEntries(report.items.map((row) => [row.product.name, row.qty]));

describe('sales report: totals by product (SRS §7.2, database §7.2)', () => {
  it('sums qty, revenue, frozen cost and gross profit of posted sales; drafts do not count', async () => {
    const category = await makeCategory(prisma, { organizationId: f.organization.id });
    const brand = await makeBrand(prisma, { organizationId: f.organization.id });
    const cola = await product({
      name: 'Cola',
      unitsPerBlock: 12,
      salePrice: 10_000n,
      sku: 'C-1',
      categoryId: category.id,
      brandId: brand.id,
    });
    const fanta = await product({ name: 'Fanta', unitsPerBlock: 6, salePrice: 8_000n });
    await product({ name: 'Suv', salePrice: 3_000n }); // never sold → no row
    await receive(cola.id, 40, 200_000); // avg 5 000
    // Fanta avg (3 000 + 8 000) / 7 = 1 571.4286 → 5 pieces cost round(7 857.143) = 7 857.
    await receive(fanta.id, 3, 3_000);
    await receive(fanta.id, 4, 8_000);

    await postSale(
      [
        { productId: cola.id, qty: 12, price: 10_000 },
        { productId: fanta.id, qty: 5, price: 8_000 },
      ],
      day(-3),
    );
    // The second sale books Cola at a later average: (28 × 5 000 + 2 × 20 000) / 30 = 6 000.
    await receive(cola.id, 2, 40_000);
    await postSale(
      [
        { productId: cola.id, qty: 2, price: 10_000 },
        { productId: cola.id, qty: 1, price: 10_000 },
      ],
      day(-2),
    );
    await sales.create(staff, draft([{ productId: cola.id, qty: 7, price: 10_000 }], day(-2)));
    // Archived after the sale: still reported, with the mark.
    await prisma.product.update({ where: { id: fanta.id }, data: { archivedAt: new Date() } });

    const report = await reports.sales(owner, { from: day(-7), to: day(0) });
    expect(report.items).toEqual([
      {
        product: {
          id: cola.id,
          name: 'Cola',
          sku: 'C-1',
          unitsPerBlock: 12,
          archived: false,
          category: { id: category.id, name: category.name },
          brand: { id: brand.id, name: brand.name },
        },
        qty: 15,
        revenue: 150_000,
        cost: 12 * 5_000 + 3 * 6_000,
        grossProfit: 150_000 - 78_000,
      },
      {
        product: {
          id: fanta.id,
          name: 'Fanta',
          sku: null,
          unitsPerBlock: 6,
          archived: true,
          category: null,
          brand: null,
        },
        qty: 5,
        revenue: 40_000,
        cost: 7_857,
        grossProfit: 32_143,
      },
    ]);
    expect(report.totals).toEqual({
      products: 2,
      sales: 2,
      revenue: 190_000,
      cost: 85_857,
      grossProfit: 104_143,
    });

    // Cross-check with the documents (P&L uses the same sums, business-logic §8).
    const posted = await prisma.sale.aggregate({
      where: { storeId: f.store.id, status: 'POSTED' },
      _sum: { totalAmount: true, costTotal: true },
    });
    expect(BigInt(report.totals.revenue)).toBe(posted._sum.totalAmount);
    expect(BigInt(report.totals.cost!)).toBe(posted._sum.costTotal);
    const movements = await prisma.stockMovement.aggregate({
      where: { storeId: f.store.id, type: 'SALE' },
      _sum: { costAmount: true },
    });
    expect(-Number(movements._sum.costAmount)).toBe(report.totals.cost);
  });

  it('an empty period gives no rows and zero totals', async () => {
    const report = await reports.sales(owner, { from: day(-1), to: day(0) });
    expect(report).toEqual({
      items: [],
      totals: { products: 0, sales: 0, revenue: 0, cost: 0, grossProfit: 0 },
    });
  });

  it('a negative gross profit stays negative', async () => {
    const cheap = await product({ name: 'Arzon', salePrice: 1_000n });
    await receive(cheap.id, 4, 6_000); // 1 500 per piece, sold at 1 000
    await postSale([{ productId: cheap.id, qty: 4, price: 1_000 }]);
    const [row] = (await reports.sales(owner)).items;
    expect(row).toMatchObject({ revenue: 4_000, cost: 6_000, grossProfit: -2_000 });
  });
});

describe('sales report: reversal (BR-3, OQ-01)', () => {
  it('a reversed sale drops out of its own date; the rest stays', async () => {
    const cola = await product({ name: 'Cola', salePrice: 10_000n });
    const pepsi = await product({ name: 'Pepsi', salePrice: 9_000n });
    await receive(cola.id, 20, 100_000);
    await receive(pepsi.id, 10, 40_000);
    const kept = await postSale([{ productId: cola.id, qty: 2, price: 10_000 }], day(-2));
    const reversed = await postSale(
      [
        { productId: cola.id, qty: 3, price: 10_000 },
        { productId: pepsi.id, qty: 4, price: 9_000 },
      ],
      day(-2),
    );
    const before = await reports.sales(owner, { from: day(-2), to: day(-2) });
    expect(qtyOf(before)).toEqual({ Cola: 5, Pepsi: 4 });

    await sales.reverse(owner, { id: reversed.id, reason: 'Mijoz qaytardi' });
    const after = await reports.sales(owner, { from: day(-2), to: day(-2) });
    expect(qtyOf(after)).toEqual({ Cola: 2 });
    expect(after.totals).toEqual({
      products: 1,
      sales: 1,
      revenue: kept.totalAmount,
      cost: 10_000,
      grossProfit: 10_000,
    });
    // Nor does it show up on the day it was reversed.
    expect((await reports.sales(owner, { from: day(0), to: day(0) })).items).toEqual([]);
  });
});

describe('sales report: period in store days (Asia/Tashkent, database §7)', () => {
  it('a day runs from 00:00 to 24:00 Tashkent time (19:00Z the day before)', async () => {
    const cola = await product({ name: 'Cola', salePrice: 1_000n });
    await receive(cola.id, 100, 50_000);
    // Relative to today: the DB rejects document dates in the future.
    const [before, target, after, later, future] = [day(-11), day(-10), day(-9), day(-3), day(1)];
    const at = async (qty: number, instant: string) => {
      const sale = await postSale([{ productId: cola.id, qty, price: 1_000 }], day(-1));
      await moveTo(sale.id, instant);
    };
    const midnight = new Date(`${target}T00:00:00+05:00`).toISOString();
    expect(midnight).toBe(`${before}T19:00:00.000Z`);
    await at(1, `${before}T18:59:59.999Z`); // `before` 23:59:59.999 Tashkent
    await at(2, midnight); // `target` 00:00
    await at(4, `${target}T18:59:59.999Z`); // `target` 23:59:59.999
    await at(8, `${target}T19:00:00.000Z`); // `after` 00:00
    await at(16, `${later}T18:59:59.999Z`); // `later` 23:59:59.999

    const qty = async (from?: string, to?: string) =>
      (await reports.sales(owner, { from, to })).items[0]?.qty ?? 0;
    expect(await qty(target, target)).toBe(2 + 4);
    expect(await qty(before, before)).toBe(1);
    expect(await qty(after, after)).toBe(8);
    expect(await qty(target, later)).toBe(2 + 4 + 8 + 16);
    expect(await qty(target, day(-4))).toBe(2 + 4 + 8);
    // Open ends.
    expect(await qty(after)).toBe(8 + 16);
    expect(await qty(undefined, before)).toBe(1);
    expect(await qty()).toBe(31);
    expect(await qty(day(-2), future)).toBe(0);
    expect((await reports.sales(owner, { from: target, to: target })).totals).toEqual({
      products: 1,
      sales: 2,
      revenue: 6_000,
      cost: 3_000,
      grossProfit: 3_000,
    });
  });
});

describe('sales report: roles (SRS §7.2, CLAUDE.md rule 6)', () => {
  it('STAFF gets the same qty and revenue, and no cost or profit fields at all', async () => {
    const cola = await product({ name: 'Cola', unitsPerBlock: 12, salePrice: 10_000n });
    await receive(cola.id, 30, 123_457); // avg 4 115.2333 — a cost figure to look for
    await postSale([{ productId: cola.id, qty: 13, price: 10_000 }]);

    const ownerReport = await reports.sales(owner);
    const staffReport = await reports.sales(staff);
    expect(ownerReport.items[0]).toHaveProperty('cost', 53_498);
    expect(staffReport).toEqual({
      items: [
        {
          product: expect.objectContaining({ id: cola.id, name: 'Cola' }),
          qty: 13,
          revenue: 130_000,
        },
      ],
      totals: { products: 1, sales: 1, revenue: 130_000 },
    });
    expect(Object.keys(staffReport.items[0]!).sort()).toEqual(['product', 'qty', 'revenue']);
    expect(Object.keys(staffReport.totals).sort()).toEqual(['products', 'revenue', 'sales']);
    const json = JSON.stringify(staffReport);
    expect(json).not.toMatch(/cost|profit|cogs/i);
    expect(json).not.toContain('53498');
    expect(json).not.toContain('76502');
  });
});

describe('sales report: scope and validation', () => {
  it('counts only this store: sales of another organization are left out', async () => {
    const cola = await product({ name: 'Cola', salePrice: 1_000n });
    await receive(cola.id, 10, 5_000);
    await postSale([{ productId: cola.id, qty: 3, price: 1_000 }]);

    const other = await makeStoreFixture(prisma);
    const otherCtx = contexts(other);
    const otherCola = await product({ name: 'Cola', salePrice: 1_000n }, other);
    await receive(otherCola.id, 10, 5_000, other, otherCtx.owner);
    const created = await sales.create(
      otherCtx.staff,
      draft([{ productId: otherCola.id, qty: 5, price: 1_000 }], day(-1), other),
    );
    await sales.post(otherCtx.staff, { id: created.id, version: created.version });

    expect(qtyOf(await reports.sales(owner))).toEqual({ Cola: 3 });
    expect(qtyOf(await reports.sales(otherCtx.owner))).toEqual({ Cola: 5 });
  });

  it('rejects malformed days and a reversed range with VALIDATION_FAILED', async () => {
    for (const query of [
      { from: '2026-02-30' },
      { to: '01.10.2026' },
      { from: '2026-10-02', to: '2026-10-01' },
    ]) {
      const error = await caught(reports.sales(owner, query));
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
    }
  });
});
