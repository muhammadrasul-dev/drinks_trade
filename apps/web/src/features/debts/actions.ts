'use server';

import { debtCommands } from '@drinks/server';
import { debtOpenInputSchema, debtRepayInputSchema } from '@drinks/shared/schemas';
import { revalidatePath } from 'next/cache';

import { action } from '@/lib/action';

// Debts (T-704): give / take a debt and repay one. The service checks
// permissions (OWNER only), re-validates and takes the locks; every write
// moves cash, so it refreshes the cash page too.
function refresh(): void {
  revalidatePath('/[locale]/debts', 'page');
  revalidatePath('/[locale]/cash', 'page');
}

export const openDebt = action(debtOpenInputSchema, async (input, { ctx }) => {
  const debt = await debtCommands.open(ctx, input);
  refresh();
  return debt;
});

export const repayDebt = action(debtRepayInputSchema, async (input, { ctx }) => {
  const result = await debtCommands.repay(ctx, input);
  refresh();
  return { id: result.id, status: result.status };
});
