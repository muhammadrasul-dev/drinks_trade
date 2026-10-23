import type { OpenStockCount } from './stock-count';

// Home page DTO (T-902, FR-1.3). Quantities and counts only — no amounts,
// costs, cash or debts for any role. A block is left out (key absent) when
// the role lacks the permission of the page it links to.

/** One product whose store-wide stock is below its minimum (business-logic §9). */
export interface DashboardLowStockItem {
  id: string;
  name: string;
  unitsPerBlock: number;
  /** Pieces in the whole store. */
  stockQty: number;
  /** Pieces; always > 0 here. */
  minStock: number;
}

export interface DashboardLowStock {
  /** Every low-stock active product of the store. */
  total: number;
  /** The most depleted first (stock / minimum), at most DASHBOARD_LOW_STOCK_LIMIT. */
  items: DashboardLowStockItem[];
}

export interface DashboardSummary {
  /** `report.stock`. */
  lowStock?: DashboardLowStock;
  /** Open (DRAFT) stock counts — `warehouse.read`, like the T-603 banner. */
  openStockCounts?: OpenStockCount[];
  /** DRAFT sales of the store — `sale.write`. */
  draftSales?: number;
  /** DRAFT purchases of the store — `purchase.write`. */
  draftPurchases?: number;
}
