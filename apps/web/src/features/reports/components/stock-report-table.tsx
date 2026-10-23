'use client';

import { formatQty, roundHalfUp, type StockReportRow } from '@drinks/shared';
import { DataTable, dataTableColumnHelper } from '@drinks/ui/components/data-table';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { MoneyText } from '@/components/money-text';
import { QtyText } from '@/components/qty-text';

import { ReportProductCell } from './report-product-cell';

const col = dataTableColumnHelper<StockReportRow>();

interface StockReportTableProps {
  items: readonly StockReportRow[];
  /** The server sent cost columns (OWNER); STAFF rows have no such fields. */
  showCost: boolean;
}

/**
 * Stock report (T-801, SRS §7.1): product, where it lies (warehouse →
 * sub-warehouse → qty), total in blocks and pieces with the low-stock mark;
 * average cost and stock value only when the server included them.
 */
export function StockReportTable({ items, showCost }: StockReportTableProps) {
  const t = useTranslations('stockReport');

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor('product', {
          id: 'product',
          header: t('columns.product'),
          cell: (info) => <ReportProductCell product={info.getValue()} />,
        }),
        col.display({
          id: 'locations',
          header: t('columns.locations'),
          cell: (info) => <LocationsCell row={info.row.original} />,
        }),
        col.accessor('qty', {
          header: t('columns.qty'),
          cell: (info) => <QtyCell row={info.row.original} />,
        }),
        ...(showCost
          ? [
              col.accessor('avgCost', {
                header: t('columns.avgCost'),
                cell: (info) => {
                  const avgCost = info.getValue();
                  return avgCost === undefined ? null : (
                    <span title={avgCost}>
                      <MoneyText amount={roundHalfUp(avgCost)} />
                    </span>
                  );
                },
              }),
              col.accessor('value', {
                header: t('columns.value'),
                cell: (info) => {
                  const value = info.getValue();
                  return value === undefined ? null : (
                    <MoneyText amount={value} className="font-medium" />
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

function LocationsCell({ row }: { row: StockReportRow }) {
  if (row.locations.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <ul className="flex flex-col gap-0.5 text-sm">
      {row.locations.map((location) => (
        <li key={location.subWarehouse.id} className="flex flex-wrap gap-x-2">
          <span className="text-muted-foreground">
            {location.warehouse.name} → {location.subWarehouse.name}
          </span>
          <QtyText qty={location.qty} unitsPerBlock={row.product.unitsPerBlock} />
        </li>
      ))}
    </ul>
  );
}

function QtyCell({ row }: { row: StockReportRow }) {
  const t = useTranslations('stockReport');
  const tUnit = useTranslations('enums.QtyUnit');
  const labels = { block: tUnit('BLOCK'), piece: tUnit('PIECE') };
  const { unitsPerBlock, minStock } = row.product;
  return (
    <div className="flex flex-col items-start gap-1">
      <QtyText qty={row.qty} unitsPerBlock={unitsPerBlock} className="font-medium" />
      {unitsPerBlock > 1 && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {t('pieces', { qty: row.qty })}
        </span>
      )}
      {row.storeQty !== row.qty && (
        <span className="text-xs whitespace-nowrap text-muted-foreground">
          {t('storeQty', { qty: formatQty(row.storeQty, unitsPerBlock, labels) })}
        </span>
      )}
      {row.lowStock && (
        <span
          className="rounded-sm bg-destructive/10 px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-destructive"
          title={t('lowStockTitle', { min: formatQty(minStock, unitsPerBlock, labels) })}
        >
          {t('lowStock')}
        </span>
      )}
    </div>
  );
}
