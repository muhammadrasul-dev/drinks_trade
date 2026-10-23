import { stockCounts, warehouses } from '@drinks/server';
import { can, type Locale, storeToday } from '@drinks/shared';
import { Button } from '@drinks/ui/components/button';
import { PageHeader } from '@drinks/ui/components/page-header';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { StockCountFilters } from '@/features/stock-counts/components/stock-count-filters';
import { StockCountOpenDialog } from '@/features/stock-counts/components/stock-count-open-dialog';
import { StockCountTable } from '@/features/stock-counts/components/stock-count-table';
import { listHref, parseListParams } from '@/features/stock-counts/list-params';
import { Link } from '@/i18n/navigation';
import { getServiceContext, requireSection } from '@/lib/session';

// Stock count list (T-601): open counts first, filters in the URL, rendered on the server.
export default async function StockCountsPage({
  params,
  searchParams,
}: PageProps<'/[locale]/stock-counts'>) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const session = await requireSection(locale as Locale, 'stockCounts');
  const ctx = await getServiceContext(session);
  const filters = parseListParams(await searchParams);
  const [page, warehouseOptions, open] = await Promise.all([
    stockCounts.list(ctx, filters),
    warehouses.options(ctx),
    stockCounts.openCounts(ctx),
  ]);
  const t = await getTranslations('stockCounts');

  const from = page.total === 0 ? 0 : (page.page - 1) * page.pageSize + 1;
  const to = Math.min(page.page * page.pageSize, page.total);

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <StockCountOpenDialog
            warehouses={warehouseOptions}
            openByWarehouse={Object.fromEntries(open.map((c) => [c.warehouseId, c.number]))}
            today={storeToday()}
          />
        }
      />
      <StockCountFilters filters={filters} warehouses={warehouseOptions} />
      <StockCountTable
        items={page.items}
        showAmounts={can(session.user.role, 'stockCount.amount.read')}
      />
      {page.total > page.pageSize && (
        <nav
          aria-label={t('pagination.label')}
          className="flex items-center justify-end gap-2 text-sm"
        >
          <span className="text-muted-foreground tabular-nums">
            {t('pagination.range', { from, to, total: page.total })}
          </span>
          <PageLink
            href={listHref({ ...filters, page: page.page - 1 })}
            enabled={page.page > 1}
            label={t('pagination.prev')}
          />
          <PageLink
            href={listHref({ ...filters, page: page.page + 1 })}
            enabled={to < page.total}
            label={t('pagination.next')}
          />
        </nav>
      )}
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
