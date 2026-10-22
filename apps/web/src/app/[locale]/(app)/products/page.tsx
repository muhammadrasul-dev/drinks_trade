import type { Locale } from '@drinks/shared';
import { Button } from '@drinks/ui/components/button';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ComingSoon } from '@/components/coming-soon';
import { CATALOG_HREF } from '@/features/catalog/components/catalog-page';
import { Link } from '@/i18n/navigation';
import { requireSection } from '@/lib/session';

// The product list itself comes with T-303; categories and brands (T-302) are reachable already.
export default async function ProductsPage({ params }: PageProps<'/[locale]/products'>) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  await requireSection(locale as Locale, 'products');
  const t = await getTranslations('catalog');
  return (
    <ComingSoon
      section="products"
      actions={
        <>
          <Button asChild variant="outline">
            <Link href={CATALOG_HREF.category}>{t('category.title')}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={CATALOG_HREF.brand}>{t('brand.title')}</Link>
          </Button>
        </>
      }
    />
  );
}
