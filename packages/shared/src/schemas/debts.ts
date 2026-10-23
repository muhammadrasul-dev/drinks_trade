import { z } from 'zod';

import { CashboxType, DebtDirection, DebtSource, DebtStatus } from '../enums';

// Debts (T-704, FR-7.1–7.2, BR-10, business-logic §7). OWNER only. The same
// schemas validate the forms in the browser and the input in packages/server.

export const DEBT_PAGE_SIZE = 50;
export const DEBT_NOTE_MAX = 500;
export const DEBT_SEARCH_MAX = 50;

/** Whole som, > 0. */
const amount = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

/**
 * Trimmed; a blank note is not a schema error — the service answers
 * NOTE_REQUIRED (BR-10), the same code as for credit documents (OQ-19).
 */
const note = z.string().trim().max(DEBT_NOTE_MAX);

export const debtListQuerySchema = z.object({
  direction: z.enum(DebtDirection).optional(),
  status: z.enum(DebtStatus).optional(),
  source: z.enum(DebtSource).optional(),
  /** Inclusive `YYYY-MM-DD` range of debt_date in the store zone. */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  /** Part of the note (the counterparty, BR-10), case-insensitive. */
  search: z.string().trim().max(DEBT_SEARCH_MAX).optional(),
  /** 1-based; DEBT_PAGE_SIZE rows per page. */
  page: z.number().int().min(1).optional(),
});
export type DebtListQuery = z.input<typeof debtListQuerySchema>;

/** Debt given (RECEIVABLE, cash OUT) or taken (PAYABLE, cash IN) by hand. */
export const debtOpenInputSchema = z.object({
  direction: z.enum(DebtDirection),
  cashbox: z.enum(CashboxType),
  amount,
  /** Required (BR-10): who and why. */
  note,
  /** `YYYY-MM-DD` in the store zone; not after today (OQ-07, checked by the service). */
  date: z.iso.date(),
});
export type DebtOpenInput = z.input<typeof debtOpenInputSchema>;

/** A repayment into / out of the cashbox the user picks (FR-7.2). */
export const debtRepayInputSchema = z.object({
  debtId: z.uuid(),
  cashbox: z.enum(CashboxType),
  /** ≤ the debt's remaining amount (DEBT_OVERPAYMENT). */
  amount,
  /** Optional; empty → null. */
  note: note.transform((value) => value || null).nullish(),
  date: z.iso.date(),
});
export type DebtRepayInput = z.input<typeof debtRepayInputSchema>;
