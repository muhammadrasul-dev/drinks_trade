import { reports } from '@drinks/server';
import type { Locale } from '@drinks/shared';
import { PageHeader } from '@drinks/ui/components/page-header';
import { cn } from '@drinks/ui/lib/utils';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';

import { MoneyText } from '@/components/money-text';
import { ReportExportButtons } from '@/features/reports/components/report-export-buttons';
import { SalesReportFiltersBar } from '@/features/reports/components/sales-report-filters';
import { SalesReportTable } from '@/features/reports/components/sales-report-table';
import { parseSalesReportParams } from '@/features/reports/sales-params';
import { getServiceContext, requireSection } from '@/lib/session';

// Sales report (T-802, SRS §7.2): period in the URL (default — this month,
// OQ-35), rendered on the server. Cost and profit come only when the service
// included them (OWNER, rule 6).
export default async function ReportsSalesPage({
  params,
  searchParams,
}: PageProps<'/[locale]/reports/sales'>) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const session = await requireSection(locale as Locale, 'salesReport');
  const ctx = await getServiceContext(session);
  const filters = parseSalesReportParams(await searchParams);

  const report = await reports.sales(ctx, filters);
  const t = await getTranslations('salesReport');
  const { totals } = report;

  return (
    <>
      <PageHeader
        title={t('title')}
        actions={
          <ReportExportButtons report="sales" search={{ from: filters.from, to: filters.to }} />
        }
      />
      <SalesReportFiltersBar filters={filters} />
      <dl
        aria-label={t('totals.label')}
        className="flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-nums"
      >
        <Total label={t('totals.sales')}>{totals.sales}</Total>
        <Total label={t('totals.products')}>{totals.products}</Total>
        <Total label={t('totals.revenue')}>
          <MoneyText amount={totals.revenue} />
        </Total>
        {totals.cost !== undefined && (
          <Total label={t('totals.cost')}>
            <MoneyText amount={totals.cost} />
          </Total>
        )}
        {totals.grossProfit !== undefined && (
          <Total label={t('totals.grossProfit')}>
            <MoneyText
              amount={totals.grossProfit}
              className={cn(totals.grossProfit < 0 && 'text-destructive')}
            />
          </Total>
        )}
      </dl>
      <SalesReportTable items={report.items} showCost={totals.cost !== undefined} />
    </>
  );
}

function Total({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
