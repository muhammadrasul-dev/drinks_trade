import { DocStatus } from '@drinks/shared';
import type { PurchaseListQuery } from '@drinks/shared/schemas';
import { z } from 'zod';

// /purchases filters live in the URL (?status=&from=&to=&q=&page=), like /products.

export const PURCHASES_HREF = '/purchases';

export interface PurchaseListFilters {
  status?: DocStatus;
  from?: string;
  to?: string;
  q?: string;
  page?: number;
}

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const isoDate = z.iso.date();
const status = z.enum(DocStatus);

function validDate(value: string | undefined): string | undefined {
  return value && isoDate.safeParse(value).success ? value : undefined;
}

/** URL search params → service query; invalid values are dropped, never an error page. */
export function parseListParams(params: SearchParams): PurchaseListFilters & PurchaseListQuery {
  const parsedStatus = status.safeParse(first(params.status));
  const from = validDate(first(params.from));
  const to = validDate(first(params.to));
  const q = first(params.q)?.trim().slice(0, 30);
  const page = Number(first(params.page));
  return {
    ...(parsedStatus.success && { status: parsedStatus.data }),
    ...(from && { from }),
    ...(to && { to }),
    ...(q && { q }),
    ...(Number.isSafeInteger(page) && page > 1 && { page }),
  };
}

/** Filters → `/purchases?…` (page 1 and empty values left out). */
export function listHref(filters: PurchaseListFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.q) params.set('q', filters.q);
  if (filters.page && filters.page > 1) params.set('page', String(filters.page));
  const query = params.toString();
  return query ? `${PURCHASES_HREF}?${query}` : PURCHASES_HREF;
}
