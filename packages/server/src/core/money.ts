// Converters at the service boundary (ADR-008): money is BIGINT whole som in
// the DB and a safe-integer `number` in services/DTOs; cost is NUMERIC(20,4)
// in the DB (Prisma Decimal) and a string outside the server.
import type { Prisma } from '@drinks/db';

/** Fractional digits of every cost column (`Decimal(20,4)`). */
export const COST_SCALE = 4;

/** DB money (bigint) → number; throws instead of silently losing precision. */
export function moneyToNumber(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`Money value ${value} is outside the safe integer range`);
  }
  return result;
}

/** Service money (number) → bigint for Prisma writes. Rejects fractions and NaN. */
export function moneyToBigInt(value: number): bigint {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Money value ${value} must be a safe integer (whole som)`);
  }
  return BigInt(value);
}

/**
 * Prisma Decimal → fixed 4-digit string ("12.5" → "12.5000"). Strings are
 * what DTOs carry; Prisma accepts the same strings back as Decimal input.
 */
export function decimalToString(value: Prisma.Decimal): string {
  return value.toFixed(COST_SCALE);
}
