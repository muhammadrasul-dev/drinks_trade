import type { Locale } from '@drinks/shared';

import { hrefWith } from '@/lib/search-params';

// Report exports (T-804, architecture §4.3):
//   GET /api/reports/{stock|sales|pnl}/export?format=pdf|xlsx&locale=uz|ru&<page filters>
// The filters are the page's own URL params, so the route parses them with the
// page's parser and the service validates them again.

export const REPORT_EXPORTS = ['stock', 'sales', 'pnl'] as const;
export type ReportExport = (typeof REPORT_EXPORTS)[number];

export const EXPORT_FORMATS = ['pdf', 'xlsx'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_CONTENT_TYPES: Record<ExportFormat, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export function isReportExport(value: string): value is ReportExport {
  return (REPORT_EXPORTS as readonly string[]).includes(value);
}

export function isExportFormat(value: string | null): value is ExportFormat {
  return (EXPORT_FORMATS as readonly (string | null)[]).includes(value);
}

/** The export link of a report page: its filters plus the format and the page's language. */
export function reportExportHref(
  report: ReportExport,
  format: ExportFormat,
  locale: Locale,
  search: Record<string, string | boolean | undefined>,
): string {
  return hrefWith(`/api/reports/${report}/export`, { format, locale, ...search });
}

/** The period part of a file name: one day / month / year, or `from_to` (an open end empty). */
export function periodSlug(from: string | undefined, to: string | undefined): string {
  return from && from === to ? from : `${from ?? ''}_${to ?? ''}`;
}

/**
 * `Content-Disposition` for the download: the translated name (`savdo_…`,
 * `продажи_…`) per RFC 6266 / 5987, an ASCII name (`sales_…`) for old clients.
 */
export function contentDisposition(
  report: ReportExport,
  translatedName: string,
  period: string,
  format: ExportFormat,
): string {
  const ascii = `${report}_${period}.${format}`;
  const utf8 = `${translatedName}_${period}.${format}`;
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(utf8)}`;
}
