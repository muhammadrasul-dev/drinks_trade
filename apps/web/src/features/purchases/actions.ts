'use server';

import { purchases } from '@drinks/server';
import {
  purchaseDeleteInputSchema,
  purchaseDraftInputSchema,
  purchasePostInputSchema,
  purchaseReverseInputSchema,
  purchaseUpdateInputSchema,
} from '@drinks/shared/schemas';
import { revalidatePath } from 'next/cache';

import { action } from '@/lib/action';

// Purchase drafts (T-404), posting (T-405) and reversal (T-406). The service checks
// permissions, re-validates and takes the locks; every write refreshes the
// purchases pages.
function refresh(): void {
  revalidatePath('/[locale]/purchases', 'layout');
}

export const createPurchase = action(purchaseDraftInputSchema, async (input, { ctx }) => {
  const purchase = await purchases.create(ctx, input);
  refresh();
  return { id: purchase.id, number: purchase.number };
});

export const updatePurchase = action(purchaseUpdateInputSchema, async (input, { ctx }) => {
  const purchase = await purchases.update(ctx, input);
  refresh();
  return { id: purchase.id, version: purchase.version };
});

export const deletePurchase = action(purchaseDeleteInputSchema, async (input, { ctx }) => {
  await purchases.remove(ctx, input);
  refresh();
  return null;
});

export const postPurchase = action(purchasePostInputSchema, async (input, { ctx }) => {
  const purchase = await purchases.post(ctx, input);
  refresh();
  return { id: purchase.id, number: purchase.number };
});

export const reversePurchase = action(purchaseReverseInputSchema, async (input, { ctx }) => {
  const purchase = await purchases.reverse(ctx, input);
  refresh();
  return { id: purchase.id, number: purchase.number };
});
