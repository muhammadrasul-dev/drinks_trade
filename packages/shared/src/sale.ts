// Sale helpers shared by the form (live check) and the server (draft DTO).

export interface StockNeed {
  subWarehouseId: string;
  productId: string;
  /** Pieces this line takes. */
  qty: number;
}

export interface LineStock {
  /** Current qty of the line's (sub-warehouse, product) pair. */
  available: number;
  /** All lines of this pair together need more than `available` (FR-3.3). */
  short: boolean;
  /** Pieces the pair's lines need together. */
  required: number;
}

export function stockKeyOf(key: { subWarehouseId: string; productId: string }): string {
  return `${key.subWarehouseId}:${key.productId}`;
}

/**
 * FR-3.3 / BR-7 warning: lines of one (sub-warehouse, product) pair share its
 * stock, so a pair is short when its lines need more pieces in total than it
 * holds — posting checks the same total (business-logic §4.2 step 7). Every
 * line of a short pair is flagged. `availableOf` returns the pair's qty.
 */
export function lineStock(
  lines: readonly StockNeed[],
  availableOf: (key: StockNeed) => number,
): LineStock[] {
  const required = new Map<string, number>();
  for (const line of lines) {
    const key = stockKeyOf(line);
    required.set(key, (required.get(key) ?? 0) + line.qty);
  }
  return lines.map((line) => {
    const available = availableOf(line);
    const total = required.get(stockKeyOf(line))!;
    return { available, required: total, short: total > available };
  });
}
