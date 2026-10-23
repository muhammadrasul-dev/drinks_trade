import type { OpenStockCount } from '@drinks/shared';
import { describe, expect, it } from 'vitest';

import { bannerCounts, parseOpenCounts } from './banner';
import { stockCountHref } from './list-params';

const A: OpenStockCount = {
  id: '0190a7d2-1c2b-7cde-8f00-00000000000a',
  number: 'I-000007',
  warehouseId: '0190a7d2-1c2b-7cde-8f00-0000000000a1',
  warehouseName: 'Asosiy',
};
const B: OpenStockCount = {
  id: '0190a7d2-1c2b-7cde-8f00-00000000000b',
  number: 'I-000009',
  warehouseId: '0190a7d2-1c2b-7cde-8f00-0000000000b1',
  warehouseName: 'Filial',
};

describe('stock count banner', () => {
  it('links to the count page', () => {
    expect(stockCountHref(A.id)).toBe(`/stock-counts/${A.id}`);
  });

  it('announces every open count on other pages, in the given order', () => {
    for (const path of ['/', '/sales', '/sales/new', '/stock-counts', `/sales/${A.id}`]) {
      expect(bannerCounts([A, B], path)).toEqual([A, B]);
    }
  });

  it('leaves out the count whose own form is open, with or without a trailing slash', () => {
    expect(bannerCounts([A, B], `/stock-counts/${A.id}`)).toEqual([B]);
    expect(bannerCounts([A, B], `/stock-counts/${B.id}/`)).toEqual([A]);
    expect(bannerCounts([A], `/stock-counts/${A.id}`)).toEqual([]);
  });

  it('has nothing to announce without open counts', () => {
    expect(bannerCounts([], '/')).toEqual([]);
  });

  it('accepts only a list of open counts from the API', () => {
    expect(parseOpenCounts([A, B])).toEqual([A, B]);
    expect(parseOpenCounts([])).toEqual([]);
    expect(parseOpenCounts(null)).toBeNull();
    expect(parseOpenCounts({ items: [A] })).toBeNull();
    expect(parseOpenCounts([A, null])).toBeNull();
    expect(parseOpenCounts([{ ...A, number: 7 }])).toBeNull();
    const { warehouseName: _, ...noName } = B;
    expect(parseOpenCounts([noName])).toBeNull();
  });
});
