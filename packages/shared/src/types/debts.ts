import type { CashboxType, DebtDirection, DebtSource, DebtStatus } from '../enums';
import type { DocumentAuthor } from './purchase';

// Debt DTOs (T-704). Confidential (debt.read, OWNER only): the services that
// return them refuse STAFF with FORBIDDEN (CLAUDE.md rule 6).

export interface DebtRepaymentItem {
  id: string;
  /** Whole som, > 0. */
  amount: number;
  repaidAt: Date;
  cashbox: CashboxType;
  note: string | null;
  createdBy: DocumentAuthor;
}

export interface DebtListItem {
  id: string;
  direction: DebtDirection;
  source: DebtSource;
  status: DebtStatus;
  /** Whole som. */
  amount: number;
  repaidAmount: number;
  /** amount − repaidAmount (BR-10); 0 for CLOSED. */
  remaining: number;
  note: string;
  debtDate: Date;
  createdAt: Date;
  /** The credit document of a SALE / PURCHASE debt. */
  sale: { id: string; number: string } | null;
  purchase: { id: string; number: string } | null;
  createdBy: DocumentAuthor;
  /** Oldest first. */
  repayments: DebtRepaymentItem[];
}

export interface DebtListPage {
  items: DebtListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** Σ remaining of the store's OPEN debts by direction (whole som). */
export interface DebtTotals {
  receivable: number;
  payable: number;
}
