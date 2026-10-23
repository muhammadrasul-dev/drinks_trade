'use client';

import { type ActionError, CashboxType } from '@drinks/shared';
import { toast } from '@drinks/ui/components/sonner';
import { useTranslations } from 'next-intl';

import { ReverseDialog } from '@/components/reverse-dialog';
import { useRouter } from '@/i18n/navigation';

import { reverseSale } from '../actions';

interface SaleReverseButtonProps {
  id: string;
  number: string;
}

/**
 * "Storno" on a posted sale (T-503, BR-3): OWNER only — the page renders it
 * for `document.reverse` holders and the service checks again.
 */
export function SaleReverseButton({ id, number }: SaleReverseButtonProps) {
  const t = useTranslations('sales.reverse');
  const tErrors = useTranslations('errors');
  const tCashbox = useTranslations('enums.CashboxType');
  const router = useRouter();

  function errorMessage(actionError: ActionError): string {
    const params = actionError.params ?? {};
    switch (actionError.code) {
      case 'CASHBOX_INSUFFICIENT':
        return t('cashboxInsufficient', {
          cashbox: tCashbox(params.cashbox === CashboxType.CARD ? 'CARD' : 'CASH'),
        });
      case 'DEBT_HAS_REPAYMENTS':
        return t('debtRepaid');
      case 'WAREHOUSE_IN_STOCK_COUNT':
        return t('stockCount', {
          warehouse: String(params.warehouseName ?? ''),
          number: String(params.stockCountNumber ?? ''),
        });
      case 'ENTITY_ARCHIVED':
        return t('archived', { name: String(params.name ?? '') });
      default:
        return tErrors(actionError.code);
    }
  }

  async function onReverse(reason: string): Promise<string | null> {
    const result = await reverseSale({ id, reason });
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
