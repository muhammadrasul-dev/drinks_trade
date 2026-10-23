import { z } from 'zod';

// Reading filters from Next.js `searchParams` (filters live in the URL): a
// repeated key gives an array, and a hand-edited value may be anything, so
// these return undefined instead of throwing.

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
