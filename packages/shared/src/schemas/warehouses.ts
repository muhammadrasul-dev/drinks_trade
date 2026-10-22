import { z } from 'zod';

// Warehouses and sub-warehouses (T-304, FR-2.1–2.2): exactly two levels —
// a sub-warehouse always belongs to a warehouse and has no children.

/** Warehouse / sub-warehouse name: trimmed, 1–100 characters; uniqueness is checked by the service. */
export const warehouseNameSchema = z.string().trim().min(1).max(100);

export const warehouseCreateInputSchema = z.object({ name: warehouseNameSchema });
export type WarehouseCreateInput = z.input<typeof warehouseCreateInputSchema>;

/** Rename a warehouse or a sub-warehouse. */
export const warehouseRenameInputSchema = z.object({ id: z.uuid(), name: warehouseNameSchema });
export type WarehouseRenameInput = z.input<typeof warehouseRenameInputSchema>;

/** Archive / restore a warehouse or a sub-warehouse. */
export const warehouseIdInputSchema = z.object({ id: z.uuid() });
export type WarehouseIdInput = z.input<typeof warehouseIdInputSchema>;

/** A new sub-warehouse inside `warehouseId` (which must be a warehouse, not a sub-warehouse). */
export const subWarehouseCreateInputSchema = z.object({
  warehouseId: z.uuid(),
  name: warehouseNameSchema,
});
export type SubWarehouseCreateInput = z.input<typeof subWarehouseCreateInputSchema>;
