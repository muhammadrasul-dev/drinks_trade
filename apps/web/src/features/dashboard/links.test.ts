import { describe, expect, it } from 'vitest';

import { DASHBOARD_LINKS } from './links';

describe('dashboard links', () => {
  it('lead to the lists filtered to what each block counts', () => {
    expect(DASHBOARD_LINKS).toEqual({
      lowStock: '/reports/stock?low=1&archived=0',
      openStockCounts: '/stock-counts?status=DRAFT',
      draftSales: '/sales?status=DRAFT',
      draftPurchases: '/purchases?status=DRAFT',
    });
  });
});
