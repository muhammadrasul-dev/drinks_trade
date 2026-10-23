// A sample ReportDocument for the builder tests: Latin and Cyrillic text,
// a detail line, money, a fractional cost, a negative profit and totals.
import type { ReportDocument } from '../src/modules/reports/export/report-document';

export function sampleDocument(overrides: Partial<ReportDocument> = {}): ReportDocument {
  return {
    title: 'Savdo hisoboti',
    meta: ['01.10.2026 — 23.10.2026', 'Savdolar: 3'],
    columns: [
      { key: 'product', header: 'Mahsulot', type: 'text', width: 30, only: 'pdf' },
      { key: 'name', header: 'Mahsulot', type: 'text', width: 30, only: 'xlsx' },
      { key: 'qty', header: 'Sotildi (dona)', type: 'integer', width: 12 },
      { key: 'avgCost', header: 'Oʻrtacha tannarx', type: 'price', width: 14 },
      { key: 'revenue', header: 'Tushum', type: 'money', width: 16, sum: true },
      {
        key: 'grossProfit',
        header: 'Yalpi foyda',
        type: 'money',
        width: 16,
        sum: true,
        negativeRed: true,
      },
    ],
    rows: [
      {
        cells: {
          product: ['Coca-Cola 1,5 л', 'Ichimliklar · Coca-Cola · CC-15'],
          name: 'Coca-Cola 1,5 л',
          qty: 1250,
          avgCost: '8333.3333',
          revenue: 12_500_000,
          grossProfit: 2_083_334,
        },
      },
      {
        cells: {
          product: ['Чой «Ахмад»'],
          name: 'Чой «Ахмад»',
          qty: 3,
          avgCost: '12000.5000',
          revenue: 30_000,
          grossProfit: -6_002,
        },
      },
    ],
    totals: {
      cells: {
        product: 'Jami: 2 ta mahsulot',
        name: 'Jami: 2 ta mahsulot',
        revenue: 12_530_000,
        grossProfit: 2_077_332,
      },
    },
    emptyMessage: 'Bu davrda bajarilgan savdo yoʻq.',
    note: 'Storno qilingan hujjatlar oʻz sanasidan chiqadi.',
    currency: 'soʻm',
    sheetName: 'Savdo hisoboti',
    ...overrides,
  };
}
