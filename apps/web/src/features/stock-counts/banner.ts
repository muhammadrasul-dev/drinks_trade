import type { OpenStockCount } from '@drinks/shared';

import { stockCountHref } from './list-params';

/** GET → OpenStockCount[] of the store (app/api/stock-counts/open/route.ts). */
export const OPEN_STOCK_COUNTS_URL = '/api/stock-counts/open';

/**
 * The open counts the (app) banner announces on `pathname` (a locale-less
 * path, as next-intl's usePathname returns it). On a count's own counting
 * form the amber "blocked" notice already says the same, so that count is
 * left out there; every other open count stays.
 */
export function bannerCounts(
  counts: readonly OpenStockCount[],
  pathname: string,
): OpenStockCount[] {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return counts.filter((count) => path !== stockCountHref(count.id));
}

/** The JSON body of OPEN_STOCK_COUNTS_URL, or null if it is not a list of open counts. */
export function parseOpenCounts(body: unknown): OpenStockCount[] | null {
  if (!Array.isArray(body)) return null;
  const valid = body.every(
    (item: unknown) =>
      typeof item === 'object' &&
      item !== null &&
      ['id', 'number', 'warehouseId', 'warehouseName'].every(
        (key) => typeof (item as Record<string, unknown>)[key] === 'string',
      ),
  );
  return valid ? (body as OpenStockCount[]) : null;
}
