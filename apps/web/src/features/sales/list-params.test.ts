import { describe, expect, it } from 'vitest';

import { listHref, parseListParams } from './list-params';

describe('sale list params', () => {
  it('keeps valid filters and drops invalid ones', () => {
    expect(
      parseListParams({ status: 'DRAFT', from: '2026-10-01', to: 'nope', q: ' 45 ', page: '2' }),
    ).toEqual({ status: 'DRAFT', from: '2026-10-01', q: '45', page: 2 });
    expect(parseListParams({ status: 'OPEN', page: '0', from: '2026-02-30' })).toEqual({});
  });

  it('round-trips through the URL', () => {
    const filters = { status: 'POSTED' as const, from: '2026-10-01', to: '2026-10-23', q: '7' };
    const href = listHref({ ...filters, page: 3 });
    expect(href).toBe('/sales?status=POSTED&from=2026-10-01&to=2026-10-23&q=7&page=3');
    expect(parseListParams(Object.fromEntries(new URL(href, 'http://x').searchParams))).toEqual({
      ...filters,
      page: 3,
    });
    expect(listHref({ page: 1 })).toBe('/sales');
  });
});
