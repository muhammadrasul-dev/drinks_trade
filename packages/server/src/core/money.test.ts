import { describe, expect, it } from 'vitest';

import { decimalToString, moneyToBigInt, moneyToNumber } from './money';

describe('money converters (ADR-008)', () => {
  it('round-trips whole som between bigint and number', () => {
    expect(moneyToNumber(12_000n)).toBe(12_000);
    expect(moneyToBigInt(12_000)).toBe(12_000n);
    expect(moneyToNumber(BigInt(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('rejects values beyond the safe integer range', () => {
    expect(() => moneyToNumber(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow(RangeError);
    expect(() => moneyToBigInt(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });

  it('rejects fractional and non-finite money', () => {
    expect(() => moneyToBigInt(0.5)).toThrow(RangeError);
    expect(() => moneyToBigInt(Number.NaN)).toThrow(RangeError);
  });

  it('formats Decimal with 4 fractional digits', () => {
    // Structural stand-in: only toFixed is used, so no Prisma runtime is needed.
    const decimal = { toFixed: (digits: number) => (12.5).toFixed(digits) };
    expect(decimalToString(decimal as never)).toBe('12.5000');
  });
});
