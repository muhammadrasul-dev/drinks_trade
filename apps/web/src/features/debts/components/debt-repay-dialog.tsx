'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type ActionError, CashboxType, type DebtListItem, storeDateOf } from '@drinks/shared';
import { DEBT_NOTE_MAX, type DebtRepayInput, debtRepayInputSchema } from '@drinks/shared/schemas';
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@drinks/ui/components/form';
import { Input } from '@drinks/ui/components/input';
import { toast } from '@drinks/ui/components/sonner';
import { useTranslations } from 'next-intl';
import { type ReactElement, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { AmountInput, CashboxSelect } from '@/components/money-fields';
import { MoneyText } from '@/components/money-text';

import { repayDebt } from '../actions';

interface DebtRepayDialogProps {
  debt: DebtListItem;
  /** `YYYY-MM-DD` in the store zone: default and latest selectable date (OQ-07). */
  today: string;
  trigger: ReactElement;
}

/**
 * Repayment of an OPEN debt (FR-7.2, business-logic §7) into / out of the
 * cashbox the user picks; the amount defaults to the whole remainder.
 */
export function DebtRepayDialog({ debt, today, trigger }: DebtRepayDialogProps) {
  const t = useTranslations('debts');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const kind = debt.direction === 'RECEIVABLE' ? 'toMe' : 'byMe';
  const debtDay = storeDateOf(debt.debtDate);

  const defaults = (): DebtRepayInput => ({
    debtId: debt.id,
    cashbox: CashboxType.CASH,
    amount: debt.remaining,
    note: '',
    date: today,
  });
  const form = useForm<DebtRepayInput>({
    resolver: zodResolver(debtRepayInputSchema, {
      error: (issue) => {
        if (issue.code === 'too_big' && issue.origin === 'string') return tCommon('tooLong');
        if (issue.code === 'invalid_type' || issue.code === 'invalid_format') {
          return tCommon('required');
        }
        return tCommon('invalid');
      },
    }),
    defaultValues: defaults(),
  });

  function handleOpenChange(next: boolean) {
    if (isPending) return;
    if (next) form.reset(defaults());
    setOpen(next);
  }

  function showError(error: ActionError) {
    switch (error.code) {
      case 'DEBT_OVERPAYMENT':
        form.setError('amount', { message: tErrors(error.code) });
        break;
      case 'CASHBOX_INSUFFICIENT':
        form.setError('cashbox', { message: tErrors(error.code) });
        break;
      case 'DOC_DATE_IN_FUTURE':
        form.setError('date', { message: tErrors(error.code) });
        break;
      case 'VALIDATION_FAILED':
        if (error.params?.reason === 'BEFORE_DEBT_DATE') {
          form.setError('date', { message: t('repay.beforeDebtDate') });
          break;
        }
        for (const field of ['amount', 'note', 'date', 'cashbox'] as const) {
          if (error.fieldErrors?.[field]) form.setError(field, { message: tCommon('invalid') });
        }
        break;
      default:
        form.setError('root', { message: tErrors(error.code) });
    }
  }

  function onSubmit(values: DebtRepayInput) {
    if (values.amount > debt.remaining) {
      form.setError('amount', { message: tErrors('DEBT_OVERPAYMENT') });
      return;
    }
    startTransition(async () => {
      const result = await repayDebt(values);
      if (!result.ok) {
        showError(result.error);
        return;
      }
      toast.success(t(result.data.status === 'CLOSED' ? 'repay.closed' : 'repay.done'));
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`repay.${kind}.title`)}</DialogTitle>
          <DialogDescription className="break-words">{debt.note}</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-muted-foreground">{t('columns.amount')}</dt>
            <dd>
              <MoneyText amount={debt.amount} />
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('columns.repaid')}</dt>
            <dd>
              <MoneyText amount={debt.repaidAmount} />
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('columns.remaining')}</dt>
            <dd className="font-semibold">
              <MoneyText amount={debt.remaining} />
            </dd>
          </div>
        </dl>
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
                    <FormLabel>{t(`repay.${kind}.cashbox`)}</FormLabel>
                    <FormControl>
                      <CashboxSelect value={field.value} onChange={field.onChange} />
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
                      <Input type="date" min={debtDay} max={today} {...field} />
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
                  <FormLabel>{t('form.repayNote')}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ''}
                      autoComplete="off"
                      maxLength={DEBT_NOTE_MAX}
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
                {t('repay.submit')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
