import { addMonths, addStoreDays, lastDayOfMonth, storeToday } from '@drinks/shared';
import type { PnlReportQuery } from '@drinks/shared/schemas';

import { dateParam, firstParam, hrefWith, type SearchParams } from '@/lib/search-params';

// /reports/pnl period lives in the URL, one of (business-logic §8):
//   ?day=YYYY-MM-DD · ?month=YYYY-MM · ?year=YYYY · ?from=&to= (range)
// The first valid one wins in that order; none → the current month (OQ-36).
// Every period is a whole calendar day / month / year of store days.

export const PNL_REPORT_HREF = '/reports/pnl';

export const PNL_PERIOD_KINDS = ['day', 'month', 'year', 'range'] as const;
export type PnlPeriodKind = (typeof PNL_PERIOD_KINDS)[number];

export type PnlPeriod =
  | { kind: 'day'; day: string }
  /** `YYYY-MM`. */
  | { kind: 'month'; month: string }
  /** `YYYY`. */
  | { kind: 'year'; year: string }
  /** Inclusive store days; one end may be open. */
  | { kind: 'range'; from?: string; to?: string };

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const YEAR = /^[1-9]\d{3}$/;

/** The month and the year a `YYYY-MM-DD` day falls in. */
const monthOf = (day: string) => day.slice(0, 7);
const yearOf = (day: string) => day.slice(0, 4);

/** The current month: the page's default period (OQ-36). */
export function currentMonthPeriod(today: string = storeToday()): PnlPeriod {
  return { kind: 'month', month: monthOf(today) };
}

/**
 * URL search params → period; invalid values are dropped and a reversed range
 * is swapped, so the page never shows an error. `today` is the store's.
 */
export function parsePnlParams(params: SearchParams, today: string = storeToday()): PnlPeriod {
  const day = dateParam(params.day);
  if (day) return { kind: 'day', day };
  const month = firstParam(params.month);
  if (month && MONTH.test(month)) return { kind: 'month', month };
  const year = firstParam(params.year);
  if (year && YEAR.test(year)) return { kind: 'year', year };
  const from = dateParam(params.from);
  const to = dateParam(params.to);
  if (from && to && from > to) return { kind: 'range', from: to, to: from };
  if (from || to) return { kind: 'range', ...(from && { from }), ...(to && { to }) };
  return currentMonthPeriod(today);
}

/** Period → the service query (inclusive store days). */
export function pnlPeriodRange(period: PnlPeriod): PnlReportQuery {
  switch (period.kind) {
    case 'day':
      return { from: period.day, to: period.day };
    case 'month':
      return { from: `${period.month}-01`, to: lastDayOfMonth(period.month) };
    case 'year':
      return { from: `${period.year}-01-01`, to: `${period.year}-12-31` };
    case 'range':
      return { ...(period.from && { from: period.from }), ...(period.to && { to: period.to }) };
  }
}

/** Period → its search params (`?day=` / `?month=` / `?year=` / `?from=&to=`). */
export function pnlPeriodSearch(period: PnlPeriod): Record<string, string | undefined> {
  switch (period.kind) {
    case 'day':
      return { day: period.day };
    case 'month':
      return { month: period.month };
    case 'year':
      return { year: period.year };
    case 'range':
      return { from: period.from, to: period.to };
  }
}

/** Period → `/reports/pnl?…`; the current month is the bare href. */
export function pnlReportHref(period: PnlPeriod, today: string = storeToday()): string {
  if (period.kind === 'month' && period.month === monthOf(today)) return PNL_REPORT_HREF;
  return hrefWith(PNL_REPORT_HREF, pnlPeriodSearch(period));
}

/**
 * The previous (`-1`) or next (`1`) day / month / year; a range has no step
 * (undefined). Steps never go past the current one: a future period is empty.
 */
export function shiftPnlPeriod(
  period: PnlPeriod,
  step: -1 | 1,
  today: string = storeToday(),
): PnlPeriod | undefined {
  let next: PnlPeriod;
  switch (period.kind) {
    case 'day':
      next = { kind: 'day', day: addStoreDays(period.day, step) };
      break;
    case 'month':
      next = { kind: 'month', month: addMonths(period.month, step) };
      break;
    case 'year': {
      const year = Number(period.year) + step;
      if (year < 1000) return undefined;
      next = { kind: 'year', year: String(year) };
      break;
    }
    case 'range':
      return undefined;
  }
  const from = pnlPeriodRange(next).from!;
  return step > 0 && from > today ? undefined : next;
}

/**
 * Switching the period kind keeps the user's place: the new period contains
 * today when the current one does, otherwise the current period's first day
 * (an open-start range: its last day).
 * A range takes the current period's days, cut at today.
 */
export function switchPnlPeriodKind(
  period: PnlPeriod,
  kind: PnlPeriodKind,
  today: string = storeToday(),
): PnlPeriod {
  if (kind === period.kind) return period;
  const { from, to } = pnlPeriodRange(period);
  if (kind === 'range') {
    return { kind: 'range', ...(from && { from }), ...(to && { to: to > today ? today : to }) };
  }
  const containsToday = (!from || from <= today) && (!to || today <= to);
  const anchor = containsToday ? today : (from ?? to ?? today);
  switch (kind) {
    case 'day':
      return { kind: 'day', day: anchor };
    case 'month':
      return { kind: 'month', month: monthOf(anchor) };
    case 'year':
      return { kind: 'year', year: yearOf(anchor) };
  }
}
