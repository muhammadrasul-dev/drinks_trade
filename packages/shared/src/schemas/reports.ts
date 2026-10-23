import { z } from 'zod';

// Report filters (Bosqich 8). URL search params on /reports/*, validated again
// by packages/server.

/** Stock report (T-801, SRS §7.1). */
export const stockReportQuerySchema = z.object({
  /** Only stock in this warehouse (store's own; another id simply matches nothing). */
  warehouseId: z.uuid().optional(),
  /** Only stock in this sub-warehouse. */
  subWarehouseId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  brandId: z.uuid().optional(),
  /** Store-wide stock below the product's minimum (FR-1.3, business-logic §9). */
  lowStock: z.boolean().optional(),
  /** Omitted: active and archived products (OQ-20); false: active only; true: archived only. */
  archived: z.boolean().optional(),
});
export type StockReportQuery = z.input<typeof stockReportQuerySchema>;

/**
 * A report period (T-802, T-803): an inclusive `YYYY-MM-DD` range of store
 * days (Asia/Tashkent, database §7); either end may be open.
 */
export const reportPeriodSchema = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ['to'],
    message: 'to before from',
  });
export type ReportPeriod = z.input<typeof reportPeriodSchema>;

/** Sales report (T-802, SRS §7.2). The page fills in the current month when the URL has no range (OQ-35). */
export const salesReportQuerySchema = reportPeriodSchema;
export type SalesReportQuery = ReportPeriod;

/**
 * P&L (T-803, BR-11, business-logic §8). The page always sends a whole day,
 * month, year or a picked range (OQ-36).
 */
export const pnlReportQuerySchema = reportPeriodSchema;
export type PnlReportQuery = ReportPeriod;
