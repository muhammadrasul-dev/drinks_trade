import { z } from 'zod';

import { DocStatus, QtyUnit } from '../enums';

// Purchase draft (T-404, FR-4.1, business-logic §5.1). The same schemas
// validate the form in the browser and the input in packages/server.

export const PURCHASE_LINES_MAX = 200;
/** Units entered on one line (pieces or blocks). */
export const PURCHASE_QTY_MAX = 1_000_000;
/** Whole som per entered unit; × PURCHASE_QTY_MAX still fits a safe integer. */
export const PURCHASE_PRICE_MAX = 1_000_000_000;
export const PURCHASE_NOTE_MAX = 500;
export const PURCHASE_SEARCH_MAX = 30;
export const PURCHASE_PAGE_SIZE = 50;

const money = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const purchaseLineInputSchema = z.object({
  productId: z.uuid(),
  /** Where the goods arrive (FR-4.1). */
  subWarehouseId: z.uuid(),
  inputUnit: z.enum(QtyUnit),
  /** In inputUnit; pieces = inputQty × unitsPerBlock for BLOCK (BR-1). */
  inputQty: z.number().int().min(1).max(PURCHASE_QTY_MAX),
  /** Whole som per inputUnit; 0 allowed (bonus goods, OQ-23). */
  inputPrice: z.number().int().min(0).max(PURCHASE_PRICE_MAX),
});
export type PurchaseLineInput = z.input<typeof purchaseLineInputSchema>;

const draftShape = {
  /** `YYYY-MM-DD` in the store zone; not after today (OQ-07, checked by the service). */
  docDate: z.iso.date(),
  /** Required at posting when paidCredit > 0 (OQ-19); empty → null. */
  note: z
    .string()
    .trim()
    .max(PURCHASE_NOTE_MAX)
    .nullish()
    .transform((value) => value || null),
  lines: z.array(purchaseLineInputSchema).min(1).max(PURCHASE_LINES_MAX),
  /** Payment split (BR-9); a draft may not add up yet — posting checks it. */
  paidCash: money,
  paidCard: money,
  paidCredit: money,
};

/** The document total must stay a safe integer (Σ inputQty × inputPrice). */
function totalFits(
  value: { lines: { inputQty: number; inputPrice: number }[] },
  ctx: z.RefinementCtx,
): void {
  const total = value.lines.reduce((sum, line) => sum + line.inputQty * line.inputPrice, 0);
  if (!Number.isSafeInteger(total)) {
    ctx.addIssue({ code: 'custom', path: ['lines'], message: 'total too big' });
  }
}

export const purchaseDraftInputSchema = z.object(draftShape).superRefine(totalFits);
export type PurchaseDraftInput = z.input<typeof purchaseDraftInputSchema>;

/** Full replace of a draft; `version` is the one the form was loaded with (optimistic lock). */
export const purchaseUpdateInputSchema = z
  .object({ ...draftShape, id: z.uuid(), version: z.number().int().min(0) })
  .superRefine(totalFits);
export type PurchaseUpdateInput = z.input<typeof purchaseUpdateInputSchema>;

export const purchaseDeleteInputSchema = z.object({
  id: z.uuid(),
  version: z.number().int().min(0),
});
export type PurchaseDeleteInput = z.input<typeof purchaseDeleteInputSchema>;

/** Posting (T-405): the draft and the version the user saw (optimistic lock). */
export const purchasePostInputSchema = z.object({
  id: z.uuid(),
  version: z.number().int().min(0),
});
export type PurchasePostInput = z.input<typeof purchasePostInputSchema>;

export const purchaseIdInputSchema = z.object({ id: z.uuid() });
export type PurchaseIdInput = z.input<typeof purchaseIdInputSchema>;

/** List filters (URL search params on /purchases). */
export const purchaseListQuerySchema = z.object({
  status: z.enum(DocStatus).optional(),
  /** Inclusive `YYYY-MM-DD` range in the store zone. */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  /** Part of the number: "45" finds P-000045. */
  q: z.string().trim().max(PURCHASE_SEARCH_MAX).optional(),
  /** 1-based; PURCHASE_PAGE_SIZE rows per page. */
  page: z.number().int().min(1).optional(),
});
export type PurchaseListQuery = z.input<typeof purchaseListQuerySchema>;
