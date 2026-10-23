// Stock count helpers shared by the counting form (live estimate) and the
// server (draft estimate, posting totals) — business-logic §6.2 steps 5–6.
import { type CostString, costAmount } from './costing';

export interface CountDiff {
  productId: string;
  /** countedQty − systemQty of one (sub-warehouse, product) row, pieces. */
  diffQty: number;
  /** The product's average cost; every row of a product carries the same one. */
  avgCost: CostString;
}

export interface CountTotals {
  /** Σ |amount| of the products that came out short, whole so'm. */
  shortageAmount: number;
  /** Σ amount of the products that came out over, whole so'm. */
  surplusAmount: number;
}

/**
 * BR-8: the difference is summed per product over the whole warehouse before
 * it is priced, so a move between sub-warehouses (−2 here, +2 there) costs
 * nothing. Each product's `roundHalfUp(Σ diff × avg)` then goes to the
 * shortage (< 0) or the surplus (> 0) — as stock_count stores them.
 */
export function countTotals(diffs: Iterable<CountDiff>): CountTotals {
  const byProduct = new Map<string, { diffQty: number; avgCost: CostString }>();
  for (const { productId, diffQty, avgCost } of diffs) {
    const entry = byProduct.get(productId);
    if (entry) entry.diffQty += diffQty;
    else byProduct.set(productId, { diffQty, avgCost });
  }
  let shortageAmount = 0;
  let surplusAmount = 0;
  for (const { diffQty, avgCost } of byProduct.values()) {
    const amount = costAmount(diffQty, avgCost);
    if (amount < 0) shortageAmount -= amount;
    else surplusAmount += amount;
  }
  return { shortageAmount, surplusAmount };
}
