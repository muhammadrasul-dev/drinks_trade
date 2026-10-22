'use client';

import type { Product } from '@drinks/shared';
import { Button } from '@drinks/ui/components/button';
import { toast } from '@drinks/ui/components/sonner';
import { ArchiveIcon, ArchiveRestoreIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { archiveProduct, restoreProduct } from '../actions';
import { ProductArchiveDialog } from './product-archive-dialog';

/** Archive / restore from the edit page; the page re-renders with the new state. */
export function ProductArchiveButton({ product }: { product: Product }) {
  const t = useTranslations('products');
  const tErrors = useTranslations('errors');

  async function onConfirm(): Promise<boolean> {
    const result = product.archived
      ? await restoreProduct({ id: product.id })
      : await archiveProduct({ id: product.id });
    if (!result.ok) {
      toast.error(tErrors(result.error.code));
      return false;
    }
    toast.success(t(product.archived ? 'restored' : 'archived'));
    return true;
  }

  return (
    <ProductArchiveDialog
      product={product}
      onConfirm={onConfirm}
      trigger={
        <Button variant="outline">
          {product.archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
          {t(product.archived ? 'restore' : 'archive')}
        </Button>
      }
    />
  );
}
