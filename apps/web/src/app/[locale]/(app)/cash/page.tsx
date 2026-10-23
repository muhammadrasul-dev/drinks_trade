import { cashQueries } from '@drinks/server';
import type { Locale } from '@drinks/shared';
import { Button } from '@drinks/ui/components/button';
import { PageHeader } from '@drinks/ui/components/page-header';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { MoneyText } from '@/components/money-text';
import { CashBalances } from '@/features/cash/components/cash-balances';
import { CashFilters } from '@/features/cash/components/cash-filters';
import { CashJournalTable } from '@/features/cash/components/cash-journal-table';
import { journalHref, parseJournalParams } from '@/features/cash/list-params';
import { Link } from '@/i18n/navigation';
import { getServiceContext, requireSection } from '@/lib/session';

// Cash (T-701, FR-6.1): both balances and the journal, OWNER only. The
// section guard answers STAFF with 403; the service refuses them as well.
export default async function CashPage({ params, searchParams }: PageProps<'/[locale]/cash'>) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const session = await requireSection(locale as Locale, 'cash');
  const ctx = await getServiceContext(session);
  const filters = parseJournalParams(await searchParams);
  const [balances, page] = await Promise.all([
    cashQueries.balances(ctx),
    cashQueries.journal(ctx, filters),
  ]);
  const t = await getTranslations('cash');

  const from = page.total === 0 ? 0 : (page.page - 1) * page.pageSize + 1;
  const to = Math.min(page.page * page.pageSize, page.total);

  return (
    <>
      {/* T-702 adds the cash actions (travel expense, other expense, transfer) as `actions`. */}
      <PageHeader title={t('title')} />
      <CashBalances balances={balances} />
      <section aria-labelledby="cash-journal" className="flex flex-col gap-4">
        <h2 id="cash-journal" className="text-lg font-semibold">
          {t('journal')}
        </h2>
        <CashFilters filters={filters} />
        <dl
          aria-label={t('totals.label')}
          className="flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-nums"
        >
          <div className="flex gap-2">
            <dt className="text-muted-foreground">{t('totals.in')}</dt>
            <dd className="font-medium text-emerald-700 dark:text-emerald-400">
              <MoneyText amount={page.totals.in} />
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">{t('totals.out')}</dt>
            <dd className="font-medium text-red-700 dark:text-red-400">
              <MoneyText amount={page.totals.out} />
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">{t('totals.count')}</dt>
            <dd className="font-medium">{page.total}</dd>
          </div>
        </dl>
        <CashJournalTable items={page.items} />
        {page.total > page.pageSize && (
          <nav
            aria-label={t('pagination.label')}
            className="flex items-center justify-end gap-2 text-sm"
          >
            <span className="text-muted-foreground tabular-nums">
              {t('pagination.range', { from, to, total: page.total })}
            </span>
            <PageLink
              href={journalHref({ ...filters, page: page.page - 1 })}
              enabled={page.page > 1}
              label={t('pagination.prev')}
            />
            <PageLink
              href={journalHref({ ...filters, page: page.page + 1 })}
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
