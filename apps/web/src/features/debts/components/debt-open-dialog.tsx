'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type ActionError, CashboxType, type DebtDirection } from '@drinks/shared';
import { DEBT_NOTE_MAX, type DebtOpenInput, debtOpenInputSchema } from '@drinks/shared/schemas';
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

import { openDebt } from '../actions';
import { AmountInput, CashboxSelect } from './debt-fields';

interface DebtOpenDialogProps {
  /** RECEIVABLE = give (cash OUT), PAYABLE = take (cash IN). */
  direction: DebtDirection;
  /** `YYYY-MM-DD` in the store zone: default and latest selectable date (OQ-07). */
  today: string;
  trigger: ReactElement;
}

/** Give or take a debt by hand (T-704, business-logic §7): one cash entry + an OPEN debt. */
export function DebtOpenDialog({ direction, today, trigger }: DebtOpenDialogProps) {
  const t = useTranslations('debts');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const kind = direction === 'RECEIVABLE' ? 'give' : 'take';

  const defaults = (): DebtOpenInput => ({
    direction,
    cashbox: CashboxType.CASH,
    amount: undefined as unknown as number,
    note: '',
    date: today,
  });
  const form = useForm<DebtOpenInput>({
    resolver: zodResolver(debtOpenInputSchema, {
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
      case 'NOTE_REQUIRED':
        form.setError('note', { message: tErrors(error.code) });
        break;
      case 'CASHBOX_INSUFFICIENT':
        form.setError('cashbox', { message: tErrors(error.code) });
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

  function onSubmit(values: DebtOpenInput) {
    // BR-10: the note stands in for the counterparty; the server checks it too.
    if (values.note.trim() === '') {
      form.setError('note', { message: tErrors('NOTE_REQUIRED') });
      return;
    }
    startTransition(async () => {
      const result = await openDebt(values);
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
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('form.note')}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      autoFocus
                      autoComplete="off"
                      maxLength={DEBT_NOTE_MAX}
                      placeholder={t('form.notePlaceholder')}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('form.amount')}</FormLabel>
                    <FormControl>
                      <AmountInput {...field} />
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
                    <FormLabel>{t(`${kind}.cashbox`)}</FormLabel>
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
                      <Input type="date" max={today} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
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
