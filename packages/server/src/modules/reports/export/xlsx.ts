// Excel export (T-804, ADR-010): exceljs. Numbers are real numeric cells with
// a number format (whole som, pieces), never formatted text, so the sheet can
// be summed and sorted; the totals of summed columns are SUM() formulas with
// the server's total as the cached result.
import ExcelJS from 'exceljs';

import {
  columnsFor,
  type ReportCell,
  type ReportColumn,
  type ReportDocument,
  type ReportRow,
} from './report-document';

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFEDEDED' },
};
const RULE: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF9E9E9E' } };

/** `#,##0 "soʻm"`; the thousands separator follows the reader's Excel locale. */
function moneyFormat(currency: string, decimals: number, red: boolean): string {
  const unit = `"${currency.replaceAll('"', '')}"`;
  const number = decimals > 0 ? `#,##0.${'0'.repeat(decimals)}` : '#,##0';
  const positive = `${number} ${unit}`;
  return red ? `${positive};[Red]-${positive}` : positive;
}

/** The cell's number format, or undefined for text. */
export function xlsxNumberFormat(
  column: ReportColumn,
  currency: string,
  red = Boolean(column.negativeRed),
): string | undefined {
  switch (column.type) {
    case 'integer':
      return '#,##0';
    case 'money':
      return moneyFormat(currency, 0, red);
    case 'price':
      return moneyFormat(currency, 2, red);
    case 'text':
      return undefined;
  }
}

/** Excel rejects `[]:*?/\` and names over 31 characters. */
export function sheetNameOf(name: string): string {
  return (
    name
      .replace(/[[\]:*?/\\]/g, ' ')
      .trim()
      .slice(0, 31) || 'Report'
  );
}

function cellValue(column: ReportColumn, value: ReportCell): ExcelJS.CellValue {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) return value.join('\n');
  // A decimal cost string becomes a number; Excel shows it with 2 decimals.
  if (column.type === 'price' && typeof value === 'string') return Number(value);
  return value as string | number;
}

export async function renderXlsx(document: ReportDocument): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'drinks_trade';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetNameOf(document.sheetName), {
    pageSetup: {
      paperSize: 9, // A4
      orientation: document.orientation ?? 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  const columns = columnsFor(document, 'xlsx');
  sheet.columns = columns.map((column) => ({ key: column.key, width: column.width }));

  sheet.addRow([document.title]).font = { bold: true, size: 14 };
  for (const line of document.meta) sheet.addRow([line]).font = { color: { argb: 'FF616161' } };
  sheet.addRow([]);

  const header = sheet.addRow(columns.map((column) => column.header));
  header.font = { bold: true };
  header.alignment = { vertical: 'middle', wrapText: true };
  header.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.border = { bottom: RULE };
  });
  columns.forEach((column, index) => {
    if (column.type !== 'text') header.getCell(index + 1).alignment = { horizontal: 'right' };
  });
  const headerRow = header.number;
  sheet.views = [{ state: 'frozen', ySplit: headerRow }];
  if (document.rows.length > 0) {
    sheet.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: headerRow, column: columns.length },
    };
  }

  const writeRow = (row: ReportRow, values: (column: ReportColumn) => ExcelJS.CellValue) => {
    const added = sheet.addRow(columns.map(values));
    columns.forEach((column, index) => {
      const cell = added.getCell(index + 1);
      const format = xlsxNumberFormat(
        column,
        document.currency,
        Boolean(column.negativeRed || row.negativeRed),
      );
      if (format) cell.numFmt = format;
      cell.alignment = { vertical: 'top', wrapText: column.type === 'text' };
    });
    if (row.emphasis) added.font = { bold: true };
    if (row.emphasis === 'total') added.eachCell((cell) => (cell.border = { top: RULE }));
    return added;
  };

  const firstDataRow = headerRow + 1;
  for (const row of document.rows) {
    writeRow(row, (column) => cellValue(column, row.cells[column.key]));
  }
  const lastDataRow = sheet.lastRow!.number;

  if (document.rows.length === 0) {
    sheet.addRow([document.emptyMessage]).font = { italic: true, color: { argb: 'FF616161' } };
  }
  if (document.totals) {
    const totals = document.totals;
    const total = writeRow({ ...totals, emphasis: 'total' }, (column) => {
      const value = cellValue(column, totals.cells[column.key]);
      if (!column.sum || document.rows.length === 0 || typeof value !== 'number') return value;
      const letter = sheet.getColumn(column.key).letter;
      return {
        formula: `SUM(${letter}${firstDataRow}:${letter}${lastDataRow})`,
        result: value,
      };
    });
    total.eachCell((cell) => (cell.border = { top: RULE }));
  }
  if (document.note) {
    sheet.addRow([]);
    sheet.addRow([document.note]).font = { italic: true, color: { argb: 'FF616161' } };
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
