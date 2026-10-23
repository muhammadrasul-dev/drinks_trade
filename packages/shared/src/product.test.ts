import { describe, expect, it } from 'vitest';

import { blockPrice, compareStockShortage, isLowStock } from './product';

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

describe('compareStockShortage', () => {
  it('OQ-40: lowest share of the minimum first, out of stock leading; ties keep their order', () => {
    const rows = [
      { name: 'half', stockQty: 5, minStock: 10 },
      { name: 'almost', stockQty: 99, minStock: 100 },
      { name: 'empty', stockQty: 0, minStock: 3 },
      { name: 'tenth', stockQty: 2, minStock: 20 },
      { name: 'half too', stockQty: 1, minStock: 2 },
      { name: 'empty too', stockQty: 0, minStock: 50 },
    ];
    expect(rows.sort(compareStockShortage).map((row) => row.name)).toEqual([
      'empty',
      'empty too',
      'tenth',
      'half',
      'half too',
      'almost',
    ]);
  });
});
