import { reports } from '@drinks/server';
import type { Locale } from '@drinks/shared';
import { PageHeader } from '@drinks/ui/components/page-header';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { PnlPeriodFilter } from '@/features/reports/components/pnl-period-filter';
import { PnlPeriodDescription } from '@/features/reports/components/pnl-period-label';
import { PnlStatement } from '@/features/reports/components/pnl-statement';
import { ReportExportButtons } from '@/features/reports/components/report-export-buttons';
import { parsePnlParams, pnlPeriodRange, pnlPeriodSearch } from '@/features/reports/pnl-params';
import { getServiceContext, requireSection } from '@/lib/session';

// P&L (T-803, BR-11, business-logic §8): OWNER only — requireSection checks
// `report.pnl` and the service checks it again (STAFF → FORBIDDEN). Period in
// the URL (default — this month, OQ-36), rendered on the server.
export default async function ReportsPnlPage({
  params,
  searchParams,
}: PageProps<'/[locale]/reports/pnl'>) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const session = await requireSection(locale as Locale, 'pnlReport');
  const ctx = await getServiceContext(session);
  const period = parsePnlParams(await searchParams);

  const report = await reports.pnl(ctx, pnlPeriodRange(period));
  const t = await getTranslations('pnlReport');

  return (
    <>
      <PageHeader
        title={t('title')}
        description={<PnlPeriodDescription period={period} />}
        actions={<ReportExportButtons report="pnl" search={pnlPeriodSearch(period)} />}
      />
      <PnlPeriodFilter period={period} />
      <PnlStatement report={report} />
      <p className="max-w-2xl text-xs text-muted-foreground">{t('excluded')}</p>
    </>
  );
}
