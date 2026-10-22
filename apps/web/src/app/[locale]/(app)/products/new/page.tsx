import { brands, categories } from '@drinks/server';
import type { Locale } from '@drinks/shared';
import { PageHeader } from '@drinks/ui/components/page-header';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ProductForm } from '@/features/products/components/product-form';
import { getServiceContext, requireSection } from '@/lib/session';

// New product (T-303): OWNER and STAFF alike (product.write).
export default async function NewProductPage({ params }: PageProps<'/[locale]/products/new'>) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const session = await requireSection(locale as Locale, 'products');
  const ctx = await getServiceContext(session);
  const [categoryItems, brandItems] = await Promise.all([categories.list(ctx), brands.list(ctx)]);
  const t = await getTranslations('products');

  return (
    <>
      <PageHeader title={t('newTitle')} />
      <ProductForm categories={categoryItems} brands={brandItems} />
    </>
  );
}
