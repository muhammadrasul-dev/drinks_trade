'use client';

import type { ActionError, WarehouseOption } from '@drinks/shared';
import { STOCK_COUNT_NOTE_MAX } from '@drinks/shared/schemas';
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
import { Input } from '@drinks/ui/components/input';
import { Label } from '@drinks/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@drinks/ui/components/select';
import { toast } from '@drinks/ui/components/sonner';
import { ClipboardListIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState, useTransition } from 'react';

import { useRouter } from '@/i18n/navigation';

import { openStockCount } from '../actions';
import { STOCK_COUNTS_HREF } from '../list-params';

interface StockCountOpenDialogProps {
  /** Active warehouses; one with an open count is shown but disabled. */
  warehouses: readonly WarehouseOption[];
  /** warehouse id → number of its open count. */
  openByWarehouse: Readonly<Record<string, string>>;
  /** `YYYY-MM-DD` in the store zone: default and latest selectable date (OQ-07). */
  today: string;
}

/**
 * "New stock count" (T-601, §6.1): pick a warehouse, date and note. The
 * warning says what opening does — posting in that warehouse stops (BR-8).
 */
export function StockCountOpenDialog({
  warehouses,
  openByWarehouse,
  today,
}: StockCountOpenDialogProps) {
  const t = useTranslations('stockCounts.open');
  const tErrors = useTranslations('errors');
  const router = useRouter();
  const ids = { warehouse: useId(), date: useId(), note: useId() };
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [warehouseId, setWarehouseId] = useState('');
  const [docDate, setDocDate] = useState(today);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    if (isPending) return;
    if (next) {
      setWarehouseId(warehouses.find((w) => !openByWarehouse[w.id])?.id ?? '');
      setDocDate(today);
      setNote('');
      setError(null);
    }
    setOpen(next);
  }

  function message(actionError: ActionError): string {
    const params = actionError.params ?? {};
    if (actionError.code === 'STOCK_COUNT_ALREADY_OPEN' && params.stockCountNumber) {
      return t('alreadyOpen', {
        warehouse: String(params.warehouseName ?? ''),
        number: String(params.stockCountNumber),
      });
    }
    return tErrors(actionError.code);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await openStockCount({ warehouseId, docDate, note });
      if (!result.ok) {
        setError(message(result.error));
        return;
      }
      toast.success(t('done', { number: result.data.number }));
      setOpen(false);
      router.push(`${STOCK_COUNTS_HREF}/${result.data.id}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <ClipboardListIcon />
          {t('button')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={ids.warehouse}>{t('warehouse')}</Label>
            <Select value={warehouseId || undefined} onValueChange={setWarehouseId}>
              <SelectTrigger id={ids.warehouse} className="w-full">
                <SelectValue placeholder={t('pickWarehouse')} />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((warehouse) => {
                  const number = openByWarehouse[warehouse.id];
                  return (
                    <SelectItem key={warehouse.id} value={warehouse.id} disabled={Boolean(number)}>
                      {number ? t('busyOption', { name: warehouse.name, number }) : warehouse.name}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={ids.date}>{t('date')}</Label>
            <Input
              id={ids.date}
              type="date"
              max={today}
              value={docDate}
              onChange={(event) => setDocDate(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={ids.note}>{t('note')}</Label>
            <Input
              id={ids.note}
              value={note}
              maxLength={STOCK_COUNT_NOTE_MAX}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={isPending || !warehouseId || !docDate}>
              {t('submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
