'use client';

import { formatDate, type PurchaseListItem } from '@drinks/shared';
import { DataTable, dataTableColumnHelper } from '@drinks/ui/components/data-table';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { MoneyText } from '@/components/money-text';
import { Link } from '@/i18n/navigation';

import { PURCHASES_HREF } from '../list-params';
import { DocStatusBadge } from '@/components/doc-status-badge';

const col = dataTableColumnHelper<PurchaseListItem>();

/** Purchase list (T-404): number, date, status, total and payment split, author. */
export function PurchaseTable({ items }: { items: readonly PurchaseListItem[] }) {
  const t = useTranslations('purchases');

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor('number', {
          header: t('columns.number'),
          cell: (info) => (
            <Link
              href={`${PURCHASES_HREF}/${info.row.original.id}`}
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
        col.accessor('status', {
          header: t('columns.status'),
          cell: (info) => <DocStatusBadge status={info.getValue()} />,
        }),
        col.accessor('totalAmount', {
          header: t('columns.total'),
          cell: (info) => <MoneyText amount={info.getValue()} />,
        }),
        col.display({
          id: 'payment',
          header: t('columns.payment'),
          cell: (info) => <PaymentCell item={info.row.original} />,
        }),
        col.accessor('lineCount', {
          header: t('columns.lines'),
          cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
        }),
        col.accessor('createdBy', {
          header: t('columns.author'),
          cell: (info) => info.getValue().fullName,
        }),
      ]),
    [t],
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

function PaymentCell({ item }: { item: PurchaseListItem }) {
  const t = useTranslations('purchases.payment');
  const parts = [
    { key: 'cash', amount: item.paidCash },
    { key: 'card', amount: item.paidCard },
    { key: 'credit', amount: item.paidCredit },
  ] as const;
  const shown = parts.filter((part) => part.amount > 0);
  if (shown.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col text-xs">
      {shown.map((part) => (
        <span key={part.key} className="whitespace-nowrap">
          <span className="text-muted-foreground">{t(part.key)}: </span>
          <MoneyText amount={part.amount} />
        </span>
      ))}
    </div>
  );
}
