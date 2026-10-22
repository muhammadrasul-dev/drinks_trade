'use client';

import { formatQty, type Product, type ProductRef } from '@drinks/shared';
import { Button } from '@drinks/ui/components/button';
import { DataTable, dataTableColumnHelper } from '@drinks/ui/components/data-table';
import { toast } from '@drinks/ui/components/sonner';
import { ArchiveIcon, ArchiveRestoreIcon, PencilIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { MoneyText } from '@/components/money-text';
import { QtyText } from '@/components/qty-text';
import { Link } from '@/i18n/navigation';

import { archiveProduct, restoreProduct } from '../actions';
import { PRODUCTS_HREF } from '../list-params';
import { ProductArchiveDialog } from './product-archive-dialog';
import { ProductThumb } from './product-thumb';

const col = dataTableColumnHelper<Product>();

interface ProductTableProps {
  items: readonly Product[];
  /** The archived list is shown (changes the empty message). */
  archived: boolean;
}

/** Product list (T-303): photo, name and codes, category, brand, price, stock, actions. */
export function ProductTable({ items, archived }: ProductTableProps) {
  const t = useTranslations('products');

  const columns = useMemo(
    () =>
      col.columns([
        col.display({
          id: 'image',
          header: () => <span className="sr-only">{t('columns.image')}</span>,
          cell: (info) => <ProductThumb product={info.row.original} size={40} />,
        }),
        col.accessor('name', {
          header: t('columns.name'),
          cell: (info) => <NameCell product={info.row.original} />,
        }),
        col.accessor('category', {
          header: t('columns.category'),
          cell: (info) => <RefCell value={info.getValue()} />,
        }),
        col.accessor('brand', {
          header: t('columns.brand'),
          cell: (info) => <RefCell value={info.getValue()} />,
        }),
        col.accessor('salePrice', {
          header: t('columns.price'),
          cell: (info) => <PriceCell product={info.row.original} />,
        }),
        col.accessor('stockQty', {
          header: t('columns.stock'),
          cell: (info) => <StockCell product={info.row.original} />,
        }),
        col.display({
          id: 'actions',
          header: () => <span className="sr-only">{t('columns.actions')}</span>,
          cell: (info) => <RowActions product={info.row.original} />,
        }),
      ]),
    [t],
  );

  return (
    <DataTable
      columns={columns}
      data={items}
      getRowId={(row) => row.id}
      emptyMessage={t(archived ? 'emptyArchived' : 'empty')}
    />
  );
}

function NameCell({ product }: { product: Product }) {
  const codes = [product.sku, product.barcode].filter(Boolean).join(' · ');
  return (
    <div className="flex min-w-40 flex-col">
      <Link href={`${PRODUCTS_HREF}/${product.id}`} className="font-medium hover:underline">
        {product.name}
      </Link>
      {codes && <span className="text-xs text-muted-foreground">{codes}</span>}
    </div>
  );
}

function RefCell({ value }: { value: ProductRef | null }) {
  const t = useTranslations('products');
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={value.archived ? 'text-muted-foreground' : undefined}>
      {value.archived ? t('form.archivedOption', { name: value.name }) : value.name}
    </span>
  );
}

function PriceCell({ product }: { product: Product }) {
  const tUnit = useTranslations('enums.QtyUnit');
  return (
    <div className="flex flex-col">
      <MoneyText amount={product.salePrice} />
      {product.unitsPerBlock > 1 && (
        <span className="text-xs whitespace-nowrap text-muted-foreground">
          {tUnit('BLOCK')} ({product.unitsPerBlock}): <MoneyText amount={product.blockPrice} />
        </span>
      )}
    </div>
  );
}

function StockCell({ product }: { product: Product }) {
  const t = useTranslations('products');
  const tUnit = useTranslations('enums.QtyUnit');
  const labels = { block: tUnit('BLOCK'), piece: tUnit('PIECE') };
  return (
    <div className="flex flex-col items-start gap-1">
      <QtyText qty={product.stockQty} unitsPerBlock={product.unitsPerBlock} />
      {product.lowStock && (
        <span
          className="rounded-sm bg-destructive/10 px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-destructive"
          title={t('lowStockTitle', {
            min: formatQty(product.minStock, product.unitsPerBlock, labels),
          })}
        >
          {t('lowStock')}
        </span>
      )}
    </div>
  );
}

function RowActions({ product }: { product: Product }) {
  const t = useTranslations('products');
  const tErrors = useTranslations('errors');

  async function run(change: typeof archiveProduct, done: string): Promise<boolean> {
    const result = await change({ id: product.id });
    if (!result.ok) {
      toast.error(tErrors(result.error.code));
      return false;
    }
    toast.success(done);
    return true;
  }

  return (
    <div className="flex justify-end gap-1">
      <Button asChild variant="ghost" size="icon" aria-label={t('edit')} title={t('edit')}>
        <Link href={`${PRODUCTS_HREF}/${product.id}`}>
          <PencilIcon />
        </Link>
      </Button>
      <ProductArchiveDialog
        product={product}
        trigger={
          <Button
            variant="ghost"
            size="icon"
            aria-label={t(product.archived ? 'restore' : 'archive')}
            title={t(product.archived ? 'restore' : 'archive')}
          >
            {product.archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
          </Button>
        }
        onConfirm={() =>
          product.archived ? run(restoreProduct, t('restored')) : run(archiveProduct, t('archived'))
        }
      />
    </div>
  );
}
