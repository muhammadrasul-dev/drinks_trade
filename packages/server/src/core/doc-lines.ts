// Checks shared by purchase and sale posting (business-logic §4.2, §5.2): a
// draft's lines were computed when it was saved, so before posting each
// product must still be active and a BLOCK line must still hold
// inputQty × the product's current units per block (OQ-06). Either failure
// sends the user back to re-save the draft, which recomputes the lines.
import { DomainError, ErrorCode, QtyUnit } from '@drinks/shared';

export interface PostedLineProduct {
  lineNo: number;
  productId: string;
  inputUnit: QtyUnit;
  inputQty: number;
  qty: number;
  product: { name: string; unitsPerBlock: number; archivedAt: Date | null };
}

/** ENTITY_ARCHIVED for the first archived product, else UNITS_PER_BLOCK_CHANGED for every stale BLOCK line. */
export function assertLineProductsUnchanged(lines: readonly PostedLineProduct[]): void {
  const archived = lines.find((line) => line.product.archivedAt !== null);
  if (archived) {
    throw new DomainError(ErrorCode.ENTITY_ARCHIVED, {
      entity: 'product',
      name: archived.product.name,
    });
  }
  const changed = lines.filter(
    (line) =>
      line.inputUnit === QtyUnit.BLOCK && line.qty !== line.inputQty * line.product.unitsPerBlock,
  );
  if (changed.length > 0) {
    throw new DomainError(ErrorCode.UNITS_PER_BLOCK_CHANGED, {
      lines: changed.map((line) => ({
        lineNo: line.lineNo,
        productId: line.productId,
        product: line.product.name,
        qty: line.qty,
        unitsPerBlock: line.product.unitsPerBlock,
      })),
    });
  }
}
