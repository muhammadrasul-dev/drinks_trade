import { DebtDirection, DebtSource, DebtStatus } from '@drinks/shared';
import { DEBT_SEARCH_MAX, type DebtListQuery } from '@drinks/shared/schemas';
import { z } from 'zod';

import {
  dateParam,
  hrefWith,
  pageParam,
  schemaParam,
  type SearchParams,
} from '@/lib/search-params';

// /debts list filters live in the URL
// (?direction=&status=&source=&from=&to=&q=&page=), like /cash.

export const DEBTS_HREF = '/debts';

export interface DebtListFilters {
  direction?: DebtDirection;
  status?: DebtStatus;
  source?: DebtSource;
  from?: string;
  to?: string;
  /** Note substring (`q` in the URL). */
  search?: string;
  page?: number;
}

const search = z.string().trim().min(1).max(DEBT_SEARCH_MAX);

/** URL search params → service query; invalid values are dropped, never an error page. */
export function parseDebtParams(params: SearchParams): DebtListFilters & DebtListQuery {
  const values = {
    direction: schemaParam(z.enum(DebtDirection), params.direction),
    status: schemaParam(z.enum(DebtStatus), params.status),
    source: schemaParam(z.enum(DebtSource), params.source),
    from: dateParam(params.from),
    to: dateParam(params.to),
    search: schemaParam(search, params.q),
    page: pageParam(params.page),
  };
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}

/** Filters → `/debts?…` (page 1 and empty values left out). */
export function debtsHref(filters: DebtListFilters): string {
  return hrefWith(DEBTS_HREF, {
    direction: filters.direction,
    status: filters.status,
    source: filters.source,
    from: filters.from,
    to: filters.to,
    q: filters.search,
    page: filters.page,
  });
}

/** True when any filter (not the page) is set. */
export function hasFilters(filters: DebtListFilters): boolean {
  return Boolean(
    filters.direction ||
    filters.status ||
    filters.source ||
    filters.from ||
    filters.to ||
    filters.search,
  );
}
