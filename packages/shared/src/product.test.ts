import { describe, expect, it } from 'vitest';

import { blockPrice, isLowStock } from './product';

describe('blockPrice', () => {
  it('OQ-15: per-piece price × units per block', () => {
    expect(blockPrice(12_000, 6)).toBe(72_000);
    expect(blockPrice(0, 24)).toBe(0);
  });

  it('rejects results outside the safe integer range', () => {
    expect(() => blockPrice(Number.MAX_SAFE_INTEGER, 2)).toThrow(RangeError);
    expect(() => blockPrice(-1, 2)).toThrow(RangeError);
  });
});

describe('isLowStock', () => {
  it('FR-1.3: below a positive minimum', () => {
    expect(isLowStock(5, 6)).toBe(true);
    expect(isLowStock(6, 6)).toBe(false);
    expect(isLowStock(0, 0)).toBe(false);
  });
});
