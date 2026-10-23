'use client';

import { type SaleDetail, stockKeyOf } from '@drinks/shared';
import { useEffect, useState } from 'react';

import { getSaleAvailability } from './actions';

/**
 * Current stock of the form's (sub-warehouse, product) pairs (FR-3.3). Seeded
 * from the saved draft; pairs the user adds are fetched once. Saving reloads
 * the page with fresh numbers; posting re-checks under the locks anyway.
 */
export function useAvailability(sale: SaleDetail | undefined, keys: readonly string[]) {
  const [known, setKnown] = useState<ReadonlyMap<string, number>>(
    () =>
      new Map(
        (sale?.lines ?? []).flatMap((line) =>
          line.available === null
            ? []
            : [
                [
                  stockKeyOf({ subWarehouseId: line.subWarehouse.id, productId: line.product.id }),
                  line.available,
                ] as const,
              ],
        ),
      ),
  );
  const missing = keys.filter((key) => !known.has(key));
  const missingKey = missing.join(',');

  useEffect(() => {
    if (missingKey === '') return;
    let cancelled = false;
    const pairs = missingKey.split(',').map((key) => {
      const [subWarehouseId = '', productId = ''] = key.split(':');
      return { subWarehouseId, productId };
    });
    void getSaleAvailability({ keys: pairs }).then((result) => {
      if (cancelled || !result.ok) return;
      setKnown((prev) => {
        const next = new Map(prev);
        for (const row of result.data) next.set(stockKeyOf(row), row.qty);
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [missingKey]);

  return known;
}
