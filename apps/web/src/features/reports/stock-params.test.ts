import { describe, expect, it } from 'vitest';

import {
  hasStockReportFilters,
  parseStockReportParams,
  STOCK_REPORT_HREF,
  stockReportHref,
} from './stock-params';

const W = '0199f3a0-0000-7000-8000-000000000001';
const S = '0199f3a0-0000-7000-8000-000000000002';
const C = '0199f3a0-0000-7000-8000-000000000003';
const B = '0199f3a0-0000-7000-8000-000000000004';

describe('stock report params', () => {
  it('parses every filter', () => {
    expect(
      parseStockReportParams({
        warehouse: W,
        sub: S,
        category: C,
        brand: B,
        low: '1',
        archived: '0',
      }),
    ).toEqual({
      warehouseId: W,
      subWarehouseId: S,
      categoryId: C,
      brandId: B,
      lowStock: true,
      archived: false,
    });
    expect(parseStockReportParams({ archived: '1' })).toEqual({ archived: true });
  });

  it('drops invalid values', () => {
    expect(
      parseStockReportParams({ warehouse: 'x', sub: [S, W], low: 'yes', archived: '2' }),
    ).toEqual({ subWarehouseId: S });
    expect(parseStockReportParams({})).toEqual({});
  });

  it('round-trips through the href', () => {
    const filters = { warehouseId: W, categoryId: C, lowStock: true, archived: false };
    const href = stockReportHref(filters);
    expect(href).toBe(`${STOCK_REPORT_HREF}?warehouse=${W}&category=${C}&low=1&archived=0`);
    const params = Object.fromEntries(new URL(href, 'http://x').searchParams);
    expect(parseStockReportParams(params)).toEqual(filters);
    expect(stockReportHref({})).toBe(STOCK_REPORT_HREF);
  });

  it('knows when a filter is set', () => {
    expect(hasStockReportFilters({})).toBe(false);
    expect(hasStockReportFilters({ archived: false })).toBe(true);
  });
});
