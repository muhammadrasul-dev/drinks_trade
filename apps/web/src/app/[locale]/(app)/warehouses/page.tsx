import type { Locale } from '@drinks/shared';
import { setRequestLocale } from 'next-intl/server';

import { WarehousesPage } from '@/features/warehouses/components/warehouses-page';

export default async function Page({ params, searchParams }: PageProps<'/[locale]/warehouses'>) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const { archived } = await searchParams;
  return <WarehousesPage locale={locale as Locale} archived={archived === '1'} />;
}
