'use client';

import type { CatalogItem } from '@drinks/shared';
import type { CatalogKind } from '@drinks/shared/schemas';
import { Button } from '@drinks/ui/components/button';
import { DataTable, dataTableColumnHelper } from '@drinks/ui/components/data-table';
import { toast } from '@drinks/ui/components/sonner';
import { ArchiveIcon, ArchiveRestoreIcon, PencilIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';

import { archiveCatalogItem, restoreCatalogItem } from '../actions';
import { CatalogItemDialog } from './catalog-item-dialog';

const col = dataTableColumnHelper<CatalogItem>();

interface CatalogTableProps {
  kind: CatalogKind;
  items: readonly CatalogItem[];
  /** The archived list is shown (changes the empty message). */
  archived: boolean;
}

/** Category / brand list with rename, archive and restore (T-302). */
export function CatalogTable({ kind, items, archived }: CatalogTableProps) {
  const t = useTranslations('catalog');

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor('name', { header: t('name') }),
        col.accessor('productCount', {
          header: t('productCount'),
          cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
        }),
        col.display({
          id: 'actions',
          header: () => <span className="sr-only">{t('actions')}</span>,
          cell: (info) => <RowActions kind={kind} item={info.row.original} />,
        }),
      ]),
    [kind, t],
  );

  return (
    <DataTable
      columns={columns}
      data={items}
      getRowId={(row) => row.id}
      emptyMessage={t(archived ? `${kind}.emptyArchived` : `${kind}.empty`)}
    />
  );
}

function RowActions({ kind, item }: { kind: CatalogKind; item: CatalogItem }) {
  const t = useTranslations('catalog');
  const tErrors = useTranslations('errors');

  async function run(change: typeof archiveCatalogItem, done: string): Promise<boolean> {
    const result = await change({ kind, id: item.id });
    if (!result.ok) {
      toast.error(tErrors(result.error.code));
      return false;
    }
    toast.success(done);
    return true;
  }

  return (
    <div className="flex justify-end gap-1">
      <CatalogItemDialog
        kind={kind}
        item={item}
        trigger={
          <Button variant="ghost" size="icon" aria-label={t('edit')} title={t('edit')}>
            <PencilIcon />
          </Button>
        }
      />
      {item.archived ? (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="icon" aria-label={t('restore')} title={t('restore')}>
              <ArchiveRestoreIcon />
            </Button>
          }
          title={t(`${kind}.restoreTitle`, { name: item.name })}
          description={t('restoreDescription')}
          confirmLabel={t('restore')}
          onConfirm={() => run(restoreCatalogItem, t('restored'))}
        />
      ) : (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="icon" aria-label={t('archive')} title={t('archive')}>
              <ArchiveIcon />
            </Button>
          }
          title={t(`${kind}.archiveTitle`, { name: item.name })}
          description={t('archiveDescription')}
          confirmLabel={t('archive')}
          destructive
          onConfirm={() => run(archiveCatalogItem, t('archived'))}
        />
      )}
    </div>
  );
}
