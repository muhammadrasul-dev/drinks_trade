import { describe, expect, it } from 'vitest';

import { countTotals } from './stock-count';

const cola = { productId: 'cola', avgCost: '5000.0000' };
const water = { productId: 'water', avgCost: '1333.3333' };

describe('countTotals (BR-8, §6.2 steps 5–6)', () => {
  it('nothing counted, or no difference → zero', () => {
    expect(countTotals([])).toEqual({ shortageAmount: 0, surplusAmount: 0 });
    expect(countTotals([{ ...cola, diffQty: 0 }])).toEqual({ shortageAmount: 0, surplusAmount: 0 });
  });

  it('shortage and surplus of different products go to their own side', () => {
    expect(
      countTotals([
        { ...cola, diffQty: -3 },
        { ...water, diffQty: 2 },
      ]),
    ).toEqual({ shortageAmount: 15_000, surplusAmount: 2667 });
  });

  it('a move between sub-warehouses (−2 here, +2 there) costs nothing', () => {
    expect(
      countTotals([
        { ...cola, diffQty: -2 },
        { ...cola, diffQty: 2 },
      ]),
    ).toEqual({ shortageAmount: 0, surplusAmount: 0 });
  });

  it('a product is priced on its warehouse total, rounded once', () => {
    // Per row: round(−1 × 1333.3333) × 3 = −3999; on the total: round(−3 × 1333.3333) = −4000.
    expect(
      countTotals([
        { ...water, diffQty: -1 },
        { ...water, diffQty: -1 },
        { ...water, diffQty: -1 },
      ]),
    ).toEqual({ shortageAmount: 4000, surplusAmount: 0 });
    expect(
      countTotals([
        { ...cola, diffQty: -5 },
        { ...cola, diffQty: 3 },
      ]),
    ).toEqual({ shortageAmount: 10_000, surplusAmount: 0 });
  });
});
