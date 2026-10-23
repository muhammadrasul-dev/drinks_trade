import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { sampleDocument } from '../../../../test/report-document.fixture';
import type { ReportDocument } from './report-document';
import { renderReportXlsx } from '.';
import { sheetNameOf, xlsxNumberFormat } from './xlsx';

async function read(document: ReportDocument): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(new Uint8Array(await renderReportXlsx(document)).buffer);
  expect(workbook.worksheets).toHaveLength(1);
  return workbook.worksheets[0]!;
}

/** Row values from column A, without exceljs' leading empty slot. */
function rowValues(sheet: ExcelJS.Worksheet, row: number): unknown[] {
  return (sheet.getRow(row).values as unknown[]).slice(1);
}

describe('renderReportXlsx (T-804)', () => {
  it('writes a title, meta lines, a frozen header row with only the xlsx columns', async () => {
    const sheet = await read(sampleDocument());
    expect(sheet.name).toBe('Savdo hisoboti');
    expect(sheet.getCell('A1').value).toBe('Savdo hisoboti');
    expect(sheet.getCell('A1').font.bold).toBe(true);
    expect(sheet.getCell('A2').value).toBe('01.10.2026 — 23.10.2026');
    expect(sheet.getCell('A3').value).toBe('Savdolar: 3');
    // Row 4 is blank, row 5 the header; the PDF-only product column is absent.
    expect(rowValues(sheet, 5)).toEqual([
      'Mahsulot',
      'Sotildi (dona)',
      'Oʻrtacha tannarx',
      'Tushum',
      'Yalpi foyda',
    ]);
    expect(sheet.getRow(5).font.bold).toBe(true);
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 5 });
    expect(sheet.getColumn(1).width).toBe(30);
  });

  it('writes numbers as numeric cells with so‘m and piece formats', async () => {
    const sheet = await read(sampleDocument());
    const row = sheet.getRow(6);
    expect(row.getCell(1).value).toBe('Coca-Cola 1,5 л');
    expect(row.getCell(2).value).toBe(1250);
    expect(row.getCell(2).numFmt).toBe('#,##0');
    expect(row.getCell(3).value).toBeCloseTo(8333.3333, 4);
    expect(row.getCell(3).numFmt).toBe('#,##0.00 "soʻm"');
    expect(row.getCell(4).value).toBe(12_500_000);
    expect(row.getCell(4).numFmt).toBe('#,##0 "soʻm"');
    expect(row.getCell(5).numFmt).toBe('#,##0 "soʻm";[Red]-#,##0 "soʻm"');
    expect(sheet.getRow(7).getCell(5).value).toBe(-6002);
    expect(sheet.getRow(7).getCell(1).value).toBe('Чой «Ахмад»');
  });

  it('totals: SUM() formulas with the server totals as results, bold, then the note', async () => {
    const sheet = await read(sampleDocument());
    const totals = sheet.getRow(8);
    expect(totals.getCell(1).value).toBe('Jami: 2 ta mahsulot');
    expect(totals.getCell(4).value).toEqual({ formula: 'SUM(D6:D7)', result: 12_530_000 });
    expect(totals.getCell(5).value).toEqual({ formula: 'SUM(E6:E7)', result: 2_077_332 });
    expect(totals.getCell(4).numFmt).toBe('#,##0 "soʻm"');
    expect(totals.font.bold).toBe(true);
    // Not summed columns stay empty.
    expect(totals.getCell(2).value).toBeNull();
    expect(sheet.getCell('A10').value).toBe('Storno qilingan hujjatlar oʻz sanasidan chiqadi.');
  });

  it('joins a multi-line text cell with new lines', async () => {
    const document = sampleDocument({
      columns: [{ key: 'product', header: 'Mahsulot', type: 'text', width: 30 }],
    });
    const sheet = await read(document);
    expect(sheet.getCell('A6').value).toBe('Coca-Cola 1,5 л\nIchimliklar · Coca-Cola · CC-15');
    expect(sheet.getCell('A6').alignment.wrapText).toBe(true);
  });

  it('an empty report: the empty message and plain totals (no formula over no rows)', async () => {
    const document = sampleDocument({
      rows: [],
      totals: { cells: { name: 'Jami: 0 ta mahsulot', qty: '', revenue: 0, grossProfit: 0 } },
    });
    const sheet = await read(document);
    expect(sheet.getCell('A6').value).toBe('Bu davrda bajarilgan savdo yoʻq.');
    expect(sheet.getRow(7).getCell(4).value).toBe(0);
    // An empty text is an empty cell, not "".
    expect(sheet.getRow(7).getCell(2).value).toBeNull();
    expect(sheet.autoFilter).toBeUndefined();
  });

  it('row emphasis and per-row red negatives (P&L profit lines)', async () => {
    const document = sampleDocument({
      columns: [
        { key: 'line', header: 'Koʻrsatkich', type: 'text', width: 30 },
        { key: 'amount', header: 'Summa', type: 'money', width: 18 },
      ],
      rows: [
        { cells: { line: 'Tushum', amount: 100 } },
        { cells: { line: 'Tannarx', amount: -150 } },
        { cells: { line: 'Yalpi foyda', amount: -50 }, emphasis: 'subtotal', negativeRed: true },
      ],
      totals: undefined,
      note: undefined,
    });
    const sheet = await read(document);
    expect(sheet.getRow(7).getCell(2).numFmt).toBe('#,##0 "soʻm"');
    expect(sheet.getRow(8).getCell(2).numFmt).toBe('#,##0 "soʻm";[Red]-#,##0 "soʻm"');
    expect(sheet.getRow(8).font.bold).toBe(true);
    expect(sheet.getRow(7).font?.bold).toBeFalsy();
  });

  it('number formats and sheet names', () => {
    expect(xlsxNumberFormat({ key: 'a', header: '', type: 'text', width: 1 }, 'сум')).toBe(
      undefined,
    );
    expect(xlsxNumberFormat({ key: 'a', header: '', type: 'money', width: 1 }, 'сум')).toBe(
      '#,##0 "сум"',
    );
    expect(sheetNameOf('P&L: 01/10/2026 [test]')).toBe('P&L  01 10 2026  test');
    expect(sheetNameOf('x'.repeat(40))).toHaveLength(31);
  });
});
