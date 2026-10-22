import type { DocStatus, QtyUnit } from '../enums';

// Purchase DTOs (T-404). Purchase prices and the payment split are visible to
// both roles (product.purchasePrice.read, OQ-02); cash balances are not here.

export interface DocumentAuthor {
  id: string;
  fullName: string;
}

export interface PurchaseListItem {
  id: string;
  /** "P-000045", assigned when the draft is created. */
  number: string;
  docDate: Date;
  status: DocStatus;
  totalAmount: number;
  paidCash: number;
  paidCard: number;
  paidCredit: number;
  lineCount: number;
  note: string | null;
  createdBy: DocumentAuthor;
}

export interface PurchaseListPage {
  items: PurchaseListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PurchaseLine {
  id: string;
  lineNo: number;
  product: { id: string; name: string; unitsPerBlock: number; archived: boolean };
  subWarehouse: { id: string; name: string; warehouseName: string; archived: boolean };
  inputUnit: QtyUnit;
  inputQty: number;
  /** Whole som per inputUnit. */
  inputPrice: number;
  /** Pieces (inputQty × unitsPerBlock at the last save for BLOCK lines). */
  qty: number;
  lineTotal: number;
  /** lineTotal / qty, 4 decimals (business-logic §5.1). */
  unitCost: string;
}

export interface PurchaseDetail extends Omit<PurchaseListItem, 'lineCount'> {
  /** `YYYY-MM-DD` of docDate in the store zone (the form's date field). */
  docDay: string;
  /** Optimistic lock: send it back with update / delete. */
  version: number;
  createdAt: Date;
  postedAt: Date | null;
  reversedAt: Date | null;
  reverseReason: string | null;
  lines: PurchaseLine[];
}
