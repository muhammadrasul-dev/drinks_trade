'use server';

import { sales } from '@drinks/server';
import {
  saleAvailabilityInputSchema,
  saleDeleteInputSchema,
  saleDraftInputSchema,
  saleUpdateInputSchema,
} from '@drinks/shared/schemas';
import { revalidatePath } from 'next/cache';

import { action } from '@/lib/action';

// Sale drafts (T-501). The service checks permissions, re-validates and takes
// the locks; every write refreshes the sales pages.
function refresh(): void {
  revalidatePath('/[locale]/sales', 'layout');
}

export const createSale = action(saleDraftInputSchema, async (input, { ctx }) => {
  const sale = await sales.create(ctx, input);
  refresh();
  return { id: sale.id, number: sale.number };
});

export const updateSale = action(saleUpdateInputSchema, async (input, { ctx }) => {
  const sale = await sales.update(ctx, input);
  refresh();
  return { id: sale.id, version: sale.version };
});

export const deleteSale = action(saleDeleteInputSchema, async (input, { ctx }) => {
  await sales.remove(ctx, input);
  refresh();
  return null;
});

/** The form's live stock check (FR-3.3); read-only. */
export const getSaleAvailability = action(saleAvailabilityInputSchema, (input, { ctx }) =>
  sales.availability(ctx, input),
);
