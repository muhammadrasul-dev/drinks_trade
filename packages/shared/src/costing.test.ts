import { describe, expect, it } from 'vitest';

import { avgOnPurchaseReversal, avgOnReceipt, costAmount, COST_SCALE, unitCostOf } from './costing';

describe('costAmount (§1.2)', () => {
  it('is roundHalfUp(qty × unitCost) in whole som', () => {
    expect(costAmount(20, '6000.0000')).toBe(120_000);
    expect(costAmount(7, '11666.6667')).toBe(81_667);
    expect(costAmount(3, '2.5')).toBe(8);
    expect(costAmount(1, '0.4999')).toBe(0);
    expect(costAmount(0, '6000.0000')).toBe(0);
  });

  it('keeps the sign of a negative qty (stock count shortage)', () => {
    expect(costAmount(-3, '2.5000')).toBe(-8);
    expect(costAmount(-20, '6000')).toBe(-120_000);
  });

  it('rejects bad qty, bad cost strings and unsafe results', () => {
    expect(() => costAmount(1.5, '1.0000')).toThrow(RangeError);
    expect(() => costAmount(1, '1.00001')).toThrow(RangeError);
    expect(() => costAmount(1, 'abc')).toThrow(RangeError);
    expect(() => costAmount(Number.MAX_SAFE_INTEGER, '2.0000')).toThrow(RangeError);
  });
});

describe('unitCostOf (§5.1)', () => {
  it('is lineTotal / qty rounded half up to 4 digits', () => {
    expect(COST_SCALE).toBe(4);
    expect(unitCostOf(70_000, 6)).toBe('11666.6667');
    expect(unitCostOf(84_000, 12)).toBe('7000.0000');
    expect(unitCostOf(1, 32)).toBe('0.0313');
    expect(unitCostOf(0, 5)).toBe('0.0000');
  });

  it('rejects zero qty and negative totals', () => {
    expect(() => unitCostOf(100, 0)).toThrow(RangeError);
    expect(() => unitCostOf(-100, 1)).toThrow(RangeError);
  });
});

describe('avgOnReceipt (BR-6, §1.3)', () => {
  it('BR-6: 10 × 5 000 + 10 × 7 000 purchase → 6 000 (OQ-09 example)', () => {
    expect(avgOnReceipt({ totalQty: 10, avgCost: '5000.0000', inQty: 10, inCost: 70_000 })).toBe(
      '6000.0000',
    );
  });

  it('BR-6: Q = 0 → inCost / q', () => {
    expect(avgOnReceipt({ totalQty: 0, avgCost: '0.0000', inQty: 6, inCost: 70_000 })).toBe(
      '11666.6667',
    );
    // A stale avg on an empty stock does not leak into the new one.
    expect(avgOnReceipt({ totalQty: 0, avgCost: '9999.0000', inQty: 2, inCost: 10_000 })).toBe(
      '5000.0000',
    );
  });

  it('BR-6: sale reversal brings goods back at the sale cost', () => {
    expect(avgOnReceipt({ totalQty: 5, avgCost: '6000.0000', inQty: 10, inCost: 60_000 })).toBe(
      '6000.0000',
    );
    expect(avgOnReceipt({ totalQty: 3, avgCost: '100.0000', inQty: 1, inCost: 200 })).toBe(
      '125.0000',
    );
  });

  it('rounds the 5th digit half up', () => {
    expect(avgOnReceipt({ totalQty: 0, avgCost: '0', inQty: 32, inCost: 1 })).toBe('0.0313');
    expect(avgOnReceipt({ totalQty: 0, avgCost: '0', inQty: 3, inCost: 1 })).toBe('0.3333');
    expect(avgOnReceipt({ totalQty: 0, avgCost: '0', inQty: 3, inCost: 2 })).toBe('0.6667');
  });

  it('accepts a free receipt (inCost = 0)', () => {
    expect(avgOnReceipt({ totalQty: 10, avgCost: '6000.0000', inQty: 10, inCost: 0 })).toBe(
      '3000.0000',
    );
  });

  it('rejects invalid input', () => {
    const ok = { totalQty: 10, avgCost: '6000.0000', inQty: 10, inCost: 70_000 };
    expect(() => avgOnReceipt({ ...ok, totalQty: -1 })).toThrow(RangeError);
    expect(() => avgOnReceipt({ ...ok, inQty: 0 })).toThrow(RangeError);
    expect(() => avgOnReceipt({ ...ok, inCost: -1 })).toThrow(RangeError);
    expect(() => avgOnReceipt({ ...ok, inCost: 0.5 })).toThrow(RangeError);
    expect(() => avgOnReceipt({ ...ok, avgCost: '-1.0000' })).toThrow(RangeError);
    expect(() => avgOnReceipt({ ...ok, avgCost: '1.00001' })).toThrow(RangeError);
  });
});

describe('avgOnPurchaseReversal (BR-3, BR-6, §5.3, OQ-09)', () => {
  it('BR-6: undoes the purchase when nothing else happened', () => {
    expect(
      avgOnPurchaseReversal({ totalQty: 20, avgCost: '6000.0000', outQty: 10, outCost: 70_000 }),
    ).toBe('5000.0000');
  });

  it('Q − q = 0 → 0', () => {
    expect(
      avgOnPurchaseReversal({ totalQty: 10, avgCost: '7000.0000', outQty: 10, outCost: 70_000 }),
    ).toBe('0.0000');
  });

  it('OQ-09: a negative result is floored at 0', () => {
    expect(
      avgOnPurchaseReversal({ totalQty: 20, avgCost: '1000.0000', outQty: 10, outCost: 70_000 }),
    ).toBe('0.0000');
    expect(
      avgOnPurchaseReversal({ totalQty: 20, avgCost: '3500.0000', outQty: 10, outCost: 70_000 }),
    ).toBe('0.0000');
  });

  it('rounds the 5th digit half up', () => {
    expect(avgOnPurchaseReversal({ totalQty: 3, avgCost: '0.0001', outQty: 1, outCost: 0 })).toBe(
      '0.0002',
    );
    expect(
      avgOnPurchaseReversal({ totalQty: 4, avgCost: '1000.0000', outQty: 1, outCost: 999 }),
    ).toBe('1000.3333');
  });

  it('BR-3: q > Q is a programming error (the stock check must block it)', () => {
    expect(() =>
      avgOnPurchaseReversal({ totalQty: 5, avgCost: '6000.0000', outQty: 10, outCost: 70_000 }),
    ).toThrow(RangeError);
  });

  it('rejects invalid input', () => {
    const ok = { totalQty: 20, avgCost: '6000.0000', outQty: 10, outCost: 70_000 };
    expect(() => avgOnPurchaseReversal({ ...ok, totalQty: -1 })).toThrow(RangeError);
    expect(() => avgOnPurchaseReversal({ ...ok, outQty: 0 })).toThrow(RangeError);
    expect(() => avgOnPurchaseReversal({ ...ok, outCost: -1 })).toThrow(RangeError);
    expect(() => avgOnPurchaseReversal({ ...ok, avgCost: '-0.0001' })).toThrow(RangeError);
  });
});
