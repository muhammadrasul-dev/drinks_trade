// Store-zone days (`YYYY-MM-DD`, OQ-07) → instants for queries and stored
// document dates. Asia/Tashkent is UTC+5 all year (no DST), so a fixed offset
// is exact; @drinks/shared/dates goes the other way (instant → day, display).
import type { Prisma } from '@drinks/db';

const STORE_UTC_OFFSET = '+05:00';
const DAY_MS = 86_400_000;

/** `day` at `time` (`HH:mm:ss`) in the store zone. */
export function storeDayAt(day: string, time = '00:00:00'): Date {
  return new Date(`${day}T${time}${STORE_UTC_OFFSET}`);
}

/**
 * Inclusive store-zone day range [from, to] → `{ gte, lt }` bounds for a
 * timestamp column; either end may be open, both open → undefined (no filter).
 */
export function storeDayRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from && { gte: storeDayAt(from) }),
    ...(to && { lt: new Date(storeDayAt(to).getTime() + DAY_MS) }),
  };
}
