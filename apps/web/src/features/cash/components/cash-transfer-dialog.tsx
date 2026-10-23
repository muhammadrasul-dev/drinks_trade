'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type ActionError, type CashboxBalance, CashboxType } from '@drinks/shared';
import {
  CASH_NOTE_MAX,
  type CashTransferInput,
  cashTransferInputSchema,
} from '@drinks/shared/schemas';
import { Button } from '@drinks/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@drinks/ui/components/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@drinks/ui/components/form';
import { Input } from '@drinks/ui/components/input';
import { toast } from '@drinks/ui/components/sonner';
import { useTranslations } from 'next-intl';
import { type ReactElement, useState, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { AmountInput, CashboxSelect } from '@/components/money-fields';
import { MoneyText } from '@/components/money-text';

import { transferCash } from '../actions';
import { cashFormError } from './cash-form-error';

/** There are exactly two cashboxes (BR-9): the target is always the other one. */
const otherCashbox = (type: CashboxType): CashboxType =>
  type === CashboxType.CASH ? CashboxType.CARD : CashboxType.CASH;

interface CashTransferDialogProps {
  balances: readonly CashboxBalance[];
  /** `YYYY-MM-DD` in the store zone: default and latest selectable date (OQ-07). */
  today: string;
  trigger: ReactElement;
}

/** Transfer between the cashboxes (T-702, FR-6.3): TRANSFER_OUT + TRANSFER_IN. */
export function CashTransferDialog({ balances, today, trigger }: CashTransferDialogProps) {
  const t = useTranslations('cash');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const tCashbox = useTranslations('enums.CashboxType');
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const defaults = (): CashTransferInput => ({
    from: CashboxType.CASH,
    to: CashboxType.CARD,
    amount: undefined as unknown as number,
    note: '',
    date: today,
  });
  const form = useForm<CashTransferInput>({
    resolver: zodResolver(cashTransferInputSchema, { error: cashFormError(tCommon) }),
    defaultValues: defaults(),
  });
  const from = useWatch({ control: form.control, name: 'from' });
  const balance = balances.find((box) => box.type === from)?.balance;

  function handleOpenChange(next: boolean) {
    if (isPending) return;
    if (next) form.reset(defaults());
    setOpen(next);
  }

  function showError(error: ActionError) {
    switch (error.code) {
      case 'CASHBOX_INSUFFICIENT':
        form.setError('amount', { message: tErrors(error.code) });
        break;
      case 'DOC_DATE_IN_FUTURE':
        form.setError('date', { message: tErrors(error.code) });
        break;
      case 'VALIDATION_FAILED':
        for (const field of ['amount', 'note', 'date', 'from'] as const) {
          if (error.fieldErrors?.[field]) form.setError(field, { message: tCommon('invalid') });
        }
        if (error.fieldErrors?.to) form.setError('from', { message: tCommon('invalid') });
        break;
      default:
        form.setError('root', { message: tErrors(error.code) });
    }
  }

  function onSubmit(values: CashTransferInput) {
    startTransition(async () => {
      const result = await transferCash(values);
      if (!result.ok) {
        showError(result.error);
        return;
      }
      toast.success(t('transfer.done'));
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('transfer.title')}</DialogTitle>
          <DialogDescription>{t('transfer.description')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="from"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('form.fromCashbox')}</FormLabel>
                    <FormControl>
                      <CashboxSelect
                        value={field.value}
                        onChange={(next) => {
                          field.onChange(next);
                          form.setValue('to', otherCashbox(next));
                        }}
                      />
                    </FormControl>
                    {balance !== undefined && (
                      <FormDescription>
                        {t('form.balance')} <MoneyText amount={balance} />
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormItem>
                <FormLabel>{t('form.toCashbox')}</FormLabel>
                <Input value={tCashbox(otherCashbox(from))} readOnly disabled />
              </FormItem>
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('form.amount')}</FormLabel>
                    <FormControl>
                      <AmountInput {...field} autoFocus />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('form.date')}</FormLabel>
                    <FormControl>
                      <Input type="date" max={today} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('form.note')}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ''}
                      autoComplete="off"
                      maxLength={CASH_NOTE_MAX}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {form.formState.errors.root && (
              <p role="alert" className="text-destructive text-sm">
                {form.formState.errors.root.message}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => handleOpenChange(false)}
              >
                {tCommon('cancel')}
              </Button>
              <Button type="submit" disabled={isPending}>
                {t('transfer.submit')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
