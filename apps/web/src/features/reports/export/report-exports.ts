import {
  brands,
  categories,
  type ReportDocument,
  reports,
  type ServiceContext,
  warehouses,
} from '@drinks/server';
import { storeToday } from '@drinks/shared';

import type { NavSection } from '@/lib/nav';
import type { SearchParams } from '@/lib/search-params';

import { parsePnlParams, type PnlPeriod, pnlPeriodRange } from '../pnl-params';
import { parseSalesReportParams } from '../sales-params';
import { parseStockReportParams, type StockReportFilters } from '../stock-params';
import { periodSlug, type ReportExport } from './export-links';
import { pnlReportDocument } from './pnl-document';
import { salesReportDocument } from './sales-document';
import { type StockFilterNames, stockReportDocument } from './stock-document';
import type { ExportTranslator } from './translator';

/** The menu section (and so the permission) of each report page — the export's guard too. */
export const EXPORT_SECTIONS: Record<ReportExport, NavSection> = {
  stock: 'stockReport',
  sales: 'salesReport',
  pnl: 'pnlReport',
};

export interface BuiltExport {
  document: ReportDocument;
  /** For the file name: the stock date, or the period. */
  period: string;
}

/** Names for the stock filter lines; only the lists a set filter needs are read. */
async function stockFilterNames(
  ctx: ServiceContext,
  filters: StockReportFilters,
): Promise<StockFilterNames> {
  const byId = (items: { id: string; name: string }[], id: string | undefined) =>
    id ? items.find((item) => item.id === id)?.name : undefined;
  const [warehouseOptions, categoryItems, brandItems] = await Promise.all([
    filters.warehouseId || filters.subWarehouseId ? warehouses.options(ctx) : [],
    filters.categoryId
      ? Promise.all([categories.list(ctx), categories.list(ctx, { archived: true })])
      : [],
    filters.brandId ? Promise.all([brands.list(ctx), brands.list(ctx, { archived: true })]) : [],
  ]);
  return {
    warehouse: byId(warehouseOptions, filters.warehouseId),
    subWarehouse: byId(
      warehouseOptions.flatMap((warehouse) => warehouse.subWarehouses),
      filters.subWarehouseId,
    ),
    category: byId(categoryItems.flat(), filters.categoryId),
    brand: byId(brandItems.flat(), filters.brandId),
  };
}

function pnlSlug(period: PnlPeriod): string {
  switch (period.kind) {
    case 'day':
      return period.day;
    case 'month':
      return period.month;
    case 'year':
      return period.year;
    case 'range':
      return periodSlug(period.from, period.to);
  }
}

/**
 * Reads the report the page at the same URL shows (same parser, same
 * defaults) and turns it into the export document. The service checks the
 * permission again and leaves out what the role may not see.
 */
export async function buildReportExport(
  report: ReportExport,
  ctx: ServiceContext,
  search: SearchParams,
  t: ExportTranslator,
  now: Date,
): Promise<BuiltExport> {
  const today = storeToday(now);
  switch (report) {
    case 'stock': {
      const filters = parseStockReportParams(search);
      const [data, names] = await Promise.all([
        reports.stock(ctx, filters),
        stockFilterNames(ctx, filters),
      ]);
      return {
        document: stockReportDocument({ report: data, filters, names, t, now }),
        period: today,
      };
    }
    case 'sales': {
      const filters = parseSalesReportParams(search, today);
      const data = await reports.sales(ctx, filters);
      return {
        document: salesReportDocument({ report: data, filters, t, now }),
        period: periodSlug(filters.from, filters.to),
      };
    }
    case 'pnl': {
      const period = parsePnlParams(search, today);
      const data = await reports.pnl(ctx, pnlPeriodRange(period));
      return {
        document: pnlReportDocument({ report: data, period, t, now }),
        period: pnlSlug(period),
      };
    }
  }
}
