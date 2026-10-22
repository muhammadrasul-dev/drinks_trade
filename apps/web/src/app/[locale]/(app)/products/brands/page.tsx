import type { Locale } from '@drinks/shared';
import { setRequestLocale } from 'next-intl/server';

import { CatalogPage } from '@/features/catalog/components/catalog-page';

export default async function BrandsPage({
  params,
  searchParams,
}: PageProps<'/[locale]/products/brands'>) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const { archived } = await searchParams;
  return <CatalogPage kind="brand" locale={locale as Locale} archived={archived === '1'} />;
}
