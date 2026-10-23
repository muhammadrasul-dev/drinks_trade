// Stock report (T-801, SRS §7.1, database §7.1): every product's stock in
// pieces, broken down by warehouse → sub-warehouse. Read-only, no locks.
// Cost columns (avgCost, value) come from inventory.getProductTotals, which
// adds avgCost only for `report.sales.cost` holders — so for STAFF the keys
// are absent from the response, not merely hidden (CLAUDE.md rule 6).
import type { Prisma } from '@drinks/db';
import {
  can,
  costAmount,
  isLowStock,
  parseInput,
  type StockReport,
  type StockReportLocation,
  type StockReportRow,
} from '@drinks/shared';
import { type StockReportQuery, stockReportQuerySchema } from '@drinks/shared/schemas';

import type { ServiceContext } from '../../core/context';
import { assertCan } from '../../core/rbac';
import { getProductTotals } from '../inventory/inventory.service';
import { REPORT_PRODUCT_ORDER, REPORT_PRODUCT_SELECT, toReportProduct } from './report-product';

/**
 * Products with stock in the store (or in the chosen warehouse /
 * sub-warehouse), by name. With `lowStock` only products whose store-wide
 * stock is below their minimum; without a location filter that includes
 * products with no stock at all (OQ-28).
 */
export async function stockReport(
  ctx: ServiceContext,
  query: StockReportQuery = {},
): Promise<StockReport> {
  assertCan(ctx.user, 'report.stock');
  const { warehouseId, subWarehouseId, categoryId, brandId, lowStock, archived } = parseInput(
    stockReportQuerySchema,
    query,
  );
  const { prisma } = await import('@drinks/db');

  const productWhere: Prisma.ProductWhereInput = {
    organizationId: ctx.organizationId,
    ...(categoryId && { categoryId }),
    ...(brandId && { brandId }),
    ...(archived !== undefined && { archivedAt: archived ? { not: null } : null }),
  };
  const hasLocationFilter = Boolean(warehouseId || subWarehouseId);

  const balances = await prisma.stockBalance.findMany({
    where: {
      qty: { gt: 0 },
      product: productWhere,
      subWarehouse: {
        warehouse: { storeId: ctx.storeId },
        ...(warehouseId && { warehouseId }),
        ...(subWarehouseId && { id: subWarehouseId }),
      },
    },
    select: {
      productId: true,
      qty: true,
      subWarehouse: {
        select: { id: true, name: true, warehouse: { select: { id: true, name: true } } },
      },
    },
    orderBy: [{ subWarehouse: { warehouse: { name: 'asc' } } }, { subWarehouse: { name: 'asc' } }],
  });

  const locationsOf = new Map<string, StockReportLocation[]>();
  for (const { productId, qty, subWarehouse } of balances) {
    const list = locationsOf.get(productId) ?? [];
    list.push({
      warehouse: subWarehouse.warehouse,
      subWarehouse: { id: subWarehouse.id, name: subWarehouse.name },
      qty,
    });
    locationsOf.set(productId, list);
  }

  // Out-of-stock products are below any positive minimum: list them too when
  // the user asks for low stock across the whole store.
  const includeEmpty = lowStock === true && !hasLocationFilter;
  const products = await prisma.product.findMany({
    where: {
      ...productWhere,
      ...(includeEmpty
        ? { OR: [{ id: { in: [...locationsOf.keys()] } }, { minStock: { gt: 0 } }] }
        : { id: { in: [...locationsOf.keys()] } }),
    },
    select: REPORT_PRODUCT_SELECT,
    orderBy: REPORT_PRODUCT_ORDER,
  });

  const totals = await getProductTotals(
    prisma,
    ctx,
    products.map((p) => p.id),
  );

  const items: StockReportRow[] = [];
  let totalValue = 0;
  products.forEach((product, index) => {
    const { totalQty: storeQty, avgCost } = totals[index]!;
    const low = isLowStock(storeQty, product.minStock);
    if (lowStock && !low) return;
    const locations = locationsOf.get(product.id) ?? [];
    const qty = locations.reduce((sum, location) => sum + location.qty, 0);
    const row: StockReportRow = {
      product: { ...toReportProduct(product), minStock: product.minStock },
      qty,
      storeQty,
      lowStock: low,
      locations,
    };
    if (avgCost !== undefined) {
      row.avgCost = avgCost;
      row.value = costAmount(qty, avgCost);
      totalValue += row.value;
    }
    items.push(row);
  });

  return {
    items,
    totals: {
      products: items.length,
      ...(can(ctx.user.role, 'report.sales.cost') && { value: totalValue }),
    },
  };
}
