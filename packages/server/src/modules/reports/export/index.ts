import type { ReportDocument } from './report-document';

export type {
  ReportCell,
  ReportColumn,
  ReportColumnType,
  ReportDocument,
  ReportRow,
} from './report-document';

// The renderers load @react-pdf/renderer and exceljs on first use, so pages
// that import @drinks/server do not load them.

/** ReportDocument → PDF (A4, Noto Sans for Cyrillic). */
export async function renderReportPdf(document: ReportDocument): Promise<Buffer> {
  const { renderPdf } = await import('./pdf');
  return renderPdf(document);
}

/** ReportDocument → .xlsx (numeric cells with number formats). */
export async function renderReportXlsx(document: ReportDocument): Promise<Buffer> {
  const { renderXlsx } = await import('./xlsx');
  return renderXlsx(document);
}
