import { z } from 'zod';

import { CashboxType, CashDirection, CashTxType } from '../enums';

// Cash journal filters (T-701, FR-6.1). URL search params on /cash, validated
// again by packages/server.

export const CASH_JOURNAL_PAGE_SIZE = 50;

export const cashJournalQuerySchema = z.object({
  /** Inclusive `YYYY-MM-DD` range of tx_date (report date) in the store zone. */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  cashbox: z.enum(CashboxType).optional(),
  type: z.enum(CashTxType).optional(),
  direction: z.enum(CashDirection).optional(),
  /** 1-based; CASH_JOURNAL_PAGE_SIZE rows per page. */
  page: z.number().int().min(1).optional(),
});
export type CashJournalQuery = z.input<typeof cashJournalQuerySchema>;

// Manual cash entries (T-702, FR-6.2–6.3, business-logic §7). OWNER only.
// The same schemas validate the dialogs and the input in packages/server.

export const CASH_NOTE_MAX = 500;

/** Whole som, > 0. */
const amount = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

/** Trimmed; empty → null. A missing note on OTHER_EXPENSE is NOTE_REQUIRED from the service. */
const note = z
  .string()
  .trim()
  .max(CASH_NOTE_MAX)
  .transform((value) => value || null)
  .nullish();

/** Travel expense (TRAVEL_EXPENSE) or other expense (OTHER_EXPENSE): one cash OUT. */
export const cashExpenseInputSchema = z.object({
  cashbox: z.enum(CashboxType),
  amount,
  /** Optional for travel, required for other expense (FR-6.2). */
  note,
  /** `YYYY-MM-DD` in the store zone; not after today (OQ-07, checked by the service). */
  date: z.iso.date(),
});
export type CashExpenseInput = z.input<typeof cashExpenseInputSchema>;

/** Transfer between the two cashboxes (FR-6.3): source ≠ target. */
export const cashTransferInputSchema = z
  .object({
    from: z.enum(CashboxType),
    to: z.enum(CashboxType),
    amount,
    note,
    date: z.iso.date(),
  })
  .refine((value) => value.from !== value.to, { path: ['to'], message: 'same cashbox' });
export type CashTransferInput = z.input<typeof cashTransferInputSchema>;

// Reversal of a manual cash entry (T-703, OQ-08, business-logic §7). OWNER only.

/**
 * Entries typed by hand on the cash screen. Only these can be reversed from the
 * journal; sale/purchase/debt entries are reversed through their document or
 * debt. A transfer is reversed as a pair (both sides of its transfer_group_id).
 */
export const REVERSIBLE_CASH_TX_TYPES = [
  CashTxType.TRAVEL_EXPENSE,
  CashTxType.OTHER_EXPENSE,
  CashTxType.TRANSFER_OUT,
  CashTxType.TRANSFER_IN,
] as const satisfies readonly CashTxType[];

export function isReversibleCashTxType(type: CashTxType): boolean {
  return (REVERSIBLE_CASH_TX_TYPES as readonly CashTxType[]).includes(type);
}

export const cashReverseInputSchema = z.object({
  /** cash_transaction.id (bigint as a decimal string). */
  id: z.string().regex(/^[1-9]\d{0,18}$/),
  /** Optional reason, stored on the MANUAL_REVERSAL entry. */
  note,
});
export type CashReverseInput = z.input<typeof cashReverseInputSchema>;
