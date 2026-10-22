'use client';

import type { ActionError, ActionResult, SubWarehouseItem, WarehouseItem } from '@drinks/shared';
import { Button } from '@drinks/ui/components/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@drinks/ui/components/card';
import { DataTable, dataTableColumnHelper } from '@drinks/ui/components/data-table';
import { toast } from '@drinks/ui/components/sonner';
import { ArchiveIcon, ArchiveRestoreIcon, PencilIcon, PlusIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';

import {
  archiveSubWarehouse,
  archiveWarehouse,
  restoreSubWarehouse,
  restoreWarehouse,
} from '../actions';
import { type WarehouseLevel, WarehouseNameDialog } from './warehouse-name-dialog';

const col = dataTableColumnHelper<SubWarehouseItem>();

type ArchiveAction = (input: { id: string }) => Promise<ActionResult<unknown>>;

const ACTIONS: Record<WarehouseLevel, { archive: ArchiveAction; restore: ArchiveAction }> = {
  warehouse: { archive: archiveWarehouse, restore: restoreWarehouse },
  subWarehouse: { archive: archiveSubWarehouse, restore: restoreSubWarehouse },
};

/** One warehouse with its sub-warehouses (T-304). */
export function WarehouseCard({ warehouse }: { warehouse: WarehouseItem }) {
  const t = useTranslations('warehouses');

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor('name', {
          header: t('name'),
          cell: (info) => (
            <span className={info.row.original.archived ? 'text-muted-foreground' : undefined}>
              {info.getValue()}
              {info.row.original.archived && (
                <span className="ms-2 text-xs">({t('archivedBadge')})</span>
              )}
            </span>
          ),
        }),
        col.accessor('hasStock', {
          header: t('status'),
          cell: (info) => (
            <span className={info.getValue() ? undefined : 'text-muted-foreground'}>
              {info.getValue() ? t('hasStock') : t('noStock')}
            </span>
          ),
        }),
        col.display({
          id: 'actions',
          header: () => <span className="sr-only">{t('actions')}</span>,
          cell: (info) => (
            <NodeActions
              level="subWarehouse"
              node={info.row.original}
              // A sub-warehouse of an archived warehouse is restored together with it.
              canRestore={!warehouse.archived}
            />
          ),
        }),
      ]),
    [t, warehouse.archived],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className={warehouse.archived ? 'text-muted-foreground' : undefined}>
          {warehouse.name}
        </CardTitle>
        <CardDescription>
          {warehouse.archived && `${t('archivedBadge')} · `}
          {t('subCount', { count: warehouse.subWarehouses.length })}
          {warehouse.hasStock && ` · ${t('hasStock')}`}
        </CardDescription>
        <CardAction>
          <NodeActions level="warehouse" node={warehouse} canRestore />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {warehouse.subWarehouses.length > 0 ? (
          <DataTable
            columns={columns}
            data={warehouse.subWarehouses}
            getRowId={(row) => row.id}
            emptyMessage=""
          />
        ) : (
          <p className="text-sm text-muted-foreground">{t('noSubWarehouses')}</p>
        )}
        {!warehouse.archived && (
          <div>
            <WarehouseNameDialog
              level="subWarehouse"
              warehouseId={warehouse.id}
              trigger={
                <Button variant="outline" size="sm">
                  <PlusIcon />
                  {t('subWarehouse.add')}
                </Button>
              }
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface NodeActionsProps {
  level: WarehouseLevel;
  node: { id: string; name: string; archived: boolean };
  canRestore: boolean;
}

function NodeActions({ level, node, canRestore }: NodeActionsProps) {
  const t = useTranslations('warehouses');
  const tErrors = useTranslations('errors');

  function errorMessage(error: ActionError): string {
    if (error.code === 'ENTITY_NOT_EMPTY') {
      const subs = error.params?.subWarehouses;
      return t(`${level}.notEmpty`, {
        name: node.name,
        subWarehouses: Array.isArray(subs) ? subs.join(', ') : '',
      });
    }
    if (error.code === 'ENTITY_ARCHIVED') return t('parentArchived');
    return tErrors(error.code);
  }

  async function run(change: ArchiveAction, done: string): Promise<boolean> {
    const result = await change({ id: node.id });
    if (!result.ok) {
      toast.error(errorMessage(result.error));
      return false;
    }
    toast.success(done);
    return true;
  }

  return (
    <div className="flex justify-end gap-1">
      <WarehouseNameDialog
        level={level}
        item={node}
        trigger={
          <Button variant="ghost" size="icon" aria-label={t('edit')} title={t('edit')}>
            <PencilIcon />
          </Button>
        }
      />
      {node.archived ? (
        canRestore && (
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="icon" aria-label={t('restore')} title={t('restore')}>
                <ArchiveRestoreIcon />
              </Button>
            }
            title={t(`${level}.restoreTitle`, { name: node.name })}
            description={t(`${level}.restoreDescription`)}
            confirmLabel={t('restore')}
            onConfirm={() => run(ACTIONS[level].restore, t('restored'))}
          />
        )
      ) : (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="icon" aria-label={t('archive')} title={t('archive')}>
              <ArchiveIcon />
            </Button>
          }
          title={t(`${level}.archiveTitle`, { name: node.name })}
          description={t(`${level}.archiveDescription`)}
          confirmLabel={t('archive')}
          destructive
          onConfirm={() => run(ACTIONS[level].archive, t('archived'))}
        />
      )}
    </div>
  );
}
