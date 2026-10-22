import { brands, categories } from '@drinks/server';
import type { Locale } from '@drinks/shared';
import type { CatalogKind } from '@drinks/shared/schemas';
import { Button } from '@drinks/ui/components/button';
import { PageHeader } from '@drinks/ui/components/page-header';
import { PlusIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { getServiceContext, requireSection } from '@/lib/session';

import { CatalogItemDialog } from './catalog-item-dialog';
import { CatalogTable } from './catalog-table';

const SERVICES = { category: categories, brand: brands } as const;
export const CATALOG_HREF = {
  category: '/products/categories',
  brand: '/products/brands',
} as const;

interface CatalogPageProps {
  kind: CatalogKind;
  locale: Locale;
  /** `?archived=1` shows the archive instead of the active list. */
  archived: boolean;
}

/** /products/categories and /products/brands (T-302): one list, a dialog to add and edit. */
export async function CatalogPage({ kind, locale, archived }: CatalogPageProps) {
  const session = await requireSection(locale, 'products');
  const items = await SERVICES[kind].list(await getServiceContext(session), { archived });
  const t = await getTranslations('catalog');
  const href = CATALOG_HREF[kind];

  return (
    <>
      <PageHeader
        title={t(`${kind}.title`)}
        actions={
          <CatalogItemDialog
            kind={kind}
            trigger={
              <Button>
                <PlusIcon />
                {t(`${kind}.add`)}
              </Button>
            }
          />
        }
      />
      <nav aria-label={t('filter')} className="flex gap-2">
        <Button asChild size="sm" variant={archived ? 'ghost' : 'secondary'}>
          <Link href={href} aria-current={archived ? undefined : 'page'}>
            {t('active')}
          </Link>
        </Button>
        <Button asChild size="sm" variant={archived ? 'secondary' : 'ghost'}>
          <Link href={`${href}?archived=1`} aria-current={archived ? 'page' : undefined}>
            {t('archiveList')}
          </Link>
        </Button>
      </nav>
      <CatalogTable kind={kind} items={items} archived={archived} />
    </>
  );
}
