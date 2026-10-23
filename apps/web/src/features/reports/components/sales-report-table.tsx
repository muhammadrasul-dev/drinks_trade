'use client';

import type { SalesReportRow } from '@drinks/shared';
import { DataTable, dataTableColumnHelper } from '@drinks/ui/components/data-table';
import { cn } from '@drinks/ui/lib/utils';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { MoneyText } from '@/components/money-text';
import { QtyText } from '@/components/qty-text';

import { ReportProductCell } from './report-product-cell';

const col = dataTableColumnHelper<SalesReportRow>();

interface SalesReportTableProps {
  items: readonly SalesReportRow[];
  /** The server sent cost columns (OWNER); STAFF rows have no such fields. */
  showCost: boolean;
}

/**
 * Sales report (T-802, SRS §7.2): per product — quantity sold in blocks and
 * pieces and revenue; cost and gross profit only when the server included them.
 */
export function SalesReportTable({ items, showCost }: SalesReportTableProps) {
  const t = useTranslations('salesReport');

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor('product', {
          id: 'product',
          header: t('columns.product'),
          cell: (info) => <ReportProductCell product={info.getValue()} />,
        }),
        col.accessor('qty', {
          header: t('columns.qty'),
          cell: (info) => <QtyCell row={info.row.original} />,
        }),
        col.accessor('revenue', {
          header: t('columns.revenue'),
          cell: (info) => <MoneyText amount={info.getValue()} className="font-medium" />,
        }),
        ...(showCost
          ? [
              col.accessor('cost', {
                header: t('columns.cost'),
                cell: (info) => {
                  const cost = info.getValue();
                  return cost === undefined ? null : <MoneyText amount={cost} />;
                },
              }),
              col.accessor('grossProfit', {
                header: t('columns.grossProfit'),
                cell: (info) => {
                  const profit = info.getValue();
                  return profit === undefined ? null : (
                    <MoneyText
                      amount={profit}
                      className={cn('font-medium', profit < 0 && 'text-destructive')}
                    />
                  );
                },
              }),
            ]
          : []),
      ]),
    [t, showCost],
  );

  return (
    <DataTable
      columns={columns}
      data={items}
      getRowId={(row) => row.product.id}
      emptyMessage={t('empty')}
    />
  );
}

function QtyCell({ row }: { row: SalesReportRow }) {
  const t = useTranslations('salesReport');
  const { unitsPerBlock } = row.product;
  return (
    <div className="flex flex-col items-start">
      <QtyText qty={row.qty} unitsPerBlock={unitsPerBlock} className="font-medium" />
      {/* "= N dona" only when the blocks need adding up. */}
      {unitsPerBlock > 1 && row.qty >= unitsPerBlock && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {t('pieces', { qty: row.qty })}
        </span>
      )}
    </div>
  );
}
