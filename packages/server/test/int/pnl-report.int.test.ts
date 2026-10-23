// T-803: P&L (BR-11, business-logic §8, database §7.3) against a real
// Postgres. Every figure comes from real postings — purchases, sales (and
// their reversal), cash commands, debts and stock counts go through their
// services — and is compared with a hand-computed example. Period edges are
// checked at instants around Tashkent midnight (UTC+5). STAFF is FORBIDDEN.
import { prisma } from '@drinks/db';
import {
  assertInvariants,
  makeProduct,
  makeStoreFixture,
  makeSubWarehouse,
  makeWarehouse,
  type StoreFixture,
} from '@drinks/db/test-utils';
import { DomainError, ErrorCode, type PnlReport } from '@drinks/shared';
import type { SaleDraftInput, StockCountUpdateInput } from '@drinks/shared/schemas';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  cashCommands,
  debtCommands,
  inventory,
  purchases,
  reports,
  sales,
  type ServiceContext,
  stockCounts,
  withTransaction,
} from '../../src/index';
import { day } from './helpers';

let f: StoreFixture;
let owner: ServiceContext;
let staff: ServiceContext;

function contexts(fixture: StoreFixture): { owner: ServiceContext; staff: ServiceContext } {
  const base = {
    storeId: fixture.store.id,
    organizationId: fixture.organization.id,
    requestId: 'req-pnl-report',
  };
  return {
    owner: { ...base, user: { id: fixture.owner.id, role: 'OWNER', locale: 'uz' } },
    staff: { ...base, user: { id: fixture.staff.id, role: 'STAFF', locale: 'uz' } },
  };
}

beforeEach(async () => {
  f = await makeStoreFixture(prisma, { cashBalance: 1_000_000n });
  ({ owner, staff } = contexts(f));
});

afterEach(async () => {
  await assertInvariants(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const EMPTY: PnlReport = {
  revenue: 0,
  cogs: 0,
  grossProfit: 0,
  travelExpense: 0,
  stockShortage: 0,
  stockSurplus: 0,
  netProfit: 0,
  counts: { sales: 0, travelExpenses: 0, stockCounts: 0 },
};

function product(name: string, salePrice: bigint, fixture: StoreFixture = f) {
  return makeProduct(prisma, { organizationId: fixture.organization.id, name, salePrice });
}

/** Stock at `unitCost` a piece straight through the inventory module (no purchase document). */
function receive(productId: string, qty: number, unitCost: number, fixture = f, ctx = owner) {
  return withTransaction((tx) =>
    inventory.receive(tx, ctx, {
      type: 'PURCHASE',
      docDate: new Date(),
      lines: [
        {
          subWarehouseId: fixture.subWarehouse.id,
          productId,
          qty,
          unitCost: `${unitCost}.0000`,
          costAmount: qty * unitCost,
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

/** A sale in pieces on `docDate`; paid in cash, or on credit with `credit`. */
function draft(lines: Line[], docDate: string, credit = false, fixture = f): SaleDraftInput {
  const total = lines.reduce((sum, line) => sum + line.qty * line.price, 0);
  return {
    docDate,
    note: credit ? 'Nasiya: Ali aka' : null,
    lines: lines.map((line) => ({
      productId: line.productId,
      subWarehouseId: fixture.subWarehouse.id,
      inputUnit: 'PIECE',
      inputQty: line.qty,
    })),
    paidCash: credit ? 0 : total,
    paidCard: 0,
    paidCredit: credit ? total : 0,
  };
}

async function postSale(lines: Line[], docDate: string, credit = false, ctx = staff, fixture = f) {
  const created = await sales.create(ctx, draft(lines, docDate, credit, fixture));
  return sales.post(ctx, { id: created.id, version: created.version });
}

const travel = (amount: number, date: string) =>
  cashCommands.travelExpense(owner, { cashbox: 'CASH', amount, date });

/** Pieces counted in a sub-warehouse. */
const counted = (subWarehouseId: string, productId: string, pieces: number) => ({
  subWarehouseId,
  productId,
  blocks: 0,
  pieces,
});

/** Opens a count of `warehouseId`, saves `lines` and posts it. */
async function postCount(
  lines: StockCountUpdateInput['lines'],
  docDate: string,
  warehouseId = f.warehouse.id,
) {
  const { id } = await stockCounts.open(owner, { warehouseId, docDate, note: null });
  await stockCounts.update(owner, { id, version: 0, docDate, note: null, lines });
  return stockCounts.post(owner, { id, version: 1 });
}

const pnl = (from?: string, to?: string) => reports.pnl(owner, { from, to });

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

describe('P&L: the BR-11 formula from real postings (business-logic §8)', () => {
  it('matches a hand-computed example; purchases, debts, other expenses and transfers stay out', async () => {
    const subB = await makeSubWarehouse(prisma, { warehouseId: f.warehouse.id, name: 'ZZ B' });
    const cola = await product('Cola', 10_000n);
    const fanta = await product('Fanta', 8_000n);
    // A purchase inside the period: stock, not an expense (BR-11).
    const purchase = await purchases.create(staff, {
      docDate: day(-2),
      note: null,
      lines: [
        {
          productId: cola.id,
          subWarehouseId: f.subWarehouse.id,
          inputUnit: 'PIECE',
          inputQty: 20,
          inputPrice: 5_000,
        },
        {
          productId: fanta.id,
          subWarehouseId: f.subWarehouse.id,
          inputUnit: 'PIECE',
          inputQty: 10,
          inputPrice: 3_000,
        },
      ],
      paidCash: 130_000,
      paidCard: 0,
      paidCredit: 0,
    });
    await purchases.post(staff, { id: purchase.id, version: purchase.version });

    // Sales: 3 Cola cash (30 000, cost 15 000) and 2 Fanta on credit (16 000,
    // cost 6 000) in the period; one more Cola is reversed; one before it.
    await postSale([{ productId: cola.id, qty: 3, price: 10_000 }], day(-2));
    await postSale([{ productId: fanta.id, qty: 2, price: 8_000 }], day(-1), true);
    const reversed = await postSale([{ productId: cola.id, qty: 1, price: 10_000 }], day(-2));
    await sales.reverse(owner, { id: reversed.id, reason: 'Mijoz qaytardi' });
    await postSale([{ productId: cola.id, qty: 1, price: 10_000 }], day(-4));
    // A draft is not a sale.
    await sales.create(staff, draft([{ productId: cola.id, qty: 5, price: 10_000 }], day(-1)));

    // Travel: 7 000 + 2 500 count; 4 000 is reversed; 1 000 is after the period.
    await travel(7_000, day(-2));
    await travel(2_500, day(-1));
    const wrong = await travel(4_000, day(-1));
    await cashCommands.reverse(owner, { id: wrong.id, note: 'Xato' });
    await travel(1_000, day(0));

    // Not in the P&L: other expense, transfer, debts given / taken / repaid.
    await cashCommands.otherExpense(owner, {
      cashbox: 'CASH',
      amount: 50_000,
      note: 'Egasi oldi',
      date: day(-1),
    });
    await cashCommands.transfer(owner, { from: 'CASH', to: 'CARD', amount: 20_000, date: day(-1) });
    const given = await debtCommands.open(owner, {
      direction: 'RECEIVABLE',
      cashbox: 'CASH',
      amount: 10_000,
      note: 'Qoʻshniga',
      date: day(-2),
    });
    await debtCommands.repay(owner, {
      debtId: given.id,
      cashbox: 'CASH',
      amount: 3_000,
      date: day(-1),
    });
    await debtCommands.open(owner, {
      direction: 'PAYABLE',
      cashbox: 'CARD',
      amount: 40_000,
      note: 'Akamdan',
      date: day(-1),
    });

    // Stock counts. Cola 16 left (20 − 3 − 1; the reversed one came back), Fanta 8.
    // Count 1: Cola 14 (shortage 2 × 5 000), Fanta 9 (surplus 1 × 3 000).
    const first = await postCount(
      [counted(f.subWarehouse.id, cola.id, 14), counted(f.subWarehouse.id, fanta.id, 9)],
      day(-1),
    );
    expect(first).toMatchObject({ shortageAmount: 10_000, surplusAmount: 3_000 });
    // Count 2: 2 Cola found in sub-warehouse B, missing from A — a move, 0 for the P&L.
    const move = await postCount(
      [counted(f.subWarehouse.id, cola.id, 12), counted(subB.id, cola.id, 2)],
      day(-1),
    );
    expect(move).toMatchObject({ shortageAmount: 0, surplusAmount: 0 });
    // A cancelled count does not count either.
    const other = await makeWarehouse(prisma, { storeId: f.store.id });
    const cancelled = await stockCounts.open(staff, {
      warehouseId: other.id,
      docDate: day(-1),
      note: null,
    });
    await stockCounts.cancel(staff, { id: cancelled.id, version: 0 });

    const report = await pnl(day(-3), day(-1));
    const revenue = 30_000 + 16_000;
    const cogs = 15_000 + 6_000;
    expect(report).toEqual({
      revenue,
      cogs,
      grossProfit: revenue - cogs,
      travelExpense: 7_000 + 2_500,
      stockShortage: 10_000,
      stockSurplus: 3_000,
      netProfit: revenue - cogs - 9_500 - 10_000 + 3_000,
      counts: { sales: 2, travelExpenses: 2, stockCounts: 2 },
    });
    expect(report.netProfit).toBe(8_500);

    // The sales report of the same period has the same revenue and cost (§8).
    const salesReport = await reports.sales(owner, { from: day(-3), to: day(-1) });
    expect(salesReport.totals).toMatchObject({ revenue: report.revenue, cost: report.cogs });

    // The whole history adds the sale before and the travel expense after.
    expect(await pnl()).toEqual({
      revenue: revenue + 10_000,
      cogs: cogs + 5_000,
      grossProfit: revenue - cogs + 5_000,
      travelExpense: 10_500,
      stockShortage: 10_000,
      stockSurplus: 3_000,
      netProfit: 8_500 + 5_000 - 1_000,
      counts: { sales: 3, travelExpenses: 3, stockCounts: 2 },
    });
  });

  it('an empty period is all zeros', async () => {
    expect(await pnl(day(-1), day(0))).toEqual(EMPTY);
  });

  it('a loss stays negative: shortage and travel above the gross profit', async () => {
    const cola = await product('Cola', 6_000n);
    await receive(cola.id, 10, 5_000);
    await postSale([{ productId: cola.id, qty: 1, price: 6_000 }], day(0));
    await travel(3_000, day(0));
    await postCount([counted(f.subWarehouse.id, cola.id, 8)], day(0)); // 1 missing

    expect(await pnl(day(0), day(0))).toEqual({
      revenue: 6_000,
      cogs: 5_000,
      grossProfit: 1_000,
      travelExpense: 3_000,
      stockShortage: 5_000,
      stockSurplus: 0,
      netProfit: -7_000,
      counts: { sales: 1, travelExpenses: 1, stockCounts: 1 },
    });
  });
});

describe('P&L: reversals drop out of their original date (OQ-01, OQ-30)', () => {
  it('a reversed sale and a reversed travel expense leave the original day, and do not show today', async () => {
    const cola = await product('Cola', 10_000n);
    await receive(cola.id, 10, 4_000);
    const sale = await postSale([{ productId: cola.id, qty: 2, price: 10_000 }], day(-3));
    const expense = await travel(5_000, day(-3));
    expect(await pnl(day(-3), day(-3))).toEqual({
      revenue: 20_000,
      cogs: 8_000,
      grossProfit: 12_000,
      travelExpense: 5_000,
      stockShortage: 0,
      stockSurplus: 0,
      netProfit: 7_000,
      counts: { sales: 1, travelExpenses: 1, stockCounts: 0 },
    });

    await sales.reverse(owner, { id: sale.id, reason: 'Qaytdi' });
    await cashCommands.reverse(owner, { id: expense.id });

    expect(await pnl(day(-3), day(-3))).toEqual(EMPTY);
    expect(await pnl(day(0), day(0))).toEqual(EMPTY);
    expect(await pnl()).toEqual(EMPTY);
  });
});

describe('P&L: period in store days (Asia/Tashkent, database §7)', () => {
  /** A TRAVEL_EXPENSE at an exact instant (cash rows are append-only, so it is written that way). */
  async function travelAt(amount: number, iso: string) {
    const box = await prisma.cashbox.update({
      where: { id: f.cashboxes.cash.id },
      data: { balance: { decrement: BigInt(amount) } },
    });
    await prisma.cashTransaction.create({
      data: {
        storeId: f.store.id,
        cashboxId: box.id,
        direction: 'OUT',
        type: 'TRAVEL_EXPENSE',
        amount: BigInt(amount),
        balanceAfter: box.balance,
        txDate: new Date(iso),
        createdById: f.owner.id,
      },
    });
  }

  it('each line counts a day from 00:00 to 24:00 Tashkent time (19:00Z the day before)', async () => {
    const [before, target, after] = [day(-11), day(-10), day(-9)];
    const midnight = `${before}T19:00:00.000Z`; // `target` 00:00 Tashkent
    const lastMs = `${target}T18:59:59.999Z`; // `target` 23:59:59.999
    const nextMidnight = `${target}T19:00:00.000Z`; // `after` 00:00
    expect(new Date(`${target}T00:00:00+05:00`).toISOString()).toBe(midnight);

    const cola = await product('Cola', 1_000n);
    await receive(cola.id, 100, 500);
    const saleAt = async (qty: number, iso: string) => {
      const sale = await postSale([{ productId: cola.id, qty, price: 1_000 }], day(-1));
      await prisma.sale.update({ where: { id: sale.id }, data: { docDate: new Date(iso) } });
    };
    await saleAt(1, `${before}T18:59:59.999Z`);
    await saleAt(2, midnight);
    await saleAt(4, lastMs);
    await saleAt(8, nextMidnight);
    await travelAt(100, `${before}T18:59:59.999Z`);
    await travelAt(200, midnight);
    await travelAt(400, nextMidnight);
    // Shortage of 1 piece (500) at `target` 00:00, surplus of 2 (1 000) at `after` 00:00.
    const shortage = await postCount([counted(f.subWarehouse.id, cola.id, 84)], day(-1));
    await prisma.stockCount.update({
      where: { id: shortage.id },
      data: { docDate: new Date(midnight) },
    });
    const surplus = await postCount([counted(f.subWarehouse.id, cola.id, 86)], day(-1));
    await prisma.stockCount.update({
      where: { id: surplus.id },
      data: { docDate: new Date(nextMidnight) },
    });

    expect(await pnl(target, target)).toEqual({
      revenue: 6_000,
      cogs: 3_000,
      grossProfit: 3_000,
      travelExpense: 200,
      stockShortage: 500,
      stockSurplus: 0,
      netProfit: 2_300,
      counts: { sales: 2, travelExpenses: 1, stockCounts: 1 },
    });
    expect(await pnl(before, before)).toMatchObject({
      revenue: 1_000,
      travelExpense: 100,
      counts: { sales: 1, travelExpenses: 1, stockCounts: 0 },
    });
    expect(await pnl(after, after)).toMatchObject({
      revenue: 8_000,
      travelExpense: 400,
      stockShortage: 0,
      stockSurplus: 1_000,
    });
    expect(await pnl(target, after)).toMatchObject({
      revenue: 14_000,
      travelExpense: 600,
      stockShortage: 500,
      stockSurplus: 1_000,
    });
    // Open ends.
    expect(await pnl(after)).toMatchObject({ revenue: 8_000, counts: { stockCounts: 1 } });
    expect(await pnl(undefined, before)).toMatchObject({ revenue: 1_000, travelExpense: 100 });
  });
});

describe('P&L: access and scope (CLAUDE.md rule 6)', () => {
  it('STAFF gets FORBIDDEN', async () => {
    const error = await caught(reports.pnl(staff, { from: day(-1), to: day(0) }));
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({ code: ErrorCode.FORBIDDEN });
    await expect(reports.pnl(staff)).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
  });

  it('counts only this store', async () => {
    const cola = await product('Cola', 1_000n);
    await receive(cola.id, 10, 400);
    await postSale([{ productId: cola.id, qty: 3, price: 1_000 }], day(0));

    const other = await makeStoreFixture(prisma, { cashBalance: 100_000n });
    const otherCtx = contexts(other);
    const otherCola = await product('Cola', 1_000n, other);
    await receive(otherCola.id, 10, 400, other, otherCtx.owner);
    await postSale(
      [{ productId: otherCola.id, qty: 5, price: 1_000 }],
      day(0),
      false,
      otherCtx.staff,
      other,
    );
    await cashCommands.travelExpense(otherCtx.owner, {
      cashbox: 'CASH',
      amount: 700,
      date: day(0),
    });

    expect(await pnl()).toMatchObject({ revenue: 3_000, travelExpense: 0 });
    expect(await reports.pnl(otherCtx.owner)).toMatchObject({ revenue: 5_000, travelExpense: 700 });
  });

  it('rejects malformed days and a reversed range with VALIDATION_FAILED', async () => {
    for (const query of [
      { from: '2026-02-30' },
      { to: '01.10.2026' },
      { from: '2026-10-02', to: '2026-10-01' },
    ]) {
      const error = await caught(reports.pnl(owner, query));
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
    }
  });
});
