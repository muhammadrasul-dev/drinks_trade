import { warehouses } from '@drinks/server';
import type { Locale } from '@drinks/shared';
import { Button } from '@drinks/ui/components/button';
import { PageHeader } from '@drinks/ui/components/page-header';
import { PlusIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { getServiceContext, requireSection } from '@/lib/session';

import { WarehouseCard } from './warehouse-card';
import { WarehouseNameDialog } from './warehouse-name-dialog';

interface WarehousesPageProps {
  locale: Locale;
  /** `?archived=1` shows archived warehouses instead of the active ones. */
  archived: boolean;
}

/** /warehouses (T-304): warehouse → sub-warehouse tree, one card per warehouse. */
export async function WarehousesPage({ locale, archived }: WarehousesPageProps) {
  const session = await requireSection(locale, 'warehouses');
  const items = await warehouses.list(await getServiceContext(session), { archived });
  const t = await getTranslations('warehouses');

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <WarehouseNameDialog
            level="warehouse"
            trigger={
              <Button>
                <PlusIcon />
                {t('warehouse.add')}
              </Button>
            }
          />
        }
      />
      <nav aria-label={t('filter')} className="flex gap-2">
        <Button asChild size="sm" variant={archived ? 'ghost' : 'secondary'}>
          <Link href="/warehouses" aria-current={archived ? undefined : 'page'}>
            {t('active')}
          </Link>
        </Button>
        <Button asChild size="sm" variant={archived ? 'secondary' : 'ghost'}>
          <Link href="/warehouses?archived=1" aria-current={archived ? 'page' : undefined}>
            {t('archiveList')}
          </Link>
        </Button>
      </nav>
      {items.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((item) => (
            <WarehouseCard key={item.id} warehouse={item} />
          ))}
        </div>
      ) : (
        <p className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          {t(archived ? 'emptyArchived' : 'empty')}
        </p>
      )}
    </>
  );
}
