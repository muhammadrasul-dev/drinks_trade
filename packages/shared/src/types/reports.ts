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
