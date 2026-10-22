import { products, warehouses } from '@drinks/server';
import { type Locale, storeToday } from '@drinks/shared';
import { PageHeader } from '@drinks/ui/components/page-header';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { PurchaseForm } from '@/features/purchases/components/purchase-form';
import { getServiceContext, requireSection } from '@/lib/session';

// New purchase draft (T-404).
export default async function NewPurchasePage({ params }: PageProps<'/[locale]/purchases/new'>) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const session = await requireSection(locale as Locale, 'purchases');
  const ctx = await getServiceContext(session);
  const [productOptions, warehouseOptions] = await Promise.all([
    products.options(ctx),
    warehouses.options(ctx),
  ]);
  const t = await getTranslations('purchases');

  return (
    <>
      <PageHeader title={t('newTitle')} />
      <PurchaseForm products={productOptions} warehouses={warehouseOptions} today={storeToday()} />
    </>
  );
}
