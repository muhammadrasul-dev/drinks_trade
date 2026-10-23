// Helpers shared by the integration tests.
import { storeToday } from '@drinks/shared';

/** `YYYY-MM-DD` `days` days from today in the store zone (negative: the past). */
export function day(days: number): string {
  const [y, m, d] = storeToday().split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}
