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
