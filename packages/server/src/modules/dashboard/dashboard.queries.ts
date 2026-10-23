// Home page summary (T-902, FR-1.3): low-stock products, open stock counts
// and unposted drafts. Read-only, no locks, quantities and counts only — no
// amounts or costs for any role (CLAUDE.md rule 6). The page itself needs no
// permission, so each block is included only when the role may open the page
// it links to.
import {
  can,
  compareStockShortage,
  DASHBOARD_LOW_STOCK_LIMIT,
  type DashboardLowStock,
  type DashboardLowStockItem,
  type DashboardSummary,
  DocStatus,
  isLowStock,
} from '@drinks/shared';

import type { ServiceContext } from '../../core/context';
import { getProductTotals } from '../inventory/inventory.service';
import { REPORT_PRODUCT_ORDER } from '../reports/report-product';
import { stockCounts } from '../stock-counts/stock-counts.service';

/**
 * Active products whose store-wide stock is below their minimum — the stock
 * report's rule (business-logic §9: `isLowStock` over `getProductTotals`), so
 * `total` equals `/reports/stock?low=1&archived=0`. Archived products are left
 * out (OQ-39). A product with minimum 0 is never low, so only positive
 * minimums are read.
 */
async function lowStock(ctx: ServiceContext): Promise<DashboardLowStock> {
  const { prisma } = await import('@drinks/db');
  const products = await prisma.product.findMany({
    where: { organizationId: ctx.organizationId, archivedAt: null, minStock: { gt: 0 } },
    select: { id: true, name: true, unitsPerBlock: true, minStock: true },
    orderBy: REPORT_PRODUCT_ORDER,
  });
  const totals = await getProductTotals(
    prisma,
    ctx,
    products.map((p) => p.id),
  );
  const low: DashboardLowStockItem[] = [];
  products.forEach((product, index) => {
    const stockQty = totals[index]!.totalQty;
    if (isLowStock(stockQty, product.minStock)) low.push({ ...product, stockQty });
  });
  // Stable sort: equal shares stay by name.
  low.sort(compareStockShortage);
  return { total: low.length, items: low.slice(0, DASHBOARD_LOW_STOCK_LIMIT) };
}

async function summary(ctx: ServiceContext): Promise<DashboardSummary> {
  const { role } = ctx.user;
  const { prisma } = await import('@drinks/db');
  const draft = { storeId: ctx.storeId, status: DocStatus.DRAFT };
  const [low, openCounts, draftSales, draftPurchases] = await Promise.all([
    can(role, 'report.stock') ? lowStock(ctx) : undefined,
    can(role, 'warehouse.read') ? stockCounts.openCounts(ctx) : undefined,
    can(role, 'sale.write') ? prisma.sale.count({ where: draft }) : undefined,
    can(role, 'purchase.write') ? prisma.purchase.count({ where: draft }) : undefined,
  ]);
  return {
    ...(low && { lowStock: low }),
    ...(openCounts && { openStockCounts: openCounts }),
    ...(draftSales !== undefined && { draftSales }),
    ...(draftPurchases !== undefined && { draftPurchases }),
  };
}

export const dashboard = { summary };
