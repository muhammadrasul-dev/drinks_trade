import { brands, categories, products } from '@drinks/server';
import type { CatalogItem, Locale } from '@drinks/shared';
import { Button } from '@drinks/ui/components/button';
import { PageHeader } from '@drinks/ui/components/page-header';
import { PlusIcon } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { CATALOG_HREF } from '@/features/catalog/components/catalog-page';
import { ProductFilters } from '@/features/products/components/product-filters';
import { ProductTable } from '@/features/products/components/product-table';
import { listHref, parseListParams, PRODUCTS_HREF } from '@/features/products/list-params';
import { Link } from '@/i18n/navigation';
import { getServiceContext, requireSection } from '@/lib/session';

/** Active and archived items, by name: filters may point at an archived category / brand. */
function allItems(active: CatalogItem[], archived: CatalogItem[]): CatalogItem[] {
  return [...active, ...archived].sort((a, b) => a.name.localeCompare(b.name));
}

// Product list (T-303): search and filters in the URL, rendered on the server.
export default async function ProductsPage({
  params,
  searchParams,
}: PageProps<'/[locale]/products'>) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const session = await requireSection(locale as Locale, 'products');
  const ctx = await getServiceContext(session);
  const filters = parseListParams(await searchParams);

  const [page, activeCategories, archivedCategories, activeBrands, archivedBrands] =
    await Promise.all([
      products.list(ctx, filters),
      categories.list(ctx),
      categories.list(ctx, { archived: true }),
      brands.list(ctx),
      brands.list(ctx, { archived: true }),
    ]);
  const t = await getTranslations();

  const from = page.total === 0 ? 0 : (page.page - 1) * page.pageSize + 1;
  const to = Math.min(page.page * page.pageSize, page.total);
  const hasPrev = page.page > 1;
  const hasNext = to < page.total;

  return (
    <>
      <PageHeader
        title={t('products.title')}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={CATALOG_HREF.category}>{t('catalog.category.title')}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={CATALOG_HREF.brand}>{t('catalog.brand.title')}</Link>
            </Button>
            <Button asChild>
              <Link href={`${PRODUCTS_HREF}/new`}>
                <PlusIcon />
                {t('products.add')}
              </Link>
            </Button>
          </>
        }
      />
      <ProductFilters
        filters={filters}
        categories={allItems(activeCategories, archivedCategories)}
        brands={allItems(activeBrands, archivedBrands)}
      />
      <ProductTable items={page.items} archived={Boolean(filters.archived)} />
      {page.total > page.pageSize && (
        <nav
          aria-label={t('products.pagination.label')}
          className="flex items-center justify-end gap-2 text-sm"
        >
          <span className="text-muted-foreground tabular-nums">
            {t('products.pagination.range', { from, to, total: page.total })}
          </span>
          <PageLink
            href={listHref({ ...filters, page: page.page - 1 })}
            enabled={hasPrev}
            label={t('products.pagination.prev')}
          />
          <PageLink
            href={listHref({ ...filters, page: page.page + 1 })}
            enabled={hasNext}
            label={t('products.pagination.next')}
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
