import { CashboxType, CashDirection, CashTxType } from '@drinks/shared';
import type { CashJournalQuery } from '@drinks/shared/schemas';
import { z } from 'zod';

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

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function pick<T>(schema: z.ZodType<T>, value: string | undefined): T | undefined {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

const isoDate = z.iso.date();
const cashbox = z.enum(CashboxType);
const type = z.enum(CashTxType);
const direction = z.enum(CashDirection);

/** URL search params → service query; invalid values are dropped, never an error page. */
export function parseJournalParams(params: SearchParams): CashJournalFilters & CashJournalQuery {
  const values = {
    from: pick(isoDate, first(params.from)),
    to: pick(isoDate, first(params.to)),
    cashbox: pick(cashbox, first(params.cashbox)),
    type: pick(type, first(params.type)),
    direction: pick(direction, first(params.direction)),
  };
  const page = Number(first(params.page));
  return {
    ...Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)),
    ...(Number.isSafeInteger(page) && page > 1 && { page }),
  };
}

/** Filters → `/cash?…` (page 1 and empty values left out). */
export function journalHref(filters: CashJournalFilters): string {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.cashbox) params.set('cashbox', filters.cashbox);
  if (filters.type) params.set('type', filters.type);
  if (filters.direction) params.set('direction', filters.direction);
  if (filters.page && filters.page > 1) params.set('page', String(filters.page));
  const query = params.toString();
  return query ? `${CASH_HREF}?${query}` : CASH_HREF;
}

/** True when any filter (not the page) is set. */
export function hasFilters(filters: CashJournalFilters): boolean {
  return Boolean(
    filters.from || filters.to || filters.cashbox || filters.type || filters.direction,
  );
}
