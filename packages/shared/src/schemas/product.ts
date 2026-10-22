import { z } from 'zod';

// Product card (T-303, FR-1.1). The same schemas validate the form in the
// browser and the input in packages/server (CLAUDE.md rule 3).

export const PRODUCT_NAME_MAX = 200;
/** SKU and barcode length limit. */
export const PRODUCT_CODE_MAX = 64;
export const UNITS_PER_BLOCK_MAX = 10_000;
/** Per-piece price cap: × UNITS_PER_BLOCK_MAX still fits a safe integer (block price). */
export const SALE_PRICE_MAX = 100_000_000_000;
/** min_stock is an Int column (pieces). */
export const MIN_STOCK_MAX = 1_000_000_000;
export const PRODUCT_SEARCH_MAX = 100;
export const PRODUCT_PAGE_SIZE = 50;

/** Image upload (architecture §9): ≤ 2 MB, jpg/png/webp; stored resized to ≤ 512 px. */
export const PRODUCT_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const PRODUCT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PRODUCT_IMAGE_MAX_SIDE = 512;

/** Optional code (SKU, barcode): trimmed, no inner whitespace; empty → null. */
const codeSchema = z
  .string()
  .trim()
  .max(PRODUCT_CODE_MAX)
  .regex(/^\S*$/)
  .nullish()
  .transform((value) => value || null);

const refSchema = z
  .union([z.uuid(), z.literal('')])
  .nullish()
  .transform((value) => value || null);

export const productCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(PRODUCT_NAME_MAX),
  /** Pieces in one block (BR-1); OWNER and STAFF may change it (OQ-06). */
  unitsPerBlock: z.number().int().min(1).max(UNITS_PER_BLOCK_MAX),
  /** Whole som for ONE piece (OQ-15); block price = salePrice × unitsPerBlock. */
  salePrice: z.number().int().min(0).max(SALE_PRICE_MAX),
  categoryId: refSchema,
  brandId: refSchema,
  sku: codeSchema,
  barcode: codeSchema,
  /** Pieces, store-wide (FR-1.3); 0 = no low-stock warning. */
  minStock: z.number().int().min(0).max(MIN_STOCK_MAX),
  /** Information only (FR-1.1), `YYYY-MM-DD`; empty → null. */
  expiryDate: z
    .union([z.iso.date(), z.literal('')])
    .nullish()
    .transform((value) => value || null),
});
export type ProductCreateInput = z.input<typeof productCreateInputSchema>;

/** Full replace of the editable fields (the form always sends all of them). */
export const productUpdateInputSchema = productCreateInputSchema.extend({ id: z.uuid() });
export type ProductUpdateInput = z.input<typeof productUpdateInputSchema>;

/** Archive / restore / remove image. */
export const productIdInputSchema = z.object({ id: z.uuid() });
export type ProductIdInput = z.input<typeof productIdInputSchema>;

/** List filters (URL search params on /products). */
export const productListQuerySchema = z.object({
  /** Matches name, SKU or barcode (case-insensitive, substring). */
  q: z.string().trim().max(PRODUCT_SEARCH_MAX).optional(),
  categoryId: z.uuid().optional(),
  brandId: z.uuid().optional(),
  /** false (default): active products; true: archived only. */
  archived: z.boolean().optional(),
  /** 1-based; PRODUCT_PAGE_SIZE rows per page. */
  page: z.number().int().min(1).optional(),
});
export type ProductListQuery = z.input<typeof productListQuerySchema>;

/** The upload as the browser sends it; the server re-checks the bytes themselves. */
export const productImageFileSchema = z
  .file()
  .max(PRODUCT_IMAGE_MAX_BYTES)
  .mime([...PRODUCT_IMAGE_TYPES]);
