'use client';

import { CashboxType, type CashJournalEntry, CashTxType, formatSom } from '@drinks/shared';
import { CASH_NOTE_MAX } from '@drinks/shared/schemas';
import { Button } from '@drinks/ui/components/button';
import { Input } from '@drinks/ui/components/input';
import { Label } from '@drinks/ui/components/label';
import { toast } from '@drinks/ui/components/sonner';
import { Undo2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { useRouter } from '@/i18n/navigation';

import { reverseCashEntry } from '../actions';

/**
 * "Storno" on a manual journal entry (T-703, OQ-08): travel/other expense, or
 * a transfer — both sides go back together. The page is OWNER only and the
 * service checks again; a blocked reversal (e.g. the transfer's target
 * cashbox no longer holds the amount) keeps the dialog open with the message.
 */
export function CashReverseButton({ entry }: { entry: CashJournalEntry }) {
  const t = useTranslations('cash.reverse');
  const tCommon = useTranslations('common');
  const tCashbox = useTranslations('enums.CashboxType');
  const tErrors = useTranslations('errors');
  const router = useRouter();
  const noteId = useId();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const amount = formatSom(entry.amount, tCommon('som'));
  const isTransfer =
    entry.type === CashTxType.TRANSFER_OUT || entry.type === CashTxType.TRANSFER_IN;
  let description: string;
  if (isTransfer) {
    const other = entry.cashbox.type === CashboxType.CASH ? CashboxType.CARD : CashboxType.CASH;
    const [from, to] =
      entry.type === CashTxType.TRANSFER_OUT
        ? [entry.cashbox.type, other]
        : [other, entry.cashbox.type];
    description = t('descriptionTransfer', { amount, from: tCashbox(from), to: tCashbox(to) });
  } else {
    description = t('description', { amount, cashbox: tCashbox(entry.cashbox.type) });
  }

  async function onConfirm(): Promise<boolean> {
    setError(null);
    const result = await reverseCashEntry({ id: entry.id, note });
    if (!result.ok) {
      setError(tErrors(result.error.code));
      return false;
    }
    toast.success(t('done', { id: entry.id }));
    setNote('');
    router.refresh();
    return true;
  }

  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="ghost" size="sm" className="text-destructive">
          <Undo2Icon />
          {t('button')}
        </Button>
      }
      title={t('title', { id: entry.id })}
      description={description}
      confirmLabel={t('button')}
      destructive
      onConfirm={onConfirm}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={noteId}>{t('note')}</Label>
        <Input
          id={noteId}
          value={note}
          maxLength={CASH_NOTE_MAX}
          placeholder={t('notePlaceholder')}
          onChange={(event) => {
            setNote(event.target.value);
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
