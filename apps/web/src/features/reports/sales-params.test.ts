import { describe, expect, it } from 'vitest';

import {
  currentMonth,
  parseSalesReportParams,
  SALES_REPORT_HREF,
  salesReportHref,
} from './sales-params';

const TODAY = '2026-10-23';

describe('sales report params', () => {
  it('defaults to the current month up to today', () => {
    expect(currentMonth(TODAY)).toEqual({ from: '2026-10-01', to: TODAY });
    expect(currentMonth('2026-01-01')).toEqual({ from: '2026-01-01', to: '2026-01-01' });
    expect(parseSalesReportParams({}, TODAY)).toEqual({ from: '2026-10-01', to: TODAY });
    expect(parseSalesReportParams({ from: 'x', to: '2026-02-30' }, TODAY)).toEqual({
      from: '2026-10-01',
      to: TODAY,
    });
  });

  it('keeps a valid range, one open end, and the first of repeated values', () => {
    expect(parseSalesReportParams({ from: '2026-09-01', to: '2026-09-30' }, TODAY)).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(parseSalesReportParams({ from: '2026-09-15' }, TODAY)).toEqual({ from: '2026-09-15' });
    expect(parseSalesReportParams({ to: '2026-09-15', from: 'nope' }, TODAY)).toEqual({
      to: '2026-09-15',
    });
    expect(parseSalesReportParams({ from: ['2026-09-02', '2026-09-03'] }, TODAY)).toEqual({
      from: '2026-09-02',
    });
  });

  it('swaps a reversed range instead of failing', () => {
    expect(parseSalesReportParams({ from: '2026-10-05', to: '2026-10-01' }, TODAY)).toEqual({
      from: '2026-10-01',
      to: '2026-10-05',
    });
  });

  it('round-trips through the href; the default period is the bare href', () => {
    const filters = { from: '2026-09-01', to: '2026-09-30' };
    const href = salesReportHref(filters, TODAY);
    expect(href).toBe(`${SALES_REPORT_HREF}?from=2026-09-01&to=2026-09-30`);
    const params = Object.fromEntries(new URL(href, 'http://x').searchParams);
    expect(parseSalesReportParams(params, TODAY)).toEqual(filters);

    expect(salesReportHref(currentMonth(TODAY), TODAY)).toBe(SALES_REPORT_HREF);
    expect(salesReportHref({ to: '2026-09-30' }, TODAY)).toBe(`${SALES_REPORT_HREF}?to=2026-09-30`);
    expect(salesReportHref({}, TODAY)).toBe(SALES_REPORT_HREF);
  });
});
