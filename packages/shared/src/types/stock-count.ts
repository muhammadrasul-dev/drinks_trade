import type { CostString } from '../costing';
import type { StockCountStatus } from '../enums';
import type { DocumentAuthor } from './purchase';

// Stock count DTOs (T-601). Quantities are visible to both roles; every
// amount and cost (`avgCost`, `diffAmount`, `shortageAmount`, `surplusAmount`)
// is left out by the server unless the user has `stockCount.amount.read`
// (OWNER, CLAUDE.md rule 6) — the keys are absent, not null.

export interface StockCountListItem {
  id: string;
  /** "I-000007", assigned when the count is opened. */
  number: string;
  docDate: Date;
  status: StockCountStatus;
  warehouse: { id: string; name: string };
  /** Counted rows saved so far. */
  lineCount: number;
  note: string | null;
  createdBy: DocumentAuthor;
  createdAt: Date;
  /** Posting results (T-602); null before. OWNER only. */
  shortageAmount?: number | null;
  surplusAmount?: number | null;
}

export interface StockCountListPage {
  items: StockCountListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** One (sub-warehouse, product) row of the counting form. */
export interface StockCountRow {
  subWarehouse: { id: string; name: string; archived: boolean };
  product: {
    id: string;
    name: string;
    sku: string | null;
    barcode: string | null;
    unitsPerBlock: number;
    archived: boolean;
  };
  /**
   * DRAFT: the live balance (it cannot change — the warehouse is blocked,
   * BR-8). POSTED: the snapshot taken at posting. CANCELLED: null.
   */
  systemQty: number | null;
  /** Pieces; null = not counted, the balance stays (OQ-13). */
  countedQty: number | null;
  /** countedQty − systemQty; null when either is missing. */
  diffQty: number | null;
  /** OWNER only: the product's current average cost (4 decimals). */
  avgCost?: CostString;
  /** OWNER only: round(diffQty × avgCost); null when diffQty is. */
  diffAmount?: number | null;
}

export interface StockCountDetail extends Omit<StockCountListItem, 'lineCount'> {
  /** `YYYY-MM-DD` of docDate in the store zone (the form's date field). */
  docDay: string;
  /** Optimistic lock: send it back with update / cancel. */
  version: number;
  postedAt: Date | null;
  postedBy: DocumentAuthor | null;
  cancelledAt: Date | null;
  cancelledBy: DocumentAuthor | null;
  /**
   * DRAFT: every sub-warehouse × product holding stock in the warehouse plus
   * the counted rows (extra goods found). Otherwise: the counted rows.
   * Sorted by sub-warehouse, then product name.
   */
  rows: StockCountRow[];
  /** Rows with countedQty !== null. */
  countedCount: number;
  /**
   * OWNER only, DRAFT: what posting would write now — per product the
   * warehouse-total difference × avg (BR-8), so moves between sub-warehouses
   * cancel out. Summed like stock_count.shortage_amount / surplus_amount.
   */
  estimate?: { shortageAmount: number; surplusAmount: number };
}

/** The open (DRAFT) count of a warehouse, for the warehouses page and the T-603 banner. */
export interface OpenStockCount {
  id: string;
  number: string;
  warehouseId: string;
  warehouseName: string;
}
