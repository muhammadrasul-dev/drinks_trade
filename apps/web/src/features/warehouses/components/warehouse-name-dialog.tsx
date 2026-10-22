'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { ActionError } from '@drinks/shared';
import { type WarehouseCreateInput, warehouseCreateInputSchema } from '@drinks/shared/schemas';
import { Button } from '@drinks/ui/components/button';
import {
  Dialog,
  DialogContent,
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

import {
  createSubWarehouse,
  createWarehouse,
  renameSubWarehouse,
  renameWarehouse,
} from '../actions';

export type WarehouseLevel = 'warehouse' | 'subWarehouse';

interface WarehouseNameDialogProps {
  level: WarehouseLevel;
  /** Rename this node; omitted → create a new one. */
  item?: { id: string; name: string };
  /** The parent of a new sub-warehouse. */
  warehouseId?: string;
  trigger: ReactElement;
}

/** Create / rename dialog for a warehouse or a sub-warehouse (T-304). */
export function WarehouseNameDialog({
  level,
  item,
  warehouseId,
  trigger,
}: WarehouseNameDialogProps) {
  const t = useTranslations('warehouses');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const form = useForm<WarehouseCreateInput>({
    resolver: zodResolver(warehouseCreateInputSchema, {
      error: (issue) => (issue.code === 'too_big' ? tCommon('tooLong') : tCommon('required')),
    }),
    defaultValues: { name: item?.name ?? '' },
  });

  function handleOpenChange(next: boolean) {
    if (isPending) return;
    if (next) form.reset({ name: item?.name ?? '' });
    setOpen(next);
  }

  function showError(error: ActionError) {
    if (error.code === 'DUPLICATE_VALUE') {
      const message = error.params?.archived ? t('duplicateArchived') : tErrors(error.code);
      form.setError('name', { message });
    } else if (error.code === 'VALIDATION_FAILED' && error.fieldErrors?.name) {
      form.setError('name', { message: tCommon('required') });
    } else if (error.code === 'ENTITY_ARCHIVED') {
      form.setError('root', { message: t('parentArchived') });
    } else {
      form.setError('root', { message: tErrors(error.code) });
    }
  }

  function submit({ name }: WarehouseCreateInput) {
    if (item) {
      return level === 'warehouse'
        ? renameWarehouse({ id: item.id, name })
        : renameSubWarehouse({ id: item.id, name });
    }
    return level === 'warehouse'
      ? createWarehouse({ name })
      : createSubWarehouse({ warehouseId, name });
  }

  function onSubmit(values: WarehouseCreateInput) {
    startTransition(async () => {
      const result = await submit(values);
      if (!result.ok) {
        showError(result.error);
        return;
      }
      toast.success(tCommon('saved'));
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(item ? `${level}.editTitle` : `${level}.add`)}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('name')}</FormLabel>
                  <FormControl>
                    <Input autoFocus autoComplete="off" maxLength={100} {...field} />
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
                {tCommon('save')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
