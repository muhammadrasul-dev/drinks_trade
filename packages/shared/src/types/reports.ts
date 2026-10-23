import type { CostString } from '../costing';

// Report DTOs (Bosqich 8). Cost fields are optional and left out by the
// server unless the user holds `report.sales.cost` (CLAUDE.md rule 6) — the
// key is absent from STAFF responses, not null.

/** Stock of one product in one sub-warehouse (qty > 0). */
export interface StockReportLocation {
  warehouse: { id: string; name: string };
  subWarehouse: { id: string; name: string };
  /** Pieces. */
  qty: number;
}

/** One product of the stock report (T-801, SRS §7.1). */
export interface StockReportRow {
  product: {
    id: string;
    name: string;
    sku: string | null;
    unitsPerBlock: number;
    /** Pieces, store-wide; 0 — no warning. */
    minStock: number;
    archived: boolean;
    category: { id: string; name: string } | null;
    brand: { id: string; name: string } | null;
  };
  /** Pieces in the shown locations (Σ locations.qty; the warehouse filter narrows it). */
  qty: number;
  /** Pieces in the whole store — what lowStock compares with minStock. */
  storeQty: number;
  lowStock: boolean;
  /** By warehouse name, then sub-warehouse name; empty when the product has no stock. */
  locations: StockReportLocation[];
  /** Weighted average cost per piece (BR-6). OWNER only. */
  avgCost?: CostString;
  /** qty × avgCost in whole som (business-logic §1.2 rounding). OWNER only. */
  value?: number;
}

export interface StockReport {
  /** By product name. */
  items: StockReportRow[];
  totals: {
    products: number;
    /** Σ items.value. OWNER only. */
    value?: number;
  };
}

/** One product of the sales report (T-802, SRS §7.2, database §7.2). */
export interface SalesReportRow {
  product: {
    id: string;
    name: string;
    sku: string | null;
    /** Current value — qty is shown as blocks + pieces with it. */
    unitsPerBlock: number;
    archived: boolean;
    category: { id: string; name: string } | null;
    brand: { id: string; name: string } | null;
  };
  /** Pieces sold (Σ sale_line.qty). */
  qty: number;
  /** Σ sale_line.line_total, whole som. */
  revenue: number;
  /** Σ sale_line.cost_amount — the cost frozen at posting (BR-6). OWNER only. */
  cost?: number;
  /** revenue − cost. OWNER only. */
  grossProfit?: number;
}

export interface SalesReport {
  /** By product name (OQ-35). */
  items: SalesReportRow[];
  totals: {
    products: number;
    /** Posted sales (documents) in the period. */
    sales: number;
    /** Σ items.revenue = Σ sale.total_amount of those sales. */
    revenue: number;
    /** Σ items.cost. OWNER only. */
    cost?: number;
    /** Σ items.grossProfit. OWNER only. */
    grossProfit?: number;
  };
}

/**
 * P&L of a period (T-803, BR-11, business-logic §8, database §7.3). OWNER
 * only (`report.pnl`) — the whole report is confidential, so there is no
 * reduced STAFF variant. Whole som; every line is ≥ 0 except the profits.
 */
export interface PnlReport {
  /** Σ sale.total_amount of POSTED sales dated in the period (credit sales too). */
  revenue: number;
  /** Σ sale.cost_total of the same sales — the cost frozen at posting (BR-6). */
  cogs: number;
  /** revenue − cogs. */
  grossProfit: number;
  /** Σ TRAVEL_EXPENSE dated in the period that were not reversed. */
  travelExpense: number;
  /** Σ |stock_count_result.amount| over amount < 0, POSTED counts dated in the period ("Kamomad"). */
  stockShortage: number;
  /** Σ stock_count_result.amount over amount > 0 of the same counts ("Ortiqcha"). */
  stockSurplus: number;
  /** grossProfit − travelExpense − stockShortage + stockSurplus. */
  netProfit: number;
  /** How many records each line sums: posted sales, travel expenses, posted stock counts. */
  counts: { sales: number; travelExpenses: number; stockCounts: number };
}
