'use client';

import { formatQty, type Product } from '@drinks/shared';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';

interface ProductArchiveDialogProps {
  product: Product;
  trigger: ReactElement;
  /** Archives an active product, restores an archived one. */
  onConfirm: () => Promise<boolean>;
}

/**
 * Archive / restore confirmation (FR-1.2). Archiving with stock on hand is
 * allowed (OQ-20), so the dialog says how much is left and that it cannot be sold.
 */
export function ProductArchiveDialog({ product, trigger, onConfirm }: ProductArchiveDialogProps) {
  const t = useTranslations('products');
  const tUnit = useTranslations('enums.QtyUnit');
  const restoring = product.archived;
  const stock = formatQty(product.stockQty, product.unitsPerBlock, {
    block: tUnit('BLOCK'),
    piece: tUnit('PIECE'),
  });

  return (
    <ConfirmDialog
      trigger={trigger}
      title={t(restoring ? 'restoreTitle' : 'archiveTitle', { name: product.name })}
      description={
        restoring ? (
          t('restoreDescription')
        ) : (
          <>
            {t('archiveDescription')}
            {product.stockQty > 0 && (
              <span className="mt-2 block font-medium text-foreground">
                {t('archiveWithStock', { qty: stock })}
              </span>
            )}
          </>
        )
      }
      confirmLabel={t(restoring ? 'restore' : 'archive')}
      destructive={!restoring}
      onConfirm={onConfirm}
    />
  );
}
