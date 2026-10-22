import { brands, categories, products } from '@drinks/server';
import { ErrorCode, isDomainError, type Locale, type Product } from '@drinks/shared';
import { PageHeader } from '@drinks/ui/components/page-header';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { z } from 'zod';

import { ProductArchiveButton } from '@/features/products/components/product-archive-button';
import { ProductForm } from '@/features/products/components/product-form';
import { getServiceContext, requireSection } from '@/lib/session';

// Edit product (T-303). Archived products can be edited and restored here too.
export default async function EditProductPage({ params }: PageProps<'/[locale]/products/[id]'>) {
  const { locale, id } = await params;
  setRequestLocale(locale as Locale);
  const session = await requireSection(locale as Locale, 'products');
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await getServiceContext(session);

  let product: Product;
  try {
    product = await products.get(ctx, { id });
  } catch (error) {
    if (isDomainError(error) && error.code === ErrorCode.NOT_FOUND) notFound();
    throw error;
  }
  const [categoryItems, brandItems] = await Promise.all([categories.list(ctx), brands.list(ctx)]);
  const t = await getTranslations('products');

  return (
    <>
      <PageHeader
        title={t('editTitle')}
        description={product.archived ? t('archivedBanner') : undefined}
        actions={<ProductArchiveButton product={product} />}
      />
      <ProductForm product={product} categories={categoryItems} brands={brandItems} />
    </>
  );
}
