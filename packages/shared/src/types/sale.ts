import type { DocStatus, QtyUnit } from '../enums';
import type { ProductOption } from './product';
import type { DocumentAuthor } from './purchase';

// Sale DTOs (T-501). Sale prices and the payment split are visible to both
// roles; the cost fields (unit_cost, cost_amount, cost_total) are never sent
// to STAFF (CLAUDE.md rule 6) — a draft has none yet, so they are not here.

export interface SaleListItem {
  id: string;
  /** "S-000123", assigned when the draft is created. */
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

export interface SaleListPage {
  items: SaleListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SaleLine {
  id: string;
  lineNo: number;
  product: { id: string; name: string; unitsPerBlock: number; archived: boolean };
  subWarehouse: { id: string; name: string; warehouseName: string; archived: boolean };
  inputUnit: QtyUnit;
  inputQty: number;
  /** Pieces (inputQty × unitsPerBlock at the last save for BLOCK lines). */
  qty: number;
  /** Per-piece sale price copied from the product at the last save (OQ-15). */
  unitPrice: number;
  /** qty × unitPrice. */
  lineTotal: number;
  /**
   * Draft only: current stock of (sub-warehouse, product) in pieces; null
   * once the sale is posted or reversed.
   */
  available: number | null;
  /**
   * Draft only (FR-3.3): the draft's lines of this (sub-warehouse, product)
   * need more pieces in total than `available` — posting would fail.
   */
  stockShort: boolean;
}

export interface SaleDetail extends Omit<SaleListItem, 'lineCount'> {
  /** `YYYY-MM-DD` of docDate in the store zone (the form's date field). */
  docDay: string;
  /** Optimistic lock: send it back with update / delete. */
  version: number;
  createdAt: Date;
  postedAt: Date | null;
  postedBy: DocumentAuthor | null;
  reversedAt: Date | null;
  reverseReason: string | null;
  lines: SaleLine[];
  /** Some line is stockShort: "Bajarish" stays disabled (FR-3.3). */
  stockShort: boolean;
}

/** The sale form's product picker: an active product with its per-piece sale price. */
export interface SaleProductOption extends ProductOption {
  salePrice: number;
}

/** Current qty of one (sub-warehouse, product) pair, in pieces. */
export interface StockAvailability {
  subWarehouseId: string;
  productId: string;
  qty: number;
}
