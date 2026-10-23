import { DocStatus } from '@drinks/shared';
import type { SaleListQuery } from '@drinks/shared/schemas';
import { z } from 'zod';

import {
  dateParam,
  hrefWith,
  pageParam,
  schemaParam,
  type SearchParams,
  textParam,
} from '@/lib/search-params';

// /sales filters live in the URL (?status=&from=&to=&q=&page=), like /products.

export const SALES_HREF = '/sales';

export interface SaleListFilters {
  status?: DocStatus;
  from?: string;
  to?: string;
  q?: string;
  page?: number;
}

const status = z.enum(DocStatus);

/** URL search params → service query; invalid values are dropped, never an error page. */
export function parseListParams(params: SearchParams): SaleListFilters & SaleListQuery {
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

/** Filters → `/sales?…` (page 1 and empty values left out). */
export function listHref(filters: SaleListFilters): string {
  return hrefWith(SALES_HREF, {
    status: filters.status,
    from: filters.from,
    to: filters.to,
    q: filters.q,
    page: filters.page,
  });
}
