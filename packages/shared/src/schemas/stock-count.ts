import { z } from 'zod';

import { StockCountStatus } from '../enums';

// Stock count (T-601, T-602, FR-5.1–5.2, business-logic §6). The same schemas
// validate the form in the browser and the input in packages/server.

/** Counted (sub-warehouse, product) pairs one count may hold. */
export const STOCK_COUNT_LINES_MAX = 5000;
/** Blocks or loose pieces entered on one row. */
export const STOCK_COUNT_QTY_MAX = 1_000_000;
export const STOCK_COUNT_NOTE_MAX = 500;
export const STOCK_COUNT_SEARCH_MAX = 30;
export const STOCK_COUNT_PAGE_SIZE = 50;

const note = z
  .string()
  .trim()
  .max(STOCK_COUNT_NOTE_MAX)
  .nullish()
  .transform((value) => value || null);

const qty = z.number().int().min(0).max(STOCK_COUNT_QTY_MAX);

/**
 * One counted row: blocks + loose pieces (FR-5.1); the service converts with
 * the product's current units per block (`toPieces`). Only counted rows are
 * sent — a row left empty keeps the system qty (OQ-13); an explicit 0 is a count.
 */
export const stockCountLineInputSchema = z.object({
  subWarehouseId: z.uuid(),
  productId: z.uuid(),
  blocks: qty,
  pieces: qty,
});
export type StockCountLineInput = z.input<typeof stockCountLineInputSchema>;

/** Opening (§6.1): one DRAFT per warehouse. */
export const stockCountOpenInputSchema = z.object({
  warehouseId: z.uuid(),
  /** `YYYY-MM-DD` in the store zone; not after today (OQ-07, checked by the service). */
  docDate: z.iso.date(),
  note,
});
export type StockCountOpenInput = z.input<typeof stockCountOpenInputSchema>;

/** Saving the counting form: full replace of the counted lines; `version` is the optimistic lock. */
export const stockCountUpdateInputSchema = z
  .object({
    id: z.uuid(),
    version: z.number().int().min(0),
    docDate: z.iso.date(),
    note,
    lines: z.array(stockCountLineInputSchema).max(STOCK_COUNT_LINES_MAX),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const line of value.lines) {
      const key = `${line.subWarehouseId}:${line.productId}`;
      if (seen.has(key)) {
        ctx.addIssue({ code: 'custom', path: ['lines'], message: 'duplicate line' });
        return;
      }
      seen.add(key);
    }
  });
export type StockCountUpdateInput = z.input<typeof stockCountUpdateInputSchema>;

/** Cancelling a draft (§6.3); `version` is the one the user saw. */
export const stockCountCancelInputSchema = z.object({
  id: z.uuid(),
  version: z.number().int().min(0),
});
export type StockCountCancelInput = z.input<typeof stockCountCancelInputSchema>;

/** Posting a draft (§6.2); `version` is the one the user saw. */
export const stockCountPostInputSchema = stockCountCancelInputSchema;
export type StockCountPostInput = z.input<typeof stockCountPostInputSchema>;

export const stockCountIdInputSchema = z.object({ id: z.uuid() });
export type StockCountIdInput = z.input<typeof stockCountIdInputSchema>;

/** List filters (URL search params on /stock-counts). */
export const stockCountListQuerySchema = z.object({
  status: z.enum(StockCountStatus).optional(),
  warehouseId: z.uuid().optional(),
  /** Part of the number: "7" finds I-000007. */
  q: z.string().trim().max(STOCK_COUNT_SEARCH_MAX).optional(),
  /** 1-based; STOCK_COUNT_PAGE_SIZE rows per page. */
  page: z.number().int().min(1).optional(),
});
export type StockCountListQuery = z.input<typeof stockCountListQuerySchema>;
