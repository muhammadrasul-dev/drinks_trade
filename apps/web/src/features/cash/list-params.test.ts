import { describe, expect, it } from 'vitest';

import { hasFilters, journalHref, parseJournalParams } from './list-params';

describe('cash journal params', () => {
  it('keeps valid filters and drops invalid ones', () => {
    expect(
      parseJournalParams({
        from: '2026-10-01',
        to: 'nope',
        cashbox: 'CARD',
        type: 'TRAVEL_EXPENSE',
        direction: 'SIDEWAYS',
        page: '2',
      }),
    ).toEqual({ from: '2026-10-01', cashbox: 'CARD', type: 'TRAVEL_EXPENSE', page: 2 });
    expect(
      parseJournalParams({ cashbox: 'SAFE', type: 'BRIBE', page: '0', from: '2026-02-30' }),
    ).toEqual({});
    expect(parseJournalParams({ direction: ['OUT', 'IN'] })).toEqual({ direction: 'OUT' });
  });

  it('round-trips through the URL', () => {
    const filters = {
      from: '2026-10-01',
      to: '2026-10-23',
      cashbox: 'CASH' as const,
      type: 'SALE_RECEIPT' as const,
      direction: 'IN' as const,
    };
    const href = journalHref({ ...filters, page: 3 });
    expect(href).toBe(
      '/cash?from=2026-10-01&to=2026-10-23&cashbox=CASH&type=SALE_RECEIPT&direction=IN&page=3',
    );
    expect(parseJournalParams(Object.fromEntries(new URL(href, 'http://x').searchParams))).toEqual({
      ...filters,
      page: 3,
    });
    expect(journalHref({ page: 1 })).toBe('/cash');
  });

  it('tells whether any filter is set', () => {
    expect(hasFilters({ page: 4 })).toBe(false);
    expect(hasFilters({ direction: 'OUT' })).toBe(true);
  });
});
