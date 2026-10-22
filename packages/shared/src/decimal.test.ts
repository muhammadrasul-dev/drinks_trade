import { describe, expect, it } from 'vitest';

import {
  assertInt,
  divRoundHalfUp,
  formatCost,
  groupDigits,
  parseCost,
  parseDecimal,
  toSafeNumber,
} from './decimal';

describe('decimal helpers', () => {
  it('parseDecimal keeps the scale of the input', () => {
    expect(parseDecimal('-12.50')).toEqual({ units: -1250n, scale: 2 });
    expect(parseDecimal('7')).toEqual({ units: 7n, scale: 0 });
    expect(() => parseDecimal('+1')).toThrow(RangeError);
  });

  it('parseCost scales to 4 digits and refuses more', () => {
    expect(parseCost('12.5')).toBe(125_000n);
    expect(parseCost('-0.0001')).toBe(-1n);
    expect(() => parseCost('0.00001')).toThrow(RangeError);
  });

  it('formatCost always prints 4 digits', () => {
    expect(formatCost(125_000n)).toBe('12.5000');
    expect(formatCost(1n)).toBe('0.0001');
    expect(formatCost(-125_000n)).toBe('-12.5000');
    expect(formatCost(0n)).toBe('0.0000');
  });

  it('divRoundHalfUp rounds half away from zero for every sign', () => {
    expect(divRoundHalfUp(5n, 2n)).toBe(3n);
    expect(divRoundHalfUp(-5n, 2n)).toBe(-3n);
    expect(divRoundHalfUp(5n, -2n)).toBe(-3n);
    expect(divRoundHalfUp(-5n, -2n)).toBe(3n);
    expect(divRoundHalfUp(4n, 3n)).toBe(1n);
    expect(divRoundHalfUp(5n, 3n)).toBe(2n);
    expect(() => divRoundHalfUp(1n, 0n)).toThrow(RangeError);
  });

  it('toSafeNumber and assertInt guard integers', () => {
    expect(toSafeNumber(42n, 'x')).toBe(42);
    expect(() => toSafeNumber(2n ** 53n, 'x')).toThrow(RangeError);
    expect(() => assertInt(-5, 'x')).not.toThrow();
    expect(() => assertInt(Number.POSITIVE_INFINITY, 'x')).toThrow(RangeError);
  });

  it('groupDigits handles number and bigint of any sign', () => {
    expect(groupDigits(123)).toBe('123');
    expect(groupDigits(1234)).toBe('1\u00a0234');
    expect(groupDigits(-1234n)).toBe('-1\u00a0234');
  });
});
