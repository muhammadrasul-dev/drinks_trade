import type { ReportDocument, ReportRow } from '@drinks/server';
import type { PnlReport } from '@drinks/shared';

import { pnlPeriodDays, pnlPeriodLabel } from '../components/pnl-period-label';
import type { PnlPeriod } from '../pnl-params';
import { type ExportTranslator, generatedAtLine } from './translator';

interface PnlDocumentInput {
  report: PnlReport;
  period: PnlPeriod;
  t: ExportTranslator;
  now: Date;
}

/** An expense line is written with its minus sign (−0 is not a number Excel needs). */
const minus = (amount: number) => (amount === 0 ? 0 : -amount);

/**
 * P&L (T-803, BR-11) → export document: the statement's lines as on the
 * screen, expenses negative, profits red when below zero. OWNER only — the
 * route and the service both refuse STAFF.
 */
export function pnlReportDocument({ report, period, t, now }: PnlDocumentInput): ReportDocument {
  const line = (
    key:
      | 'revenue'
      | 'cogs'
      | 'grossProfit'
      | 'travelExpense'
      | 'stockShortage'
      | 'stockSurplus'
      | 'netProfit',
    amount: number,
    hint = '',
  ) => ({
    label: [t(`pnlReport.lines.${key}`), hint],
    name: t(`pnlReport.lines.${key}`),
    hint,
    amount,
  });

  const rows: ReportRow[] = [
    {
      cells: line(
        'revenue',
        report.revenue,
        t('pnlReport.hints.sales', { count: report.counts.sales }),
      ),
    },
    { cells: line('cogs', minus(report.cogs)) },
    { cells: line('grossProfit', report.grossProfit), emphasis: 'subtotal', negativeRed: true },
    {
      cells: line(
        'travelExpense',
        minus(report.travelExpense),
        t('pnlReport.hints.travelExpenses', { count: report.counts.travelExpenses }),
      ),
    },
    {
      cells: line(
        'stockShortage',
        minus(report.stockShortage),
        t('pnlReport.hints.stockCounts', { count: report.counts.stockCounts }),
      ),
    },
    { cells: line('stockSurplus', report.stockSurplus) },
  ];

  const label = pnlPeriodLabel(t, period);
  const days = pnlPeriodLabel(t, pnlPeriodDays(period));
  return {
    title: t('pnlReport.title'),
    meta: [label, ...(days === label ? [] : [days]), generatedAtLine(t, now)],
    columns: [
      {
        key: 'label',
        header: t('reports.export.columns.line'),
        type: 'text',
        width: 40,
        only: 'pdf',
      },
      {
        key: 'name',
        header: t('reports.export.columns.line'),
        type: 'text',
        width: 34,
        only: 'xlsx',
      },
      {
        key: 'hint',
        header: t('reports.export.columns.hint'),
        type: 'text',
        width: 40,
        only: 'xlsx',
      },
      { key: 'amount', header: t('reports.export.columns.amount'), type: 'money', width: 20 },
    ],
    rows,
    totals: { cells: line('netProfit', report.netProfit), negativeRed: true },
    emptyMessage: '',
    note: t('pnlReport.excluded'),
    currency: t('common.som'),
    sheetName: 'P&L',
  };
}
