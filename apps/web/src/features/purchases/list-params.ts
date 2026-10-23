import { DocStatus } from '@drinks/shared';
import type { PurchaseListQuery } from '@drinks/shared/schemas';
import { z } from 'zod';

import {
  dateParam,
  hrefWith,
  pageParam,
  schemaParam,
  type SearchParams,
  textParam,
} from '@/lib/search-params';

// /purchases filters live in the URL (?status=&from=&to=&q=&page=), like /products.

export const PURCHASES_HREF = '/purchases';

export interface PurchaseListFilters {
  status?: DocStatus;
  from?: string;
  to?: string;
  q?: string;
  page?: number;
}

const status = z.enum(DocStatus);

/** URL search params → service query; invalid values are dropped, never an error page. */
export function parseListParams(params: SearchParams): PurchaseListFilters & PurchaseListQuery {
  const parsedStatus = schemaParam(status, params.status);
  const from = dateParam(params.from);
  const to = dateParam(params.to);
  const q = textParam(params.q, 30);
  const page = pageParam(params.page);
  return {
    ...(parsedStatus && { status: parsedStatus }),
    ...(from && { from }),
    ...(to && { to }),
    ...(q && { q }),
    ...(page && { page }),
  };
}

/** Filters → `/purchases?…` (page 1 and empty values left out). */
export function listHref(filters: PurchaseListFilters): string {
  return hrefWith(PURCHASES_HREF, {
    status: filters.status,
    from: filters.from,
    to: filters.to,
    q: filters.q,
    page: filters.page,
  });
}
