// P&L (T-803, BR-11, business-logic §8, database §7.3) of a period of store
// days. Read-only, no locks; every line is a sum over records dated in the
// period (document date, not the posting/reversal instant — BR-13):
//   revenue, COGS     — POSTED sales by doc_date. A reversed sale is REVERSED,
//                       so it drops out of its own date (OQ-01).
//   travel expense    — TRAVEL_EXPENSE by tx_date without a MANUAL_REVERSAL
//                       (OQ-08; the reversal is dated like the original, OQ-30).
//   shortage/surplus  — stock_count_result.amount of POSTED counts by doc_date;
//                       a move between sub-warehouses nets to 0 per product
//                       (§6.2), so it is in neither line.
// Purchases, debts, OTHER_EXPENSE and transfers are not in the P&L.
// OWNER only (`report.pnl`): STAFF gets FORBIDDEN, not a reduced report
// (CLAUDE.md rule 6).
import type { Prisma } from '@drinks/db';
import { parseInput, type PnlReport } from '@drinks/shared';
import { type PnlReportQuery, pnlReportQuerySchema } from '@drinks/shared/schemas';

import type { ServiceContext } from '../../core/context';
import { storeDayRange } from '../../core/dates';
import { moneyToNumber } from '../../core/money';
import { assertCan } from '../../core/rbac';

export async function pnlReport(
  ctx: ServiceContext,
  query: PnlReportQuery = {},
): Promise<PnlReport> {
  assertCan(ctx.user, 'report.pnl');
  const { from, to } = parseInput(pnlReportQuerySchema, query);
  const { prisma } = await import('@drinks/db');

  const period = storeDayRange(from, to);
  const stockCountWhere: Prisma.StockCountWhereInput = {
    storeId: ctx.storeId,
    status: 'POSTED',
    ...(period && { docDate: period }),
  };

  const [sales, travel, shortage, surplus, stockCounts] = await Promise.all([
    prisma.sale.aggregate({
      where: { storeId: ctx.storeId, status: 'POSTED', ...(period && { docDate: period }) },
      _sum: { totalAmount: true, costTotal: true },
      _count: true,
    }),
    prisma.cashTransaction.aggregate({
      where: {
        storeId: ctx.storeId,
        type: 'TRAVEL_EXPENSE',
        reversedBy: null,
        ...(period && { txDate: period }),
      },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.stockCountResult.aggregate({
      where: { stockCount: stockCountWhere, amount: { lt: 0 } },
      _sum: { amount: true },
    }),
    prisma.stockCountResult.aggregate({
      where: { stockCount: stockCountWhere, amount: { gt: 0 } },
      _sum: { amount: true },
    }),
    prisma.stockCount.count({ where: stockCountWhere }),
  ]);

  const revenue = moneyToNumber(sales._sum.totalAmount ?? 0n);
  // Posting fills cost_total, so a POSTED sale always has one.
  const cogs = moneyToNumber(sales._sum.costTotal ?? 0n);
  const travelExpense = moneyToNumber(travel._sum.amount ?? 0n);
  // Negated as bigint: 0n stays 0, not -0.
  const stockShortage = moneyToNumber(-(shortage._sum.amount ?? 0n));
  const stockSurplus = moneyToNumber(surplus._sum.amount ?? 0n);
  const grossProfit = revenue - cogs;

  return {
    revenue,
    cogs,
    grossProfit,
    travelExpense,
    stockShortage,
    stockSurplus,
    netProfit: grossProfit - travelExpense - stockShortage + stockSurplus,
    counts: { sales: sales._count, travelExpenses: travel._count, stockCounts },
  };
}
