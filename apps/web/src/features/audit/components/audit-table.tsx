'use client';

import { type AuditEntryDto, formatDateTime } from '@drinks/shared';
import { Button } from '@drinks/ui/components/button';
import { DataTable, dataTableColumnHelper } from '@drinks/ui/components/data-table';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { AuditDetails } from './audit-details';
import { loose, shortId } from './audit-value';

const col = dataTableColumnHelper<AuditEntryDto>();

interface AuditTableProps {
  items: readonly AuditEntryDto[];
  refs: Readonly<Record<string, string>>;
}

/** Audit log rows (T-901): time, who, what, on which entity; a row expands to its old/new values. */
export function AuditTable({ items, refs }: AuditTableProps) {
  const t = useTranslations('audit');
  const tAction = loose(useTranslations('audit.actions'));
  const tEntity = loose(useTranslations('audit.entities'));
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  const columns = useMemo(() => {
    const toggle = (id: string) =>
      setOpen((current) => {
        const next = new Set(current);
        if (!next.delete(id)) next.add(id);
        return next;
      });
    return col.columns([
      col.display({
        id: 'expand',
        header: () => <span className="sr-only">{t('showDetails')}</span>,
        cell: (info) => {
          const id = info.row.original.id;
          const expanded = open.has(id);
          return (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-expanded={expanded}
              aria-label={expanded ? t('hideDetails') : t('showDetails')}
              onClick={() => toggle(id)}
            >
              {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
            </Button>
          );
        },
      }),
      col.accessor('createdAt', {
        header: t('columns.time'),
        cell: (info) => (
          <span className="whitespace-nowrap tabular-nums">{formatDateTime(info.getValue())}</span>
        ),
      }),
      col.accessor('user', {
        header: t('columns.user'),
        cell: (info) => {
          const user = info.getValue();
          if (!user) return <span className="text-muted-foreground">{t('system')}</span>;
          return (
            <span className="flex flex-col">
              <span>{user.fullName}</span>
              <span className="text-xs text-muted-foreground">{user.username}</span>
            </span>
          );
        },
      }),
      col.accessor('action', {
        header: t('columns.action'),
        cell: (info) => {
          const action = info.getValue();
          return (
            <span className="flex flex-wrap items-center gap-1.5">
              <span>{tAction.has(action) ? tAction(action) : action}</span>
              {info.row.original.backdated && (
                <span
                  title={t('backdatedHint')}
                  className="inline-flex rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                >
                  {t('backdated')}
                </span>
              )}
            </span>
          );
        },
      }),
      col.display({
        id: 'entity',
        header: t('columns.entity'),
        cell: (info) => {
          const { entityType, entityId } = info.row.original;
          const name = refs[entityId];
          return (
            <span className="flex flex-col">
              <span className="text-xs text-muted-foreground">
                {tEntity.has(entityType) ? tEntity(entityType) : entityType}
              </span>
              {name === undefined ? (
                <span title={entityId} className="font-mono text-xs">
                  {shortId(entityId)}
                </span>
              ) : (
                <span title={entityId}>{name}</span>
              )}
            </span>
          );
        },
      }),
    ]);
  }, [t, tAction, tEntity, refs, open]);

  return (
    <DataTable
      columns={columns}
      data={items}
      getRowId={(row) => row.id}
      emptyMessage={t('empty')}
      renderSubRow={(row) => (open.has(row.id) ? <AuditDetails entry={row} refs={refs} /> : null)}
    />
  );
}
