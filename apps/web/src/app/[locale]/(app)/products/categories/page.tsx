import type { Locale } from '@drinks/shared';
import { setRequestLocale } from 'next-intl/server';

import { CatalogPage } from '@/features/catalog/components/catalog-page';

export default async function CategoriesPage({
  params,
  searchParams,
}: PageProps<'/[locale]/products/categories'>) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const { archived } = await searchParams;
  return <CatalogPage kind="category" locale={locale as Locale} archived={archived === '1'} />;
}
