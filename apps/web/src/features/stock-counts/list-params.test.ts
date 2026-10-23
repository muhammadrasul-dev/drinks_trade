import { describe, expect, it } from 'vitest';

import { listHref, parseListParams } from './list-params';

const ID = '0190a7d2-1c2b-7cde-8f00-123456789abc';

describe('stock count list params', () => {
  it('parses valid filters and drops invalid ones', () => {
    expect(parseListParams({ status: 'DRAFT', warehouse: ID, q: ' 7 ', page: '2' })).toEqual({
      status: 'DRAFT',
      warehouseId: ID,
      q: '7',
      page: 2,
    });
    expect(parseListParams({ status: 'REVERSED', warehouse: 'x', page: '0' })).toEqual({});
  });

  it('builds the URL without page 1 and empty values', () => {
    expect(listHref({})).toBe('/stock-counts');
    expect(listHref({ status: 'CANCELLED', warehouseId: ID, page: 1 })).toBe(
      `/stock-counts?status=CANCELLED&warehouse=${ID}`,
    );
  });
});
