'use client';

import type { ActionError } from '@drinks/shared';
import { REVERSE_REASON_MAX } from '@drinks/shared/schemas';
import { Button } from '@drinks/ui/components/button';
import { Input } from '@drinks/ui/components/input';
import { Label } from '@drinks/ui/components/label';
import { toast } from '@drinks/ui/components/sonner';
import { Undo2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { useRouter } from '@/i18n/navigation';

import { reversePurchase } from '../actions';

interface PurchaseReverseButtonProps {
  id: string;
  number: string;
}

/**
 * "Storno" on a posted purchase (T-406, BR-3): OWNER only — the page renders
 * it for `document.reverse` holders and the service checks again. The reason
 * is required; a blocked reversal keeps the dialog open with the message.
 */
export function PurchaseReverseButton({ id, number }: PurchaseReverseButtonProps) {
  const t = useTranslations('purchases.reverse');
  const tErrors = useTranslations('errors');
  const router = useRouter();
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

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

  async function onConfirm(): Promise<boolean> {
    setError(null);
    const result = await reversePurchase({ id, reason });
    if (!result.ok) {
      setError(errorMessage(result.error));
      return false;
    }
    toast.success(t('done', { number }));
    router.refresh();
    return true;
  }

  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="outline" className="text-destructive">
          <Undo2Icon />
          {t('button')}
        </Button>
      }
      title={t('title', { number })}
      description={t('description')}
      confirmLabel={t('button')}
      confirmDisabled={reason.trim() === ''}
      destructive
      onConfirm={onConfirm}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={reasonId}>{t('reason')}</Label>
        <Input
          id={reasonId}
          value={reason}
          maxLength={REVERSE_REASON_MAX}
          placeholder={t('reasonPlaceholder')}
          aria-invalid={error !== null}
          onChange={(event) => {
            setReason(event.target.value);
            setError(null);
          }}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </ConfirmDialog>
  );
}
