import { debtQueries } from '@drinks/server';
import { type Locale, storeToday } from '@drinks/shared';
import { Button } from '@drinks/ui/components/button';
import { PageHeader } from '@drinks/ui/components/page-header';
import { HandCoinsIcon, WalletIcon } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { DebtFilters } from '@/features/debts/components/debt-filters';
import { DebtOpenDialog } from '@/features/debts/components/debt-open-dialog';
import { DebtTable } from '@/features/debts/components/debt-table';
import { DebtTotals } from '@/features/debts/components/debt-totals';
import { debtsHref, parseDebtParams } from '@/features/debts/list-params';
import { Link } from '@/i18n/navigation';
import { getServiceContext, requireSection } from '@/lib/session';

// Debts (T-704, FR-7.1–7.2): open balances, the list with repayments, give /
// take and repay, OWNER only. The section guard answers STAFF with 403; the
// services refuse them as well.
export default async function DebtsPage({ params, searchParams }: PageProps<'/[locale]/debts'>) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const session = await requireSection(locale as Locale, 'debts');
  const ctx = await getServiceContext(session);
  const filters = parseDebtParams(await searchParams);
  const [totals, page] = await Promise.all([
    debtQueries.totals(ctx),
    debtQueries.list(ctx, filters),
  ]);
  const t = await getTranslations('debts');
  const today = storeToday();

  const from = page.total === 0 ? 0 : (page.page - 1) * page.pageSize + 1;
  const to = Math.min(page.page * page.pageSize, page.total);

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <>
            <DebtOpenDialog
              direction="RECEIVABLE"
              today={today}
              trigger={
                <Button>
                  <HandCoinsIcon />
                  {t('give.button')}
                </Button>
              }
            />
            <DebtOpenDialog
              direction="PAYABLE"
              today={today}
              trigger={
                <Button variant="outline">
                  <WalletIcon />
                  {t('take.button')}
                </Button>
              }
            />
          </>
        }
      />
      <DebtTotals totals={totals} />
      <section aria-labelledby="debts-list" className="flex flex-col gap-4">
        <h2 id="debts-list" className="text-lg font-semibold">
          {t('list')}
        </h2>
        <DebtFilters filters={filters} />
        <DebtTable items={page.items} today={today} />
        {page.total > page.pageSize && (
          <nav
            aria-label={t('pagination.label')}
            className="flex items-center justify-end gap-2 text-sm"
          >
            <span className="text-muted-foreground tabular-nums">
              {t('pagination.range', { from, to, total: page.total })}
            </span>
            <PageLink
              href={debtsHref({ ...filters, page: page.page - 1 })}
              enabled={page.page > 1}
              label={t('pagination.prev')}
            />
            <PageLink
              href={debtsHref({ ...filters, page: page.page + 1 })}
              enabled={to < page.total}
              label={t('pagination.next')}
            />
          </nav>
        )}
      </section>
    </>
  );
}

function PageLink({ href, enabled, label }: { href: string; enabled: boolean; label: string }) {
  if (!enabled) {
    return (
      <Button variant="outline" size="sm" disabled>
        {label}
      </Button>
    );
  }
  return (
    <Button asChild variant="outline" size="sm">
      <Link href={href}>{label}</Link>
    </Button>
  );
}
