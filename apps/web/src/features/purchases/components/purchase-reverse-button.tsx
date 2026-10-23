'use client';

import type { ActionError } from '@drinks/shared';
import { toast } from '@drinks/ui/components/sonner';
import { useTranslations } from 'next-intl';

import { ReverseDialog } from '@/components/reverse-dialog';
import { useRouter } from '@/i18n/navigation';

import { reversePurchase } from '../actions';

interface PurchaseReverseButtonProps {
  id: string;
  number: string;
}

/**
 * "Storno" on a posted purchase (T-406, BR-3): OWNER only — the page renders
 * it for `document.reverse` holders and the service checks again.
 */
export function PurchaseReverseButton({ id, number }: PurchaseReverseButtonProps) {
  const t = useTranslations('purchases.reverse');
  const tErrors = useTranslations('errors');
  const router = useRouter();

  function errorMessage(actionError: ActionError): string {
    const params = actionError.params ?? {};
    switch (actionError.code) {
      case 'PURCHASE_REVERSAL_INSUFFICIENT_STOCK':
        return t('insufficientStock', {
          product: String(params.product ?? ''),
          subWarehouse: String(params.subWarehouse ?? ''),
          available: Number(params.available ?? 0),
          required: Number(params.required ?? 0),
        });
      case 'WAREHOUSE_IN_STOCK_COUNT':
        return t('stockCount', {
          warehouse: String(params.warehouseName ?? ''),
          number: String(params.stockCountNumber ?? ''),
        });
      default:
        return tErrors(actionError.code);
    }
  }

  async function onReverse(reason: string): Promise<string | null> {
    const result = await reversePurchase({ id, reason });
    if (!result.ok) return errorMessage(result.error);
    toast.success(t('done', { number }));
    router.refresh();
    return null;
  }

  return (
    <ReverseDialog
      label={t('button')}
      title={t('title', { number })}
      description={t('description')}
      reasonLabel={t('reason')}
      reasonPlaceholder={t('reasonPlaceholder')}
      onReverse={onReverse}
    />
  );
}
