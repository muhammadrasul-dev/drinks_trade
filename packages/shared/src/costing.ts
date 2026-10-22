// Weighted average cost (BR-6). Costs are `Decimal(20,4)` strings in and out
// ("6000.0000"), money is whole som, quantities are pieces. Every division is
// rounded half up to COST_SCALE digits — what a NUMERIC(20,4) column stores.
// Source of truth: .claude/docs/business-logic.md §1.2, §1.3, §5.1, §5.3.
import {
  COST_ONE,
  assertInt,
  divRoundHalfUp,
  formatCost,
  parseCost,
  toSafeNumber,
} from './decimal';

export { COST_SCALE } from './decimal';

/** Cost per piece as a fixed 4-digit decimal string, e.g. "6000.0000". */
export type CostString = string;

function assertCost(units: bigint, value: string): void {
  if (units < 0n) throw new RangeError(`Cost "${value}" must not be negative`);
}

/** Line cost in whole som: `roundHalfUp(qty × unitCost)` (§1.2). qty may be negative. */
export function costAmount(qty: number, unitCost: CostString): number {
  assertInt(qty, 'qty');
  const product = BigInt(qty) * parseCost(unitCost);
  return toSafeNumber(divRoundHalfUp(product, COST_ONE), 'Money value');
}

/** Purchase line unit cost: `lineTotal / qty` to 4 digits (§5.1). */
export function unitCostOf(lineTotal: number, qty: number): CostString {
  assertInt(lineTotal, 'lineTotal', 0);
  assertInt(qty, 'qty', 1);
  return formatCost(divRoundHalfUp(BigInt(lineTotal) * COST_ONE, BigInt(qty)));
}

export interface ReceiptInput {
  /** Q — `product_cost.total_qty` before the receipt (whole shop), pieces. */
  totalQty: number;
  /** avg — `product_cost.avg_cost` before the receipt. */
  avgCost: CostString;
  /** q — pieces coming in (> 0). */
  inQty: number;
  /** inCost — what the incoming pieces cost, whole som. */
  inCost: number;
}

/**
 * New average after goods come in — a purchase or a sale reversal (§1.3):
 * `(Q × avg + inCost) / (Q + q)`; with Q = 0 that is `inCost / q`.
 */
export function avgOnReceipt({ totalQty, avgCost, inQty, inCost }: ReceiptInput): CostString {
  assertInt(totalQty, 'totalQty', 0);
  assertInt(inQty, 'inQty', 1);
  assertInt(inCost, 'inCost', 0);
  const avg = parseCost(avgCost);
  assertCost(avg, avgCost);
  const numerator = BigInt(totalQty) * avg + BigInt(inCost) * COST_ONE;
  return formatCost(divRoundHalfUp(numerator, BigInt(totalQty + inQty)));
}

export interface PurchaseReversalInput {
  /** Q — `product_cost.total_qty` before the reversal, pieces. */
  totalQty: number;
  /** avg — `product_cost.avg_cost` before the reversal. */
  avgCost: CostString;
  /** q — pieces going back to the supplier (> 0, ≤ Q). */
  outQty: number;
  /** outCost — Σ lineTotal of the reversed purchase, whole som. */
  outCost: number;
}

/**
 * New average after a purchase is reversed (§5.3, OQ-09):
 * Q − q = 0 → 0; otherwise `(Q × avg − outCost) / (Q − q)`, floored at 0.
 * q > Q is a programming error — the stock check (BR-3) must block it first.
 */
export function avgOnPurchaseReversal({
  totalQty,
  avgCost,
  outQty,
  outCost,
}: PurchaseReversalInput): CostString {
  assertInt(totalQty, 'totalQty', 0);
  assertInt(outQty, 'outQty', 1);
  assertInt(outCost, 'outCost', 0);
  const avg = parseCost(avgCost);
  assertCost(avg, avgCost);
  const remaining = totalQty - outQty;
  if (remaining < 0) {
    throw new RangeError(`outQty ${outQty} exceeds totalQty ${totalQty}`);
  }
  if (remaining === 0) return formatCost(0n);
  const numerator = BigInt(totalQty) * avg - BigInt(outCost) * COST_ONE;
  if (numerator <= 0n) return formatCost(0n);
  return formatCost(divRoundHalfUp(numerator, BigInt(remaining)));
}
