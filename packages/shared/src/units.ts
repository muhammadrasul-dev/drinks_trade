// Units (BR-1): quantities are always whole pieces; a block is only a way to
// enter and display them. Source of truth: .claude/docs/business-logic.md §1.1.
import { assertInt, groupDigits } from './decimal';
import { QtyUnit } from './enums';

/** Blocks + loose pieces → pieces (input, stock count). `toPieces(3, 2, 6)` → 20. */
export function toPieces(blocks: number, pieces: number, unitsPerBlock: number): number {
  assertInt(blocks, 'blocks', 0);
  assertInt(pieces, 'pieces', 0);
  assertInt(unitsPerBlock, 'unitsPerBlock', 1);
  const result = blocks * unitsPerBlock + pieces;
  assertInt(result, 'quantity');
  return result;
}

/**
 * Pieces of a document line entered as `qty` in `unit` (sale / purchase lines):
 * a BLOCK line is `qty × unitsPerBlock`. Not range-checked - callers reject
 * unsafe results themselves.
 */
export function unitPieces(unit: QtyUnit, qty: number, unitsPerBlock: number): number {
  return unit === QtyUnit.BLOCK ? qty * unitsPerBlock : qty;
}

export interface BlocksAndPieces {
  blocks: number;
  pieces: number;
}

/** Pieces → whole blocks + remainder. `splitPieces(20, 6)` → { blocks: 3, pieces: 2 }. */
export function splitPieces(qty: number, unitsPerBlock: number): BlocksAndPieces {
  assertInt(qty, 'qty', 0);
  assertInt(unitsPerBlock, 'unitsPerBlock', 1);
  return { blocks: Math.floor(qty / unitsPerBlock), pieces: qty % unitsPerBlock };
}

/** Unit words; the UI passes the translated `enums.QtyUnit.*` labels. */
export interface QtyLabels {
  block: string;
  piece: string;
}

const UZ_QTY_LABELS: QtyLabels = { block: 'blok', piece: 'dona' };

/**
 * Pieces → display text: `formatQty(20, 6)` → "3 blok 2 dona", 18 → "3 blok",
 * 2 → "2 dona", 0 → "0 dona". A negative qty (stock count delta) keeps its sign
 * in front: −20 → "-3 blok 2 dona". Numbers are grouped with a no-break space.
 */
export function formatQty(
  qty: number,
  unitsPerBlock: number,
  labels: QtyLabels = UZ_QTY_LABELS,
): string {
  assertInt(qty, 'qty');
  const { blocks, pieces } = splitPieces(Math.abs(qty), unitsPerBlock);
  const parts: string[] = [];
  if (blocks > 0) parts.push(`${groupDigits(blocks)} ${labels.block}`);
  if (pieces > 0 || blocks === 0) parts.push(`${groupDigits(pieces)} ${labels.piece}`);
  const text = parts.join(' ');
  return qty < 0 ? `-${text}` : text;
}
