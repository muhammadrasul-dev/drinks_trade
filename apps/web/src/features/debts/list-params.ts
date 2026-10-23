import { DebtDirection, DebtSource, DebtStatus } from '@drinks/shared';
import { DEBT_SEARCH_MAX, type DebtListQuery } from '@drinks/shared/schemas';
import { z } from 'zod';

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

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function pick<T>(schema: z.ZodType<T>, value: string | undefined): T | undefined {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

const isoDate = z.iso.date();
const search = z.string().trim().min(1).max(DEBT_SEARCH_MAX);

/** URL search params → service query; invalid values are dropped, never an error page. */
export function parseDebtParams(params: SearchParams): DebtListFilters & DebtListQuery {
  const values = {
    direction: pick(z.enum(DebtDirection), first(params.direction)),
    status: pick(z.enum(DebtStatus), first(params.status)),
    source: pick(z.enum(DebtSource), first(params.source)),
    from: pick(isoDate, first(params.from)),
    to: pick(isoDate, first(params.to)),
    search: pick(search, first(params.q)),
  };
  const page = Number(first(params.page));
  return {
    ...Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)),
    ...(Number.isSafeInteger(page) && page > 1 && { page }),
  };
}

/** Filters → `/debts?…` (page 1 and empty values left out). */
export function debtsHref(filters: DebtListFilters): string {
  const params = new URLSearchParams();
  if (filters.direction) params.set('direction', filters.direction);
  if (filters.status) params.set('status', filters.status);
  if (filters.source) params.set('source', filters.source);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.search) params.set('q', filters.search);
  if (filters.page && filters.page > 1) params.set('page', String(filters.page));
  const query = params.toString();
  return query ? `${DEBTS_HREF}?${query}` : DEBTS_HREF;
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
