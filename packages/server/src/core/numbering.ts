// Document numbers (S-000123) from doc_sequence, assigned when a draft is
// created (database.md §6.3). Lock step 3 of business-logic.md §2.
import type { DocType } from '@drinks/shared';

import { assertLockOrder, LockStep } from './locks';
import type { Tx } from './tx';

export const DOC_NUMBER_PREFIX: Readonly<Record<DocType, string>> = {
  SALE: 'S',
  PURCHASE: 'P',
  STOCK_COUNT: 'I',
};

const DIGITS = 6;

export function formatDocNumber(docType: DocType, value: number): string {
  return `${DOC_NUMBER_PREFIX[docType]}-${String(value).padStart(DIGITS, '0')}`;
}

/**
 * Increments the store's counter for `docType` and returns the formatted
 * number. The upsert takes a row lock on the doc_sequence row until the
 * transaction ends, so parallel callers get consecutive, distinct numbers;
 * a rolled-back transaction leaves a gap (database.md §6.3 accepts gaps).
 */
export async function nextDocNumber(tx: Tx, storeId: string, docType: DocType): Promise<string> {
  assertLockOrder(tx, LockStep.DOC_SEQUENCE);
  const rows = await tx.$queryRaw<{ last_number: number }[]>`
    INSERT INTO doc_sequence (store_id, doc_type, last_number)
    VALUES (${storeId}::uuid, ${docType}::"DocType", 1)
    ON CONFLICT (store_id, doc_type)
    DO UPDATE SET last_number = doc_sequence.last_number + 1
    RETURNING last_number`;
  const row = rows[0];
  if (!row) {
    throw new Error('doc_sequence upsert returned no row');
  }
  return formatDocNumber(docType, row.last_number);
}
