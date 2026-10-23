import type { ReportColumn, ReportDocument, ReportRow } from '@drinks/server';
import { formatQty, type StockReport } from '@drinks/shared';

import type { StockReportFilters } from '../stock-params';
import {
  type ExportTranslator,
  generatedAtLine,
  productLines,
  productName,
  qtyLabels,
} from './translator';

/** Names of the filtered warehouse, sub-warehouse, category and brand (when found). */
export interface StockFilterNames {
  warehouse?: string;
  subWarehouse?: string;
  category?: string;
  brand?: string;
}

interface StockDocumentInput {
  report: StockReport;
  filters: StockReportFilters;
  names: StockFilterNames;
  t: ExportTranslator;
  now: Date;
}

/** The filters as "Ombor: Asosiy" lines; none — no lines. */
function filterLines({ filters, names, t }: StockDocumentInput): string[] {
  const line = (label: string, value: string | undefined) => (value ? [`${label}: ${value}`] : []);
  const archived =
    filters.archived === undefined
      ? undefined
      : t(
          filters.archived
            ? 'stockReport.filters.archivedOnly'
            : 'stockReport.filters.archivedActive',
        );
  return [
    ...line(t('stockReport.filters.warehouse'), names.warehouse),
    ...line(t('stockReport.filters.subWarehouse'), names.subWarehouse),
    ...line(t('stockReport.filters.category'), names.category),
    ...line(t('stockReport.filters.brand'), names.brand),
    ...line(t('stockReport.filters.archived'), archived),
    ...(filters.lowStock ? [t('stockReport.filters.lowStock')] : []),
  ];
}

/**
 * Stock report (T-801) → export document. Cost columns only when the service
 * sent them (`totals.value`, OWNER) — the same rule as StockReportTable.
 */
export function stockReportDocument(input: StockDocumentInput): ReportDocument {
  const { report, filters, t, now } = input;
  const showCost = report.totals.value !== undefined;
  // The store-wide total differs from the row only under a location filter.
  const showStoreQty = Boolean(filters.warehouseId || filters.subWarehouseId);
  const labels = qtyLabels(t);
  const pieces = (column: string) => t('reports.export.columns.pieces', { column });

  const columns: ReportColumn[] = [
    {
      key: 'product',
      header: t('stockReport.columns.product'),
      type: 'text',
      width: 30,
      only: 'pdf',
    },
    {
      key: 'name',
      header: t('stockReport.columns.product'),
      type: 'text',
      width: 34,
      only: 'xlsx',
    },
    {
      key: 'category',
      header: t('reports.export.columns.category'),
      type: 'text',
      width: 16,
      only: 'xlsx',
    },
    {
      key: 'brand',
      header: t('reports.export.columns.brand'),
      type: 'text',
      width: 16,
      only: 'xlsx',
    },
    { key: 'sku', header: t('reports.export.columns.sku'), type: 'text', width: 14, only: 'xlsx' },
    { key: 'locations', header: t('reports.export.columns.locations'), type: 'text', width: 30 },
    { key: 'qty', header: t('stockReport.columns.qty'), type: 'text', width: 18, only: 'pdf' },
    { key: 'qtyText', header: t('stockReport.columns.qty'), type: 'text', width: 16, only: 'xlsx' },
    {
      key: 'pieces',
      header: pieces(t('stockReport.columns.qty')),
      type: 'integer',
      width: 14,
      only: 'xlsx',
    },
    ...(showStoreQty
      ? [
          {
            key: 'storeQty',
            header: t('reports.export.columns.storeQty'),
            type: 'integer',
            width: 16,
            only: 'xlsx',
          } as const,
        ]
      : []),
    {
      key: 'minStock',
      header: t('reports.export.columns.minStock'),
      type: 'integer',
      width: 14,
      only: 'xlsx',
    },
    { key: 'lowStock', header: t('stockReport.lowStock'), type: 'text', width: 12, only: 'xlsx' },
    ...(showCost
      ? ([
          { key: 'avgCost', header: t('stockReport.columns.avgCost'), type: 'price', width: 16 },
          {
            key: 'value',
            header: t('stockReport.columns.value'),
            type: 'money',
            width: 18,
            sum: true,
          },
        ] as const)
      : []),
  ];

  const rows: ReportRow[] = report.items.map((item) => {
    const { product } = item;
    const qty = formatQty(item.qty, product.unitsPerBlock, labels);
    const lowStock = item.lowStock ? t('stockReport.lowStock') : '';
    return {
      cells: {
        product: productLines(t, product),
        name: productName(t, product),
        category: product.category?.name,
        brand: product.brand?.name,
        sku: product.sku,
        // No stock (low-stock filter): a dash, as on the screen.
        locations: item.locations.length
          ? item.locations.map(
              (location) =>
                `${location.warehouse.name} / ${location.subWarehouse.name}: ${formatQty(location.qty, product.unitsPerBlock, labels)}`,
            )
          : '—',
        // PDF: blocks + pieces, "= N dona" when there are blocks, the store total
        // and the low-stock mark, like the screen.
        qty: [
          qty,
          product.unitsPerBlock > 1 && item.qty >= product.unitsPerBlock
            ? t('stockReport.pieces', { qty: item.qty })
            : '',
          item.storeQty !== item.qty
            ? t('stockReport.storeQty', {
                qty: formatQty(item.storeQty, product.unitsPerBlock, labels),
              })
            : '',
          lowStock,
        ],
        qtyText: qty,
        pieces: item.qty,
        storeQty: item.storeQty,
        minStock: product.minStock,
        lowStock,
        avgCost: item.avgCost,
        value: item.value,
      },
    };
  });
  const total = t('reports.export.totalProducts', { count: report.totals.products });
  return {
    title: t('stockReport.title'),
    meta: [...filterLines(input), generatedAtLine(t, now)],
    columns,
    rows,
    totals: { cells: { product: total, name: total, value: report.totals.value } },
    emptyMessage: t('stockReport.empty'),
    currency: t('common.som'),
    sheetName: t('stockReport.title'),
  };
}
