import { z } from 'zod';

// Filters live in the URL. Reading them from Next.js `searchParams`: a
// repeated key gives an array, and a hand-edited value may be anything, so
// the readers return undefined instead of throwing (never an error page).
// `hrefWith` writes them back.

export type SearchParams = Record<string, string | string[] | undefined>;

/** The first value of a search param. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const uuid = z.uuid();
const isoDate = z.iso.date();

/** A UUID param, or undefined. */
export function uuidParam(value: string | string[] | undefined): string | undefined {
  const raw = firstParam(value);
  return raw && uuid.safeParse(raw).success ? raw : undefined;
}

/** A real `YYYY-MM-DD` day param (no 30 February), or undefined. */
export function dateParam(value: string | string[] | undefined): string | undefined {
  const raw = firstParam(value);
  return raw && isoDate.safeParse(raw).success ? raw : undefined;
}

/** A value `schema` accepts (its parsed output), or undefined. */
export function schemaParam<T extends z.ZodType>(
  schema: T,
  value: string | string[] | undefined,
): z.output<T> | undefined {
  const raw = firstParam(value);
  if (!raw) return undefined;
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/** Free text, trimmed and cut to `max` characters; empty → undefined. */
export function textParam(value: string | string[] | undefined, max: number): string | undefined {
  return firstParam(value)?.trim().slice(0, max) || undefined;
}

/** A page number above 1, or undefined (page 1 is the default). */
export function pageParam(value: string | string[] | undefined): number | undefined {
  const page = Number(firstParam(value));
  return Number.isSafeInteger(page) && page > 1 ? page : undefined;
}

/**
 * `base?…` from `params`, in their order. Left out: undefined, empty and
 * false values, and numbers below 2 (page 1 is the default); true → "1".
 */
export function hrefWith(
  base: string,
  params: Record<string, string | number | boolean | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '' || value === false) continue;
    if (typeof value === 'number' && value < 2) continue;
    search.set(key, value === true ? '1' : String(value));
  }
  const query = search.toString();
  return query ? `${base}?${query}` : base;
}
