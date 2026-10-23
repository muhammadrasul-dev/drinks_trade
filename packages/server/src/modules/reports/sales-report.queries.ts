// Sales report (T-802, SRS §7.2, database §7.2): posted sales of a period of
// store days, by product — pieces sold and revenue; for `report.sales.cost`
// holders also the cost frozen at posting and the gross profit. Read-only,
// no locks. A reversed sale is REVERSED, not POSTED, so it drops out of its
// own date (OQ-01, business-logic §8 — the same rule as the P&L).
// For STAFF the cost is not even summed, and the cost / profit keys are absent
// from the response, not merely hidden (CLAUDE.md rule 6).
import type { Prisma } from '@drinks/db';
import { can, parseInput, type SalesReport, type SalesReportRow } from '@drinks/shared';
import { type SalesReportQuery, salesReportQuerySchema } from '@drinks/shared/schemas';

import type { ServiceContext } from '../../core/context';
import { storeDayRange } from '../../core/dates';
import { moneyToNumber } from '../../core/money';
import { assertCan } from '../../core/rbac';
import { REPORT_PRODUCT_ORDER, REPORT_PRODUCT_SELECT, toReportProduct } from './report-product';

/** Products sold in the period, by name (OQ-35); totals over the whole period. */
export async function salesReport(
  ctx: ServiceContext,
  query: SalesReportQuery = {},
): Promise<SalesReport> {
  assertCan(ctx.user, 'report.sales');
  const { from, to } = parseInput(salesReportQuerySchema, query);
  const withCost = can(ctx.user.role, 'report.sales.cost');
  const { prisma } = await import('@drinks/db');

  const docDate = storeDayRange(from, to);
  const saleWhere: Prisma.SaleWhereInput = {
    storeId: ctx.storeId,
    status: 'POSTED',
    ...(docDate && { docDate }),
  };

  const [groups, salesCount] = await Promise.all([
    prisma.saleLine.groupBy({
      by: ['productId'],
      where: { sale: saleWhere },
      _sum: { qty: true, lineTotal: true, ...(withCost && { costAmount: true as const }) },
    }),
    prisma.sale.count({ where: saleWhere }),
  ]);
  const products = await prisma.product.findMany({
    where: { id: { in: groups.map((group) => group.productId) } },
    select: REPORT_PRODUCT_SELECT,
    orderBy: REPORT_PRODUCT_ORDER,
  });
  const sumsOf = new Map(groups.map((group) => [group.productId, group._sum]));

  const items: SalesReportRow[] = [];
  const totals: SalesReport['totals'] = {
    products: products.length,
    sales: salesCount,
    revenue: 0,
    ...(withCost && { cost: 0, grossProfit: 0 }),
  };
  for (const product of products) {
    const sums = sumsOf.get(product.id)!;
    const row: SalesReportRow = {
      product: toReportProduct(product),
      qty: sums.qty ?? 0,
      revenue: moneyToNumber(sums.lineTotal ?? 0n),
    };
    totals.revenue += row.revenue;
    if (withCost) {
      // Posting fills cost_amount on every line, so a POSTED line always has one.
      row.cost = moneyToNumber(sums.costAmount ?? 0n);
      row.grossProfit = row.revenue - row.cost;
      totals.cost! += row.cost;
      totals.grossProfit! += row.grossProfit;
    }
    items.push(row);
  }

  return { items, totals };
}
