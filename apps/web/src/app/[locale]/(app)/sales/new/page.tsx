import { sales, warehouses } from '@drinks/server';
import { type Locale, storeToday } from '@drinks/shared';
import { PageHeader } from '@drinks/ui/components/page-header';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { SaleForm } from '@/features/sales/components/sale-form';
import { getServiceContext, requireSection } from '@/lib/session';

// New sale draft (T-501).
export default async function NewSalePage({ params }: PageProps<'/[locale]/sales/new'>) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const session = await requireSection(locale as Locale, 'sales');
  const ctx = await getServiceContext(session);
  const [productOptions, warehouseOptions] = await Promise.all([
    sales.productOptions(ctx),
    warehouses.options(ctx),
  ]);
  const t = await getTranslations('sales');

  return (
    <>
      <PageHeader title={t('newTitle')} />
      <SaleForm products={productOptions} warehouses={warehouseOptions} today={storeToday()} />
    </>
  );
}
