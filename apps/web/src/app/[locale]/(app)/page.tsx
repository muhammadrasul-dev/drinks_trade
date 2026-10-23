import { dashboard } from '@drinks/server';
import type { Locale } from '@drinks/shared';
import { PageHeader } from '@drinks/ui/components/page-header';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import {
  DraftsCard,
  LowStockCard,
  OpenStockCountsCard,
} from '@/features/dashboard/components/dashboard-cards';
import { getServiceContext, requireSection } from '@/lib/session';

// Home page (T-902, FR-1.3): low-stock products, open stock counts and
// unposted drafts, each linking to its filtered list. The service leaves out
// a block the role may not open; there are no amounts for anyone.
export default async function DashboardPage({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const session = await requireSection(locale as Locale, 'dashboard');
  const summary = await dashboard.summary(await getServiceContext(session));
  const t = await getTranslations();
  const { user } = session;
  const hasDrafts = summary.draftSales !== undefined || summary.draftPurchases !== undefined;

  return (
    <>
      <PageHeader
        title={t('nav.sections.dashboard')}
        description={t('home.greeting', {
          name: user.fullName,
          role: t(`enums.UserRole.${user.role}`),
        })}
      />
      <div className="grid items-start gap-4 lg:grid-cols-3">
        {summary.lowStock && <LowStockCard lowStock={summary.lowStock} className="lg:col-span-2" />}
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-1">
          {summary.openStockCounts && <OpenStockCountsCard counts={summary.openStockCounts} />}
          {hasDrafts && (
            <DraftsCard sales={summary.draftSales} purchases={summary.draftPurchases} />
          )}
        </div>
      </div>
    </>
  );
}
