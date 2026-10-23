import type { StockReportQuery } from '@drinks/shared/schemas';

import { firstParam, type SearchParams, uuidParam } from '@/lib/search-params';

// /reports/stock filters live in the URL
// (?warehouse=&sub=&category=&brand=&low=1&archived=0|1), like /products.

export const STOCK_REPORT_HREF = '/reports/stock';

export interface StockReportFilters {
  warehouseId?: string;
  subWarehouseId?: string;
  categoryId?: string;
  brandId?: string;
  lowStock?: boolean;
  /** Omitted: active and archived products; false: active only; true: archived only. */
  archived?: boolean;
}

/** URL search params → service query; invalid values are dropped, never an error page. */
export function parseStockReportParams(
  params: SearchParams,
): StockReportFilters & StockReportQuery {
  const archived = firstParam(params.archived);
  const values: StockReportFilters = {
    warehouseId: uuidParam(params.warehouse),
    subWarehouseId: uuidParam(params.sub),
    categoryId: uuidParam(params.category),
    brandId: uuidParam(params.brand),
    ...(firstParam(params.low) === '1' && { lowStock: true }),
    ...(archived === '0' && { archived: false }),
    ...(archived === '1' && { archived: true }),
  };
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as StockReportFilters;
}

/** Filters → `/reports/stock?…` (empty values left out). */
export function stockReportHref(filters: StockReportFilters): string {
  const params = new URLSearchParams();
  if (filters.warehouseId) params.set('warehouse', filters.warehouseId);
  if (filters.subWarehouseId) params.set('sub', filters.subWarehouseId);
  if (filters.categoryId) params.set('category', filters.categoryId);
  if (filters.brandId) params.set('brand', filters.brandId);
  if (filters.lowStock) params.set('low', '1');
  if (filters.archived !== undefined) params.set('archived', filters.archived ? '1' : '0');
  const query = params.toString();
  return query ? `${STOCK_REPORT_HREF}?${query}` : STOCK_REPORT_HREF;
}

/** True when any filter is set. */
export function hasStockReportFilters(filters: StockReportFilters): boolean {
  return Object.values(filters).some((value) => value !== undefined);
}
