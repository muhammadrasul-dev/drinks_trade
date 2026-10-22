'use server';

import { type ServiceContext, subWarehouses, warehouses } from '@drinks/server';
import {
  subWarehouseCreateInputSchema,
  warehouseCreateInputSchema,
  warehouseIdInputSchema,
  warehouseRenameInputSchema,
} from '@drinks/shared/schemas';
import { revalidatePath } from 'next/cache';

import { action } from '@/lib/action';

// Warehouses and sub-warehouses (T-304). The services check permissions,
// re-validate and enforce the archive rules; every write refreshes the page.
function refresh(): void {
  revalidatePath('/[locale]/warehouses', 'page');
}

function write<TInput, TResult>(fn: (ctx: ServiceContext, input: TInput) => Promise<TResult>) {
  return async (input: TInput, { ctx }: { ctx: ServiceContext }) => {
    const result = await fn(ctx, input);
    refresh();
    return result;
  };
}

export const createWarehouse = action(warehouseCreateInputSchema, write(warehouses.create));
export const renameWarehouse = action(warehouseRenameInputSchema, write(warehouses.rename));
export const archiveWarehouse = action(warehouseIdInputSchema, write(warehouses.archive));
export const restoreWarehouse = action(warehouseIdInputSchema, write(warehouses.restore));

export const createSubWarehouse = action(
  subWarehouseCreateInputSchema,
  write(subWarehouses.create),
);
export const renameSubWarehouse = action(warehouseRenameInputSchema, write(subWarehouses.rename));
export const archiveSubWarehouse = action(warehouseIdInputSchema, write(subWarehouses.archive));
export const restoreSubWarehouse = action(warehouseIdInputSchema, write(subWarehouses.restore));
