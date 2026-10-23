import { storeToday } from '@drinks/shared';
import type { SalesReportQuery } from '@drinks/shared/schemas';

import { dateParam, hrefWith, type SearchParams } from '@/lib/search-params';

// /reports/sales filters live in the URL (?from=&to=, inclusive store days).
// No range at all → the current month up to today (OQ-35); one end alone
// leaves the other open.

export const SALES_REPORT_HREF = '/reports/sales';

export interface SalesReportFilters {
  /** `YYYY-MM-DD`, store zone. */
  from?: string;
  to?: string;
}

/** The current month up to `today` (`YYYY-MM-DD`): the report's default period. */
export function currentMonth(today: string = storeToday()): Required<SalesReportFilters> {
  return { from: `${today.slice(0, 8)}01`, to: today };
}

/**
 * URL search params → service query; invalid days are dropped and a reversed
 * range is swapped, so the page never shows an error. `today` is the store's.
 */
export function parseSalesReportParams(
  params: SearchParams,
  today: string = storeToday(),
): SalesReportFilters & SalesReportQuery {
  const from = dateParam(params.from);
  const to = dateParam(params.to);
  if (!from && !to) return currentMonth(today);
  if (from && to && from > to) return { from: to, to: from };
  return { ...(from && { from }), ...(to && { to }) };
}

/** Filters → `/reports/sales?…`; the default period is the bare href. */
export function salesReportHref(filters: SalesReportFilters, today: string = storeToday()): string {
  const month = currentMonth(today);
  if (filters.from === month.from && filters.to === month.to) return SALES_REPORT_HREF;
  return hrefWith(SALES_REPORT_HREF, { from: filters.from, to: filters.to });
}
