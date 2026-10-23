import { describe, expect, it } from 'vitest';

import { debtsHref, hasFilters, parseDebtParams } from './list-params';

describe('debt list params', () => {
  it('keeps valid filters and drops invalid ones', () => {
    expect(
      parseDebtParams({
        direction: 'PAYABLE',
        status: 'LOST',
        source: 'MANUAL',
        from: '2026-10-01',
        to: '2026-02-30',
        q: '  Aziz ',
        page: '2',
      }),
    ).toEqual({
      direction: 'PAYABLE',
      source: 'MANUAL',
      from: '2026-10-01',
      search: 'Aziz',
      page: 2,
    });
    expect(parseDebtParams({ direction: 'SIDEWAYS', q: '   ', page: '0' })).toEqual({});
    expect(parseDebtParams({ status: ['CLOSED', 'OPEN'] })).toEqual({ status: 'CLOSED' });
  });

  it('round-trips through the URL', () => {
    const filters = {
      direction: 'RECEIVABLE' as const,
      status: 'OPEN' as const,
      source: 'SALE' as const,
      from: '2026-10-01',
      to: '2026-10-23',
      search: 'Aziz aka',
    };
    const href = debtsHref({ ...filters, page: 3 });
    expect(href).toBe(
      '/debts?direction=RECEIVABLE&status=OPEN&source=SALE&from=2026-10-01&to=2026-10-23&q=Aziz+aka&page=3',
    );
    expect(parseDebtParams(Object.fromEntries(new URL(href, 'http://x').searchParams))).toEqual({
      ...filters,
      page: 3,
    });
    expect(debtsHref({ page: 1 })).toBe('/debts');
  });

  it('hasFilters ignores the page', () => {
    expect(hasFilters({ page: 2 })).toBe(false);
    expect(hasFilters({ search: 'a' })).toBe(true);
  });
});
