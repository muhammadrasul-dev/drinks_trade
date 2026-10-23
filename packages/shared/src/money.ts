// Money (ADR-008): whole som — bigint in the DB, safe-integer number in services
// and DTOs. Source of truth: .claude/docs/business-logic.md §1.2.
import { divRoundHalfUp, groupDigits, parseDecimal, toSafeNumber } from './decimal';

/** Thousands grouped with a no-break space: 1250000 → "1 250 000" (counts in exports). */
export { groupDigits };

/**
 * Whole som → display text, thousands grouped with a no-break space:
 * `formatSom(1250000)` → "1 250 000 soʻm". The UI passes the translated unit.
 */
export function formatSom(amount: number | bigint, unit = 'soʻm'): string {
  if (typeof amount === 'number' && !Number.isSafeInteger(amount)) {
    throw new RangeError(`Money value ${amount} must be a safe integer (whole som)`);
  }
  return `${groupDigits(amount)}\u00a0${unit}`;
}

/**
 * Decimal string → whole som, half away from zero (ROUND HALF UP as in Postgres
 * and Prisma Decimal): "2.5" → 3, "-2.5" → -3, "2.4999" → 2. Takes a string so
 * the value is never a float; throws if the result is not a safe integer.
 */
export function roundHalfUp(value: string): number {
  const { units, scale } = parseDecimal(value);
  return toSafeNumber(divRoundHalfUp(units, 10n ** BigInt(scale)), 'Money value');
}
