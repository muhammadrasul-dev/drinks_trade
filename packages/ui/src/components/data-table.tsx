'use client';

import * as React from 'react';
import { cn } from '@drinks/ui/lib/utils';
import {
  type ColumnDef,
  type ColumnHelper,
  createColumnHelper,
  type RowData,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@drinks/ui/components/table';

// TanStack Table v9: features are registered explicitly. Lists are filtered,
// sorted and paged on the server (architecture §6), so the core row model is enough.
const features = tableFeatures({});
export type DataTableFeatures = typeof features;

// `any` mirrors TanStack's own column-array type: each column keeps its own value type.
export type DataTableColumns<TData extends RowData> = Array<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ColumnDef<DataTableFeatures, TData, any>
>;

/**
 * Typed column builder: `const col = dataTableColumnHelper<Product>();
 * const columns = col.columns([col.accessor('name', { header: … })])`.
 * Columns hold render functions, so define them in a Client Component module.
 */
export function dataTableColumnHelper<TData extends RowData>(): ColumnHelper<
  DataTableFeatures,
  TData
> {
  return createColumnHelper<DataTableFeatures, TData>();
}

interface DataTableProps<TData extends RowData> {
  /** Keep stable (module scope or useMemo): a new array rebuilds the row model. */
  columns: DataTableColumns<TData>;
  data: readonly TData[];
  /** Shown in a single row when `data` is empty (already translated). */
  emptyMessage: React.ReactNode;
  /** Stable row key, e.g. `(row) => row.id`; defaults to the row index. */
  getRowId?: (row: TData, index: number) => string;
  /** Optional full-width row under a row (e.g. expanded details); null/undefined for none. */
  renderSubRow?: (row: TData) => React.ReactNode;
  className?: string;
}

function DataTable<TData extends RowData>({
  columns,
  data,
  emptyMessage,
  getRowId,
  renderSubRow,
  className,
}: DataTableProps<TData>) {
  const table = useTable({
    features,
    columns,
    data: data as TData[],
    ...(getRowId && { getRowId }),
  });
  const rows = table.getRowModel().rows;
  const columnCount = table.getAllLeafColumns().length;

  return (
    <div data-slot="data-table" className={cn('rounded-md border', className)}>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead key={header.id} colSpan={header.colSpan}>
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length > 0 ? (
            rows.map((row) => {
              const subRow = renderSubRow?.(row.original);
              return (
                <React.Fragment key={row.id}>
                  <TableRow>
                    {row.getAllCells().map((cell) => (
                      <TableCell key={cell.id}>
                        <table.FlexRender cell={cell} />
                      </TableCell>
                    ))}
                  </TableRow>
                  {subRow != null && (
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell colSpan={columnCount} className="whitespace-normal">
                        {subRow}
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={columnCount} className="h-24 text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export { DataTable };
