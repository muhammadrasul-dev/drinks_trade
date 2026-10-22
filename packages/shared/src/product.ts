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
