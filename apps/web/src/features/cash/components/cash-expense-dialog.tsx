'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type ActionError, type CashboxBalance, CashboxType } from '@drinks/shared';
import {
  CASH_NOTE_MAX,
  type CashExpenseInput,
  cashExpenseInputSchema,
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

import { addOtherExpense, addTravelExpense } from '../actions';
import { cashFormError } from './cash-form-error';

interface CashExpenseDialogProps {
  /** travel = TRAVEL_EXPENSE (note optional), other = OTHER_EXPENSE (note required, FR-6.2). */
  kind: 'travel' | 'other';
  balances: readonly CashboxBalance[];
  /** `YYYY-MM-DD` in the store zone: default and latest selectable date (OQ-07). */
  today: string;
  trigger: ReactElement;
}

/** Travel or other expense (T-702, business-logic §7): one cash OUT entry. */
export function CashExpenseDialog({ kind, balances, today, trigger }: CashExpenseDialogProps) {
  const t = useTranslations('cash');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const noteRequired = kind === 'other';

  const defaults = (): CashExpenseInput => ({
    cashbox: CashboxType.CASH,
    amount: undefined as unknown as number,
    note: '',
    date: today,
  });
  const form = useForm<CashExpenseInput>({
    resolver: zodResolver(cashExpenseInputSchema, { error: cashFormError(tCommon) }),
    defaultValues: defaults(),
  });
  const cashbox = useWatch({ control: form.control, name: 'cashbox' });
  const balance = balances.find((box) => box.type === cashbox)?.balance;

  function handleOpenChange(next: boolean) {
    if (isPending) return;
    if (next) form.reset(defaults());
    setOpen(next);
  }

  function showError(error: ActionError) {
    switch (error.code) {
      case 'NOTE_REQUIRED':
        form.setError('note', { message: tErrors(error.code) });
        break;
      case 'CASHBOX_INSUFFICIENT':
        form.setError('amount', { message: tErrors(error.code) });
        break;
      case 'DOC_DATE_IN_FUTURE':
        form.setError('date', { message: tErrors(error.code) });
        break;
      case 'VALIDATION_FAILED':
        for (const field of ['amount', 'note', 'date', 'cashbox'] as const) {
          if (error.fieldErrors?.[field]) form.setError(field, { message: tCommon('invalid') });
        }
        break;
      default:
        form.setError('root', { message: tErrors(error.code) });
    }
  }

  function onSubmit(values: CashExpenseInput) {
    // FR-6.2: other expense needs a note; the server checks it too.
    if (noteRequired && !values.note?.trim()) {
      form.setError('note', { message: tErrors('NOTE_REQUIRED') });
      return;
    }
    startTransition(async () => {
      const result = await (kind === 'travel' ? addTravelExpense : addOtherExpense)(values);
      if (!result.ok) {
        showError(result.error);
        return;
      }
      toast.success(t(`${kind}.done`));
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`${kind}.title`)}</DialogTitle>
          <DialogDescription>{t(`${kind}.description`)}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
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
                name="cashbox"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('form.fromCashbox')}</FormLabel>
                    <FormControl>
                      <CashboxSelect value={field.value} onChange={field.onChange} />
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
                  <FormLabel>{t(noteRequired ? 'form.noteRequired' : 'form.note')}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ''}
                      autoComplete="off"
                      maxLength={CASH_NOTE_MAX}
                      placeholder={t(`${kind}.notePlaceholder`)}
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
                {t(`${kind}.submit`)}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
