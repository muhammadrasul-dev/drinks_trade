import { describe, expect, it } from 'vitest';

import { lineStock, stockKeyOf } from './sale';

const a = { subWarehouseId: 'sub-a', productId: 'p1' };
const b = { subWarehouseId: 'sub-b', productId: 'p1' };

describe('lineStock', () => {
  const stock = new Map([
    [stockKeyOf(a), 10],
    [stockKeyOf(b), 3],
  ]);
  const availableOf = (key: typeof a) => stock.get(stockKeyOf(key)) ?? 0;

  it('a line within the stock is not short; exactly all of it is fine', () => {
    expect(lineStock([{ ...a, qty: 10 }], availableOf)).toEqual([
      { available: 10, required: 10, short: false },
    ]);
  });

  it('FR-3.3: lines of one pair add up — both are flagged when the total exceeds the stock', () => {
    expect(
      lineStock(
        [
          { ...a, qty: 6 },
          { ...b, qty: 2 },
          { ...a, qty: 5 },
        ],
        availableOf,
      ),
    ).toEqual([
      { available: 10, required: 11, short: true },
      { available: 3, required: 2, short: false },
      { available: 10, required: 11, short: true },
    ]);
  });

  it('a pair without a balance row has 0 available', () => {
    const none = { subWarehouseId: 'sub-a', productId: 'p2' };
    expect(lineStock([{ ...none, qty: 1 }], availableOf)).toEqual([
      { available: 0, required: 1, short: true },
    ]);
  });
});
