import type { ReportColumn, ReportDocument, ReportRow } from '@drinks/server';
import { formatQty, type SalesReport } from '@drinks/shared';

import { pnlPeriodLabel } from '../components/pnl-period-label';
import type { SalesReportFilters } from '../sales-params';
import {
  type ExportTranslator,
  generatedAtLine,
  productLines,
  productName,
  qtyLabels,
} from './translator';

interface SalesDocumentInput {
  report: SalesReport;
  filters: SalesReportFilters;
  t: ExportTranslator;
  now: Date;
}

/**
 * Sales report (T-802) → export document. Cost and gross profit only when the
 * service sent them (`totals.cost`, OWNER) — the same rule as SalesReportTable.
 */
export function salesReportDocument({
  report,
  filters,
  t,
  now,
}: SalesDocumentInput): ReportDocument {
  const showCost = report.totals.cost !== undefined;
  const labels = qtyLabels(t);
  const { totals } = report;

  const columns: ReportColumn[] = [
    {
      key: 'product',
      header: t('salesReport.columns.product'),
      type: 'text',
      width: 34,
      only: 'pdf',
    },
    {
      key: 'name',
      header: t('salesReport.columns.product'),
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
    { key: 'qty', header: t('salesReport.columns.qty'), type: 'text', width: 18, only: 'pdf' },
    { key: 'qtyText', header: t('salesReport.columns.qty'), type: 'text', width: 16, only: 'xlsx' },
    {
      key: 'pieces',
      header: t('reports.export.columns.pieces', { column: t('salesReport.columns.qty') }),
      type: 'integer',
      width: 14,
      only: 'xlsx',
    },
    {
      key: 'revenue',
      header: t('salesReport.columns.revenue'),
      type: 'money',
      width: 18,
      sum: true,
    },
    ...(showCost
      ? ([
          {
            key: 'cost',
            header: t('salesReport.columns.cost'),
            type: 'money',
            width: 18,
            sum: true,
          },
          {
            key: 'grossProfit',
            header: t('salesReport.columns.grossProfit'),
            type: 'money',
            width: 18,
            sum: true,
            negativeRed: true,
          },
        ] as const)
      : []),
  ];

  const rows: ReportRow[] = report.items.map((item) => {
    const { product } = item;
    const qty = formatQty(item.qty, product.unitsPerBlock, labels);
    return {
      cells: {
        product: productLines(t, product),
        name: productName(t, product),
        category: product.category?.name,
        brand: product.brand?.name,
        sku: product.sku,
        // "= N dona" only when the blocks need adding up, like the screen.
        qty: [
          qty,
          product.unitsPerBlock > 1 && item.qty >= product.unitsPerBlock
            ? t('salesReport.pieces', { qty: item.qty })
            : '',
        ],
        qtyText: qty,
        pieces: item.qty,
        revenue: item.revenue,
        cost: item.cost,
        grossProfit: item.grossProfit,
      },
    };
  });

  const total = t('reports.export.totalProducts', { count: totals.products });
  return {
    title: t('salesReport.title'),
    meta: [
      pnlPeriodLabel(t, { kind: 'range', from: filters.from, to: filters.to }),
      `${t('salesReport.totals.sales')} ${totals.sales}`,
      generatedAtLine(t, now),
    ],
    columns,
    rows,
    totals: {
      cells: {
        product: total,
        name: total,
        revenue: totals.revenue,
        cost: totals.cost,
        grossProfit: totals.grossProfit,
      },
    },
    emptyMessage: t('salesReport.empty'),
    currency: t('common.som'),
    sheetName: t('salesReport.title'),
  };
}
