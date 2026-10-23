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
