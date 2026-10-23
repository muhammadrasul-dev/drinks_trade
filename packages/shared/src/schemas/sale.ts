import { z } from 'zod';

import { DocStatus, QtyUnit } from '../enums';

// Sale draft (T-501, FR-3.1–3.3, business-logic §4.1). The same schemas
// validate the form in the browser and the input in packages/server. A line
// has no price: the service copies the product's per-piece sale price
// (OQ-05, OQ-15).

export const SALE_LINES_MAX = 200;
/** Units entered on one line (pieces or blocks). */
export const SALE_QTY_MAX = 1_000_000;
export const SALE_NOTE_MAX = 500;
export const SALE_SEARCH_MAX = 30;
export const SALE_PAGE_SIZE = 50;

const money = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const saleLineInputSchema = z.object({
  productId: z.uuid(),
  /** Where the goods leave from (FR-3.1). */
  subWarehouseId: z.uuid(),
  inputUnit: z.enum(QtyUnit),
  /** In inputUnit; pieces = inputQty × unitsPerBlock for BLOCK (BR-1). */
  inputQty: z.number().int().min(1).max(SALE_QTY_MAX),
});
export type SaleLineInput = z.input<typeof saleLineInputSchema>;

const draftShape = {
  /** `YYYY-MM-DD` in the store zone; not after today (OQ-07, checked by the service). */
  docDate: z.iso.date(),
  /** Required at posting when paidCredit > 0 (OQ-19); empty → null. */
  note: z
    .string()
    .trim()
    .max(SALE_NOTE_MAX)
    .nullish()
    .transform((value) => value || null),
  lines: z.array(saleLineInputSchema).min(1).max(SALE_LINES_MAX),
  /** Payment split (BR-9); a draft may not add up yet — posting checks it. */
  paidCash: money,
  paidCard: money,
  paidCredit: money,
};

export const saleDraftInputSchema = z.object(draftShape);
export type SaleDraftInput = z.input<typeof saleDraftInputSchema>;

/** Full replace of a draft; `version` is the one the form was loaded with (optimistic lock). */
export const saleUpdateInputSchema = z.object({
  ...draftShape,
  id: z.uuid(),
  version: z.number().int().min(0),
});
export type SaleUpdateInput = z.input<typeof saleUpdateInputSchema>;

export const saleDeleteInputSchema = z.object({
  id: z.uuid(),
  version: z.number().int().min(0),
});
export type SaleDeleteInput = z.input<typeof saleDeleteInputSchema>;

export const saleIdInputSchema = z.object({ id: z.uuid() });
export type SaleIdInput = z.input<typeof saleIdInputSchema>;

/** The form's live stock check (FR-3.3): current qty of these (sub-warehouse, product) pairs. */
export const saleAvailabilityInputSchema = z.object({
  keys: z.array(z.object({ subWarehouseId: z.uuid(), productId: z.uuid() })).max(SALE_LINES_MAX),
});
export type SaleAvailabilityInput = z.input<typeof saleAvailabilityInputSchema>;

/** List filters (URL search params on /sales). */
export const saleListQuerySchema = z.object({
  status: z.enum(DocStatus).optional(),
  /** Inclusive `YYYY-MM-DD` range in the store zone. */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  /** Part of the number: "45" finds S-000045. */
  q: z.string().trim().max(SALE_SEARCH_MAX).optional(),
  /** 1-based; SALE_PAGE_SIZE rows per page. */
  page: z.number().int().min(1).optional(),
});
export type SaleListQuery = z.input<typeof saleListQuerySchema>;
