import { StockCountStatus } from '@drinks/shared';
import type { StockCountListQuery } from '@drinks/shared/schemas';
import { z } from 'zod';

// /stock-counts filters live in the URL (?status=&warehouse=&q=&page=), like /purchases.

export const STOCK_COUNTS_HREF = '/stock-counts';

export interface StockCountListFilters {
  status?: StockCountStatus;
  warehouseId?: string;
  q?: string;
  page?: number;
}

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const status = z.enum(StockCountStatus);
const uuid = z.uuid();

/** URL search params → service query; invalid values are dropped, never an error page. */
export function parseListParams(params: SearchParams): StockCountListFilters & StockCountListQuery {
  const parsedStatus = status.safeParse(first(params.status));
  const warehouse = uuid.safeParse(first(params.warehouse));
  const q = first(params.q)?.trim().slice(0, 30);
  const page = Number(first(params.page));
  return {
    ...(parsedStatus.success && { status: parsedStatus.data }),
    ...(warehouse.success && { warehouseId: warehouse.data }),
    ...(q && { q }),
    ...(Number.isSafeInteger(page) && page > 1 && { page }),
  };
}

/** Filters → `/stock-counts?…` (page 1 and empty values left out). */
export function listHref(filters: StockCountListFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.warehouseId) params.set('warehouse', filters.warehouseId);
  if (filters.q) params.set('q', filters.q);
  if (filters.page && filters.page > 1) params.set('page', String(filters.page));
  const query = params.toString();
  return query ? `${STOCK_COUNTS_HREF}?${query}` : STOCK_COUNTS_HREF;
}
