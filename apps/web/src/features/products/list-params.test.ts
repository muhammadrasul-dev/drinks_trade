import { describe, expect, it } from 'vitest';

import { listHref, parseListParams, productImageUrl } from './list-params';

const id = '0199f0d2-6b1c-7c3a-9b1e-2f4d5a6b7c8d';

describe('product list params', () => {
  it('reads valid filters and drops invalid ones', () => {
    expect(
      parseListParams({ q: '  cola ', category: id, brand: 'nope', archived: '1', page: '3' }),
    ).toEqual({ q: 'cola', categoryId: id, archived: true, page: 3 });
    expect(parseListParams({ q: ' ', archived: 'yes', page: '-1' })).toEqual({});
    expect(parseListParams({ q: ['a', 'b'], page: '1.5' })).toEqual({ q: 'a' });
  });

  it('round-trips through listHref', () => {
    const filters = { q: 'suv 1,5', categoryId: id, archived: true, page: 2 };
    const href = listHref(filters);
    expect(href).toBe(`/products?q=suv+1%2C5&category=${id}&archived=1&page=2`);
    const params = Object.fromEntries(new URL(href, 'http://x').searchParams);
    expect(parseListParams(params)).toEqual(filters);
    expect(listHref({ page: 1 })).toBe('/products');
  });

  it('image url carries the version', () => {
    expect(productImageUrl(id, 'abc')).toBe(`/api/products/${id}/image?v=abc`);
  });
});
