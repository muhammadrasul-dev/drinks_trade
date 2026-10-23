// Helpers shared by the integration tests.
import { addStoreDays, storeToday } from '@drinks/shared';

/** `YYYY-MM-DD` `days` days from today in the store zone (negative: the past). */
export function day(days: number): string {
  return addStoreDays(storeToday(), days);
}
