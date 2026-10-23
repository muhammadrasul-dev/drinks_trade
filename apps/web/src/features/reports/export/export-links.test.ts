import { describe, expect, it } from 'vitest';

import {
  contentDisposition,
  isExportFormat,
  isReportExport,
  periodSlug,
  reportExportHref,
} from './export-links';

describe('report export links (T-804)', () => {
  it('carries the page filters, the format and the language', () => {
    expect(reportExportHref('sales', 'xlsx', 'ru', { from: '2026-10-01', to: '2026-10-23' })).toBe(
      '/api/reports/sales/export?format=xlsx&locale=ru&from=2026-10-01&to=2026-10-23',
    );
    expect(
      reportExportHref('stock', 'pdf', 'uz', { warehouse: undefined, low: true, archived: '0' }),
    ).toBe('/api/reports/stock/export?format=pdf&locale=uz&low=1&archived=0');
  });

  it('knows its reports and formats', () => {
    expect(isReportExport('pnl')).toBe(true);
    expect(isReportExport('cash')).toBe(false);
    expect(isExportFormat('xlsx')).toBe(true);
    expect(isExportFormat('csv')).toBe(false);
    expect(isExportFormat(null)).toBe(false);
  });

  it('file names: the period, a translated name and an ASCII fallback', () => {
    expect(periodSlug('2026-10-01', '2026-10-23')).toBe('2026-10-01_2026-10-23');
    expect(periodSlug('2026-10-05', '2026-10-05')).toBe('2026-10-05');
    expect(periodSlug('2026-10-01', undefined)).toBe('2026-10-01_');
    expect(periodSlug(undefined, '2026-10-23')).toBe('_2026-10-23');
    expect(contentDisposition('sales', 'продажи', '2026-10', 'xlsx')).toBe(
      `attachment; filename="sales_2026-10.xlsx"; filename*=UTF-8''${encodeURIComponent('продажи_2026-10.xlsx')}`,
    );
  });
});
