import { existsSync } from 'node:fs';

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';

import { sampleDocument } from '../../../../test/report-document.fixture';
import { renderReportPdf } from '.';
import { pdfCellText, pdfFontFiles } from './pdf';
import type { ReportColumn, ReportDocument } from './report-document';

/** Text of every page, items joined by spaces (pdf.js splits runs freely). */
async function pdfText(document: ReportDocument): Promise<{ pages: number; text: string[] }> {
  const data = new Uint8Array(await renderReportPdf(document));
  const pdf = await getDocument({ data, useSystemFonts: false }).promise;
  const text: string[] = [];
  for (let page = 1; page <= pdf.numPages; page++) {
    const content = await (await pdf.getPage(page)).getTextContent();
    text.push(
      content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' '),
    );
  }
  return { pages: pdf.numPages, text };
}

const column = (type: ReportColumn['type']): ReportColumn => ({
  key: 'a',
  header: '',
  type,
  width: 1,
});

describe('renderReportPdf (T-804)', () => {
  it('embeds the repo font files', () => {
    const files = pdfFontFiles();
    expect(existsSync(files.regular)).toBe(true);
    expect(existsSync(files.bold)).toBe(true);
  });

  it('is a PDF whose text has the Latin and Cyrillic labels and formatted amounts', async () => {
    const buffer = await renderReportPdf(sampleDocument());
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buffer.subarray(-6).toString('latin1')).toContain('%%EOF');

    const { pages, text } = await pdfText(sampleDocument());
    expect(pages).toBe(1);
    const page = text[0]!;
    for (const label of [
      'Savdo hisoboti',
      '01.10.2026 — 23.10.2026',
      'Mahsulot',
      'Oʻrtacha tannarx',
      'Coca-Cola 1,5 л',
      'Ichimliklar · Coca-Cola · CC-15',
      'Чой «Ахмад»',
      'Jami: 2 ta mahsulot',
      'Storno qilingan hujjatlar oʻz sanasidan chiqadi.',
      '1 / 1',
    ]) {
      expect(page).toContain(label);
    }
    // Amounts as on the screen (no-break spaces read back as spaces).
    const plain = page.replace(/\u00a0/g, ' ');
    expect(plain).toContain('12 500 000 soʻm');
    expect(plain).toContain('−6 002 soʻm');
    expect(plain).toContain('8 333 soʻm');
    expect(plain).toContain('1 250');
    // The xlsx-only column header is not rendered twice.
    expect(page.match(/Mahsulot/g)).toHaveLength(1);
  });

  it('runs onto more pages with the header repeated', async () => {
    const rows = Array.from({ length: 120 }, (_, index) => ({
      cells: { product: [`Mahsulot ${index + 1}`, 'Toifa'], qty: index, revenue: 1000 },
    }));
    const { pages, text } = await pdfText(sampleDocument({ rows }));
    expect(pages).toBeGreaterThan(1);
    expect(text[1]).toContain('Tushum');
    expect(text[pages - 1]).toContain(`${pages} / ${pages}`);
    expect(text.join(' ')).toContain('Mahsulot 120');
  });

  it('shows the empty message when there are no rows', async () => {
    const { text } = await pdfText(sampleDocument({ rows: [], totals: undefined }));
    expect(text[0]).toContain('Bu davrda bajarilgan savdo yoʻq.');
  });

  it('cell text by column type', () => {
    expect(pdfCellText(column('money'), 1_250_000, 'сум')).toEqual([
      '1\u00a0250\u00a0000\u00a0сум',
    ]);
    expect(pdfCellText(column('money'), -5, 'сум')).toEqual(['−5\u00a0сум']);
    expect(pdfCellText(column('price'), '2.5000', 'soʻm')).toEqual(['3\u00a0soʻm']);
    expect(pdfCellText(column('integer'), 12_000, 'soʻm')).toEqual(['12\u00a0000']);
    expect(pdfCellText(column('text'), ['a', '', 'b'], 'soʻm')).toEqual(['a', 'b']);
    expect(pdfCellText(column('money'), undefined, 'soʻm')).toEqual([]);
  });
});
