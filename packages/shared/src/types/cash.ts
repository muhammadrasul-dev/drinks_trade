import type { CashboxType, CashDirection, CashTxType, DebtDirection, DebtSource } from '../enums';
import type { DocumentAuthor } from './purchase';

// Cash DTOs (T-701). Confidential (cash.read, OWNER only): the services that
// return them refuse STAFF with FORBIDDEN (CLAUDE.md rule 6).

export interface CashboxBalance {
  id: string;
  type: CashboxType;
  name: string;
  /** Whole som; equals balanceAfter of the cashbox's last journal entry. */
  balance: number;
  updatedAt: Date;
}

export interface CashJournalEntry {
  /** cash_transaction.id (BIGINT) as a string. */
  id: string;
  /** Report date (filters and P&L use it). */
  txDate: Date;
  /** When the entry was booked; differs in day from txDate for backdated entries. */
  createdAt: Date;
  cashbox: { id: string; type: CashboxType; name: string };
  type: CashTxType;
  direction: CashDirection;
  /** Whole som, always positive; the sign comes from direction. */
  amount: number;
  balanceAfter: number;
  note: string | null;
  sale: { id: string; number: string } | null;
  purchase: { id: string; number: string } | null;
  debt: { id: string; direction: DebtDirection; source: DebtSource; note: string } | null;
  transferGroupId: string | null;
  /** MANUAL_REVERSAL: the entry it reverses (OQ-08). */
  reversalOfId: string | null;
  /** The MANUAL_REVERSAL entry that reversed this one, if any. */
  reversedById: string | null;
  createdBy: DocumentAuthor;
}

export interface CashJournalPage {
  items: CashJournalEntry[];
  total: number;
  page: number;
  pageSize: number;
  /** Σ amount of all filtered entries (every page) by direction. */
  totals: { in: number; out: number };
}
