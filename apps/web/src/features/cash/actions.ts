'use server';

import { cashCommands } from '@drinks/server';
import { cashExpenseInputSchema, cashTransferInputSchema } from '@drinks/shared/schemas';
import { revalidatePath } from 'next/cache';

import { action } from '@/lib/action';

// Cash actions (T-702): travel expense, other expense, transfer. The service
// checks permissions (OWNER only), re-validates, locks the cashboxes and
// refuses to take a balance below zero.
function refresh(): void {
  revalidatePath('/[locale]/cash', 'page');
}

export const addTravelExpense = action(cashExpenseInputSchema, async (input, { ctx }) => {
  const entry = await cashCommands.travelExpense(ctx, input);
  refresh();
  return entry;
});

export const addOtherExpense = action(cashExpenseInputSchema, async (input, { ctx }) => {
  const entry = await cashCommands.otherExpense(ctx, input);
  refresh();
  return entry;
});

export const transferCash = action(cashTransferInputSchema, async (input, { ctx }) => {
  const result = await cashCommands.transfer(ctx, input);
  refresh();
  return { transferGroupId: result.transferGroupId };
});
