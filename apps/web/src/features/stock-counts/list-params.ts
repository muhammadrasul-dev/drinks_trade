import { StockCountStatus } from '@drinks/shared';
import type { StockCountListQuery } from '@drinks/shared/schemas';
import { z } from 'zod';

import {
  hrefWith,
  pageParam,
  schemaParam,
  type SearchParams,
  textParam,
  uuidParam,
} from '@/lib/search-params';

// /stock-counts filters live in the URL (?status=&warehouse=&q=&page=), like /purchases.

export const STOCK_COUNTS_HREF = '/stock-counts';

/** One count's page: the counting form while DRAFT, read-only otherwise. */
export function stockCountHref(id: string): string {
  return `${STOCK_COUNTS_HREF}/${id}`;
}

export interface StockCountListFilters {
  status?: StockCountStatus;
  warehouseId?: string;
  q?: string;
  page?: number;
}

const status = z.enum(StockCountStatus);

/** URL search params → service query; invalid values are dropped, never an error page. */
export function parseListParams(params: SearchParams): StockCountListFilters & StockCountListQuery {
  const parsedStatus = schemaParam(status, params.status);
  const warehouseId = uuidParam(params.warehouse);
  const q = textParam(params.q, 30);
  const page = pageParam(params.page);
  return {
    ...(parsedStatus && { status: parsedStatus }),
    ...(warehouseId && { warehouseId }),
    ...(q && { q }),
    ...(page && { page }),
  };
}

/** Filters → `/stock-counts?…` (page 1 and empty values left out). */
export function listHref(filters: StockCountListFilters): string {
  return hrefWith(STOCK_COUNTS_HREF, {
    status: filters.status,
    warehouse: filters.warehouseId,
    q: filters.q,
    page: filters.page,
  });
}
