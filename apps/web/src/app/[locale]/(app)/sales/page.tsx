import { sales } from '@drinks/server';
import type { Locale } from '@drinks/shared';
import { Button } from '@drinks/ui/components/button';
import { PageHeader } from '@drinks/ui/components/page-header';
import { PlusIcon } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { SaleFilters } from '@/features/sales/components/sale-filters';
import { SaleTable } from '@/features/sales/components/sale-table';
import { listHref, parseListParams, SALES_HREF } from '@/features/sales/list-params';
import { Link } from '@/i18n/navigation';
import { getServiceContext, requireSection } from '@/lib/session';

// Sale list (T-501): filters in the URL, rendered on the server.
export default async function SalesPage({ params, searchParams }: PageProps<'/[locale]/sales'>) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const session = await requireSection(locale as Locale, 'sales');
  const filters = parseListParams(await searchParams);
  const page = await sales.list(await getServiceContext(session), filters);
  const t = await getTranslations('sales');

  const from = page.total === 0 ? 0 : (page.page - 1) * page.pageSize + 1;
  const to = Math.min(page.page * page.pageSize, page.total);

  return (
    <>
      <PageHeader
        title={t('title')}
        actions={
          <Button asChild>
            <Link href={`${SALES_HREF}/new`}>
              <PlusIcon />
              {t('add')}
            </Link>
          </Button>
        }
      />
      <SaleFilters filters={filters} />
      <SaleTable items={page.items} />
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
