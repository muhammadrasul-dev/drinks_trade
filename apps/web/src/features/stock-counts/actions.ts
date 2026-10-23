'use server';

import { stockCounts } from '@drinks/server';
import {
  stockCountCancelInputSchema,
  stockCountOpenInputSchema,
  stockCountPostInputSchema,
  stockCountUpdateInputSchema,
} from '@drinks/shared/schemas';
import { revalidatePath } from 'next/cache';

import { action } from '@/lib/action';

// Stock counts: open, save the counting form, cancel (T-601), post (T-602). The service
// checks permissions, re-validates and takes the locks. An open count blocks
// posting in its warehouse (BR-8) and posting it moves stock, so every write
// refreshes the whole (app) layout.
function refresh(): void {
  revalidatePath('/[locale]', 'layout');
}

export const openStockCount = action(stockCountOpenInputSchema, async (input, { ctx }) => {
  const count = await stockCounts.open(ctx, input);
  refresh();
  return { id: count.id, number: count.number };
});

export const updateStockCount = action(stockCountUpdateInputSchema, async (input, { ctx }) => {
  const count = await stockCounts.update(ctx, input);
  refresh();
  return { version: count.version };
});

export const cancelStockCount = action(stockCountCancelInputSchema, async (input, { ctx }) => {
  const count = await stockCounts.cancel(ctx, input);
  refresh();
  return { number: count.number };
});

export const postStockCount = action(stockCountPostInputSchema, async (input, { ctx }) => {
  const count = await stockCounts.post(ctx, input);
  refresh();
  return { number: count.number };
});
