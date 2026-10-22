// Exact fixed-point helpers behind money.ts and costing.ts (not exported from the
// package). Cost values travel as decimal strings (ADR-008) and are computed as
// bigint scaled by 10^COST_SCALE, so no float ever touches a cost.

/** Fractional digits of every cost value (`Decimal(20,4)` in the DB). */
export const COST_SCALE = 4;

/** 10^COST_SCALE as bigint: `1.0000` in scaled form. */
export const COST_ONE = 10n ** BigInt(COST_SCALE);

const DECIMAL_RE = /^(-)?(\d+)(?:\.(\d+))?$/;

/** A parsed decimal: `units / 10^scale`. */
export interface ParsedDecimal {
  units: bigint;
  scale: number;
}

/** "-12.50" → { units: -1250n, scale: 2 }. Throws on anything but a plain decimal. */
export function parseDecimal(value: string): ParsedDecimal {
  const match = DECIMAL_RE.exec(value);
  if (!match) throw new RangeError(`"${value}" is not a decimal number`);
  const [, sign, int = '', frac = ''] = match;
  const units = BigInt(int + frac);
  return { units: sign ? -units : units, scale: frac.length };
}

/** Parses a cost string (at most COST_SCALE fractional digits) to scaled units. */
export function parseCost(value: string): bigint {
  const { units, scale } = parseDecimal(value);
  if (scale > COST_SCALE) {
    throw new RangeError(`Cost "${value}" has more than ${COST_SCALE} fractional digits`);
  }
  return units * 10n ** BigInt(COST_SCALE - scale);
}

/** Scaled units → fixed COST_SCALE-digit string (12_5000n → "12.5000"). */
export function formatCost(units: bigint): string {
  const sign = units < 0n ? '-' : '';
  const abs = units < 0n ? -units : units;
  const int = abs / COST_ONE;
  const frac = (abs % COST_ONE).toString().padStart(COST_SCALE, '0');
  return `${sign}${int}.${frac}`;
}

/**
 * Integer division rounded half up — half away from zero, like Postgres NUMERIC
 * and Prisma Decimal's default ROUND_HALF_UP (2.5 → 3, −2.5 → −3).
 */
export function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError('Division by zero');
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = (n * 2n + d) / (d * 2n);
  return negative ? -quotient : quotient;
}

/** bigint → number, refusing anything outside the safe integer range. */
export function toSafeNumber(value: bigint, what: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`${what} ${value} is outside the safe integer range`);
  }
  return result;
}

/** Guards an integer input (pieces, whole som). */
export function assertInt(value: number, what: string, min = Number.MIN_SAFE_INTEGER): void {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new RangeError(`${what} must be a safe integer ≥ ${min}, got ${value}`);
  }
}

/** Groups digits by thousands with a no-break space: 1250000n → "1 250 000". */
export function groupDigits(value: number | bigint): string {
  const digits = (value < 0 ? -BigInt(value) : BigInt(value)).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+$)/g, '\u00a0');
  return value < 0 ? `-${grouped}` : grouped;
}
