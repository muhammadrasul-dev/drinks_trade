// Product helpers shared by the form (live preview) and the server (DTOs).

/** OQ-15: the price is per piece; a block costs salePrice × unitsPerBlock. */
export function blockPrice(salePrice: number, unitsPerBlock: number): number {
  const result = salePrice * unitsPerBlock;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new RangeError(`Block price of ${salePrice} × ${unitsPerBlock} is not a safe integer`);
  }
  return result;
}

/** FR-1.3 / business-logic §9: store-wide stock below a positive minimum. */
export function isLowStock(stockQty: number, minStock: number): boolean {
  return minStock > 0 && stockQty < minStock;
}

/** Low-stock products listed on the home page (T-902, OQ-40); the rest are only counted. */
export const DASHBOARD_LOW_STOCK_LIMIT = 10;

/**
 * Order of low-stock products (OQ-40): the lowest share of the minimum first,
 * so out-of-stock products lead. Equal shares keep their order (the caller
 * sorts by name first). `minStock` must be > 0.
 */
export function compareStockShortage(
  a: { stockQty: number; minStock: number },
  b: { stockQty: number; minStock: number },
): number {
  return a.stockQty / a.minStock - b.stockQty / b.minStock;
}
