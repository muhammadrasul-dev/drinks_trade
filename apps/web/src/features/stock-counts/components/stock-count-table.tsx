'use client';

import { formatDate, type StockCountListItem } from '@drinks/shared';
import { DataTable, dataTableColumnHelper } from '@drinks/ui/components/data-table';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { MoneyText } from '@/components/money-text';
import { Link } from '@/i18n/navigation';

import { STOCK_COUNTS_HREF } from '../list-params';
import { StockCountStatusBadge } from './stock-count-status-badge';

const col = dataTableColumnHelper<StockCountListItem>();

function Amount({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined)
    return <span className="text-muted-foreground">—</span>;
  return <MoneyText amount={value} />;
}

/**
 * Stock count list (T-601): number, date, warehouse, status, counted rows,
 * author; open counts come first (the service sorts). Shortage / surplus
 * columns only when the server sent them (OWNER, rule 6).
 */
export function StockCountTable({
  items,
  showAmounts,
}: {
  items: readonly StockCountListItem[];
  showAmounts: boolean;
}) {
  const t = useTranslations('stockCounts');

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor('number', {
          header: t('columns.number'),
          cell: (info) => (
            <Link
              href={`${STOCK_COUNTS_HREF}/${info.row.original.id}`}
              className="font-medium tabular-nums underline-offset-4 hover:underline"
            >
              {info.getValue()}
            </Link>
          ),
        }),
        col.accessor('docDate', {
          header: t('columns.date'),
          cell: (info) => <span className="tabular-nums">{formatDate(info.getValue())}</span>,
        }),
        col.accessor('warehouse', {
          header: t('columns.warehouse'),
          cell: (info) => info.getValue().name,
        }),
        col.accessor('status', {
          header: t('columns.status'),
          cell: (info) => <StockCountStatusBadge status={info.getValue()} />,
        }),
        col.accessor('lineCount', {
          header: t('columns.counted'),
          cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
        }),
        ...(showAmounts
          ? [
              col.accessor('shortageAmount', {
                header: t('columns.shortage'),
                cell: (info) => <Amount value={info.getValue()} />,
              }),
              col.accessor('surplusAmount', {
                header: t('columns.surplus'),
                cell: (info) => <Amount value={info.getValue()} />,
              }),
            ]
          : []),
        col.accessor('createdBy', {
          header: t('columns.author'),
          cell: (info) => info.getValue().fullName,
        }),
      ]),
    [t, showAmounts],
  );

  return (
    <DataTable
      columns={columns}
      data={items}
      getRowId={(row) => row.id}
      emptyMessage={t('empty')}
    />
  );
}
