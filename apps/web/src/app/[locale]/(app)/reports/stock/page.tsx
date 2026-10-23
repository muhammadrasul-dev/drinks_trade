import { brands, categories, reports, warehouses } from '@drinks/server';
import type { CatalogItem, Locale } from '@drinks/shared';
import { PageHeader } from '@drinks/ui/components/page-header';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { MoneyText } from '@/components/money-text';
import { StockReportFiltersBar } from '@/features/reports/components/stock-report-filters';
import { StockReportTable } from '@/features/reports/components/stock-report-table';
import { parseStockReportParams } from '@/features/reports/stock-params';
import { getServiceContext, requireSection } from '@/lib/session';

/** Active and archived items, by name: filters may point at an archived category / brand. */
function allItems(active: CatalogItem[], archived: CatalogItem[]): CatalogItem[] {
  return [...active, ...archived].sort((a, b) => a.name.localeCompare(b.name));
}

// Stock report (T-801, SRS §7.1): filters in the URL, rendered on the server.
// Cost columns come only when the service included them (OWNER, rule 6).
export default async function ReportsStockPage({
  params,
  searchParams,
}: PageProps<'/[locale]/reports/stock'>) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const session = await requireSection(locale as Locale, 'stockReport');
  const ctx = await getServiceContext(session);
  const filters = parseStockReportParams(await searchParams);

  const [
    report,
    warehouseOptions,
    activeCategories,
    archivedCategories,
    activeBrands,
    archivedBrands,
  ] = await Promise.all([
    reports.stock(ctx, filters),
    warehouses.options(ctx),
    categories.list(ctx),
    categories.list(ctx, { archived: true }),
    brands.list(ctx),
    brands.list(ctx, { archived: true }),
  ]);
  const t = await getTranslations('stockReport');
  const showCost = report.totals.value !== undefined;

  return (
    <>
      <PageHeader title={t('title')} />
      <StockReportFiltersBar
        filters={filters}
        warehouses={warehouseOptions}
        categories={allItems(activeCategories, archivedCategories)}
        brands={allItems(activeBrands, archivedBrands)}
      />
      <dl
        aria-label={t('totals.label')}
        className="flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-nums"
      >
        <div className="flex gap-2">
          <dt className="text-muted-foreground">{t('totals.products')}</dt>
          <dd className="font-medium">{report.totals.products}</dd>
        </div>
        {report.totals.value !== undefined && (
          <div className="flex gap-2">
            <dt className="text-muted-foreground">{t('totals.value')}</dt>
            <dd className="font-medium">
              <MoneyText amount={report.totals.value} />
            </dd>
          </div>
        )}
      </dl>
      <StockReportTable items={report.items} showCost={showCost} />
    </>
  );
}
