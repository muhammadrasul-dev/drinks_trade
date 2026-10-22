import { z } from 'zod';

/** Kinds of the simple named product classifiers (T-302, FR-1.1). */
export const CatalogKind = {
  category: 'category',
  brand: 'brand',
} as const;
export type CatalogKind = (typeof CatalogKind)[keyof typeof CatalogKind];

export const catalogKindSchema = z.enum(CatalogKind);

/** Category / brand name: trimmed, 1–100 characters; uniqueness is checked by the service. */
export const catalogNameSchema = z.string().trim().min(1).max(100);

export const catalogCreateInputSchema = z.object({ name: catalogNameSchema });
export type CatalogCreateInput = z.input<typeof catalogCreateInputSchema>;

export const catalogRenameInputSchema = z.object({ id: z.uuid(), name: catalogNameSchema });
export type CatalogRenameInput = z.input<typeof catalogRenameInputSchema>;

/** Archive / restore. */
export const catalogIdInputSchema = z.object({ id: z.uuid() });
export type CatalogIdInput = z.input<typeof catalogIdInputSchema>;
