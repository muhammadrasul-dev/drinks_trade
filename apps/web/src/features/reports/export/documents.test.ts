import type { ReportDocument } from '@drinks/server';
import type { PnlReport, SalesReport, StockReport } from '@drinks/shared';
import { describe, expect, it } from 'vitest';

import { pnlReportDocument } from './pnl-document';
import { salesReportDocument } from './sales-document';
import { stockReportDocument } from './stock-document';
import { exportTranslator } from './translator';

const NOW = new Date('2026-10-23T09:05:00Z'); // 14:05 in Tashkent
const uz = exportTranslator('uz');
const ru = exportTranslator('ru');

const product = {
  id: 'p1',
  name: 'Coca-Cola 1,5 l',
  sku: 'CC-15',
  unitsPerBlock: 6,
  archived: false,
  category: { id: 'c1', name: 'Ichimliklar' },
  brand: { id: 'b1', name: 'Coca-Cola' },
};

const keys = (document: ReportDocument) => document.columns.map((column) => column.key);
const headers = (document: ReportDocument, format: 'pdf' | 'xlsx') =>
  document.columns
    .filter((column) => !column.only || column.only === format)
    .map((column) => column.header);
const COST_KEYS = ['avgCost', 'value', 'cost', 'grossProfit'];

/** Every non-empty cell value of the document (rows and totals). */
const cellValues = (document: ReportDocument) =>
  [...document.rows, ...(document.totals ? [document.totals] : [])].flatMap((row) =>
    Object.entries(row.cells)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key]) => key),
  );

describe('stockReportDocument (T-804)', () => {
  const ownerReport: StockReport = {
    items: [
      {
        product: { ...product, minStock: 24 },
        qty: 20,
        storeQty: 26,
        lowStock: false,
        locations: [
          {
            warehouse: { id: 'w1', name: 'Asosiy' },
            subWarehouse: { id: 's1', name: 'Zal' },
            qty: 20,
          },
        ],
        avgCost: '8333.3333',
        value: 166_667,
      },
      {
        product: { ...product, id: 'p2', name: 'Fanta', archived: true, minStock: 12 },
        qty: 0,
        storeQty: 0,
        lowStock: true,
        locations: [],
        avgCost: '0.0000',
        value: 0,
      },
    ],
    totals: { products: 2, value: 166_667 },
  };
  const staffReport: StockReport = {
    items: ownerReport.items.map(({ avgCost: _a, value: _v, ...row }) => row),
    totals: { products: 2 },
  };

  it('OWNER: cost columns, values and the SUM total', () => {
    const document = stockReportDocument({
      report: ownerReport,
      filters: {},
      names: {},
      t: uz,
      now: NOW,
    });
    expect(document.title).toBe('Mahsulotlar qoldigʻi');
    expect(document.meta).toEqual(['Tuzilgan vaqti: 23.10.2026 14:05']);
    expect(headers(document, 'xlsx')).toEqual([
      'Mahsulot',
      'Toifa',
      'Brend',
      'SKU',
      'Joylashuv (ombor / sub-ombor)',
      'Qoldiq',
      'Qoldiq, dona',
      'Minimal qoldiq, dona',
      'Kam qoldi',
      'Oʻrtacha tannarx (1 dona)',
      'Qiymati',
    ]);
    expect(headers(document, 'pdf')).toEqual([
      'Mahsulot',
      'Joylashuv (ombor / sub-ombor)',
      'Qoldiq',
      'Oʻrtacha tannarx (1 dona)',
      'Qiymati',
    ]);
    const [first, second] = document.rows;
    expect(first!.cells).toMatchObject({
      product: ['Coca-Cola 1,5 l', 'Ichimliklar · Coca-Cola · CC-15'],
      name: 'Coca-Cola 1,5 l',
      locations: ['Asosiy / Zal: 3 blok 2 dona'],
      qty: ['3 blok 2 dona', '= 20 dona', `Doʻkonda jami: 4 blok 2 dona`, ''],
      qtyText: '3 blok 2 dona',
      pieces: 20,
      minStock: 24,
      lowStock: '',
      avgCost: '8333.3333',
      value: 166_667,
    });
    expect(second!.cells).toMatchObject({
      name: 'Fanta (arxiv)',
      lowStock: 'Kam qoldi',
      locations: '—',
      // No "= 0 dona" without a block to add up.
      qty: ['0 dona', '', '', 'Kam qoldi'],
    });
    expect(document.columns.find((column) => column.key === 'value')?.sum).toBe(true);
    expect(document.totals?.cells).toMatchObject({
      name: 'Jami: 2 ta mahsulot',
      value: 166_667,
    });
    expect(document.currency).toBe('soʻm');
  });

  it('STAFF: no cost column and no cost value anywhere', () => {
    const document = stockReportDocument({
      report: staffReport,
      filters: {},
      names: {},
      t: uz,
      now: NOW,
    });
    for (const key of COST_KEYS) {
      expect(keys(document)).not.toContain(key);
      expect(cellValues(document)).not.toContain(key);
    }
    expect(JSON.stringify(document)).not.toContain('8333');
  });

  it('filter lines with names, the store total column under a location filter, Russian', () => {
    const document = stockReportDocument({
      report: staffReport,
      filters: { warehouseId: 'w1', subWarehouseId: 's1', archived: false, lowStock: true },
      names: { warehouse: 'Asosiy', subWarehouse: 'Zal' },
      t: ru,
      now: NOW,
    });
    expect(document.title).toBe('Остатки товаров');
    expect(document.meta).toEqual([
      'Склад: Asosiy',
      'Подсклад: Zal',
      'Статус товара: Только активные',
      'Заканчиваются',
      'Сформирован: 23.10.2026 14:05',
    ]);
    expect(keys(document)).toContain('storeQty');
    expect(headers(document, 'xlsx')).toContain('Остаток, шт.');
    expect(document.rows[0]!.cells.locations).toEqual([`Asosiy / Zal: 3 блок 2 шт.`]);
    expect(document.totals?.cells.name).toBe('Итого: 2 товара');
    expect(document.currency).toBe('сум');
  });
});

describe('salesReportDocument (T-804)', () => {
  const ownerReport: SalesReport = {
    items: [
      { product, qty: 14, revenue: 168_000, cost: 120_000, grossProfit: 48_000 },
      {
        product: { ...product, id: 'p2', name: 'Fanta', unitsPerBlock: 1 },
        qty: 3,
        revenue: 30_000,
        cost: 36_000,
        grossProfit: -6_000,
      },
    ],
    totals: { products: 2, sales: 4, revenue: 198_000, cost: 156_000, grossProfit: 42_000 },
  };
  const staffReport: SalesReport = {
    items: ownerReport.items.map(({ cost: _c, grossProfit: _g, ...row }) => row),
    totals: { products: 2, sales: 4, revenue: 198_000 },
  };
  const filters = { from: '2026-10-01', to: '2026-10-23' };

  it('OWNER: cost and gross profit (red when negative), summed', () => {
    const document = salesReportDocument({ report: ownerReport, filters, t: uz, now: NOW });
    expect(document.meta).toEqual([
      '01.10.2026 — 23.10.2026',
      'Savdolar: 4',
      'Tuzilgan vaqti: 23.10.2026 14:05',
    ]);
    expect(headers(document, 'pdf')).toEqual([
      'Mahsulot',
      'Sotildi',
      'Tushum',
      'Tannarx',
      'Yalpi foyda',
    ]);
    expect(headers(document, 'xlsx')).toEqual([
      'Mahsulot',
      'Toifa',
      'Brend',
      'SKU',
      'Sotildi',
      'Sotildi, dona',
      'Tushum',
      'Tannarx',
      'Yalpi foyda',
    ]);
    const profit = document.columns.find((column) => column.key === 'grossProfit')!;
    expect(profit).toMatchObject({ type: 'money', sum: true, negativeRed: true });
    expect(document.rows[0]!.cells).toMatchObject({
      qty: ['2 blok 2 dona', '= 14 dona'],
      pieces: 14,
      revenue: 168_000,
      cost: 120_000,
      grossProfit: 48_000,
    });
    // A one-piece block needs no "= N dona".
    expect(document.rows[1]!.cells.qty).toEqual(['3 blok', '']);
    expect(document.totals?.cells).toMatchObject({
      revenue: 198_000,
      cost: 156_000,
      grossProfit: 42_000,
    });
  });

  it('STAFF: no cost or profit column and no such value', () => {
    const document = salesReportDocument({ report: staffReport, filters, t: uz, now: NOW });
    for (const key of COST_KEYS) {
      expect(keys(document)).not.toContain(key);
      expect(cellValues(document)).not.toContain(key);
    }
    expect(headers(document, 'xlsx')).not.toContain('Tannarx');
    expect(headers(document, 'pdf')).not.toContain('Yalpi foyda');
    expect(JSON.stringify(document)).not.toMatch(/120000|156000|48000/);
  });

  it('Russian labels; an open-ended period', () => {
    const document = salesReportDocument({
      report: staffReport,
      filters: { from: '2026-10-01' },
      t: ru,
      now: NOW,
    });
    expect(document.title).toBe('Отчёт по продажам');
    expect(document.meta[0]).toBe('с 01.10.2026');
    expect(headers(document, 'xlsx')).toContain('Продано, шт.');
    expect(document.rows[0]!.cells.qtyText).toBe('2 блок 2 шт.');
  });
});

describe('pnlReportDocument (T-804)', () => {
  const report: PnlReport = {
    revenue: 100_000,
    cogs: 70_000,
    grossProfit: 30_000,
    travelExpense: 5_000,
    stockShortage: 0,
    stockSurplus: 1_500,
    netProfit: 26_500,
    counts: { sales: 3, travelExpenses: 1, stockCounts: 0 },
  };

  it('the BR-11 lines: expenses negative, profits red when negative, net profit as totals', () => {
    const document = pnlReportDocument({
      report,
      period: { kind: 'month', month: '2026-10' },
      t: uz,
      now: NOW,
    });
    expect(document.title).toBe('P&L (foyda va zarar)');
    expect(document.meta).toEqual([
      'Oktabr 2026',
      '01.10.2026 — 31.10.2026',
      'Tuzilgan vaqti: 23.10.2026 14:05',
    ]);
    expect(
      document.rows.map((row) => [row.cells.name, row.cells.amount, row.emphasis ?? '']),
    ).toEqual([
      ['Tushum', 100_000, ''],
      ['Sotilgan tovar tannarxi', -70_000, ''],
      ['Yalpi foyda', 30_000, 'subtotal'],
      ['Yoʻl kira', -5_000, ''],
      ['Kamomad', 0, ''],
      ['Ortiqcha', 1_500, ''],
    ]);
    expect(Object.is(document.rows[4]!.cells.amount, -0)).toBe(false);
    expect(document.rows[0]!.cells.label).toEqual(['Tushum', '3 ta savdo, nasiya ham']);
    expect(document.rows[0]!.cells.hint).toBe('3 ta savdo, nasiya ham');
    expect(document.rows[2]!.negativeRed).toBe(true);
    expect(document.rows[1]!.negativeRed).toBeUndefined();
    expect(document.totals).toMatchObject({
      cells: { name: 'Sof foyda', amount: 26_500 },
      negativeRed: true,
    });
    expect(document.note).toContain('Xarid');
  });

  it('one day: the label is the day itself; Russian', () => {
    const document = pnlReportDocument({
      report,
      period: { kind: 'day', day: '2026-10-05' },
      t: ru,
      now: NOW,
    });
    expect(document.meta).toEqual(['05.10.2026', 'Сформирован: 23.10.2026 14:05']);
    expect(document.rows[0]!.cells.hint).toBe('3 продажи, включая в долг');
    expect(document.totals?.cells.name).toBe('Чистая прибыль');
    expect(document.currency).toBe('сум');
  });
});
