import { CashboxType, CashDirection, CashTxType } from '@drinks/shared';
import type { CashJournalQuery } from '@drinks/shared/schemas';
import { z } from 'zod';

import {
  dateParam,
  hrefWith,
  pageParam,
  schemaParam,
  type SearchParams,
} from '@/lib/search-params';

// /cash journal filters live in the URL (?from=&to=&cashbox=&type=&direction=&page=),
// like /purchases.

export const CASH_HREF = '/cash';

export interface CashJournalFilters {
  from?: string;
  to?: string;
  cashbox?: CashboxType;
  type?: CashTxType;
  direction?: CashDirection;
  page?: number;
}

const cashbox = z.enum(CashboxType);
const type = z.enum(CashTxType);
const direction = z.enum(CashDirection);

/** URL search params → service query; invalid values are dropped, never an error page. */
export function parseJournalParams(params: SearchParams): CashJournalFilters & CashJournalQuery {
  const values = {
    from: dateParam(params.from),
    to: dateParam(params.to),
    cashbox: schemaParam(cashbox, params.cashbox),
    type: schemaParam(type, params.type),
    direction: schemaParam(direction, params.direction),
    page: pageParam(params.page),
  };
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}

/** Filters → `/cash?…` (page 1 and empty values left out). */
export function journalHref(filters: CashJournalFilters): string {
  return hrefWith(CASH_HREF, {
    from: filters.from,
    to: filters.to,
    cashbox: filters.cashbox,
    type: filters.type,
    direction: filters.direction,
    page: filters.page,
  });
}

/** True when any filter (not the page) is set. */
export function hasFilters(filters: CashJournalFilters): boolean {
  return Boolean(
    filters.from || filters.to || filters.cashbox || filters.type || filters.direction,
  );
}
