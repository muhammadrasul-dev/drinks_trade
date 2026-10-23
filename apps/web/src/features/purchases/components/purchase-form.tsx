'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type ActionError,
  type ProductOption,
  type PurchaseDetail,
  QtyUnit,
  type WarehouseOption,
} from '@drinks/shared';
import {
  PURCHASE_NOTE_MAX,
  type PurchaseDraftInput,
  purchaseDraftInputSchema,
} from '@drinks/shared/schemas';
import { Button } from '@drinks/ui/components/button';
import { Card, CardContent } from '@drinks/ui/components/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@drinks/ui/components/form';
import { Input } from '@drinks/ui/components/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@drinks/ui/components/select';
import { toast } from '@drinks/ui/components/sonner';
import { cn } from '@drinks/ui/lib/utils';
import { CheckCircle2Icon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState, useTransition } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { MoneyText } from '@/components/money-text';
import { Link, useRouter } from '@/i18n/navigation';
import { toNumber, toAmount } from '@/lib/number-input';

import { createPurchase, deletePurchase, postPurchase, updatePurchase } from '../actions';
import { PURCHASES_HREF } from '../list-params';
import { ProductPicker } from './product-picker';

type LineValues = PurchaseDraftInput['lines'][number];

interface PurchaseFormProps {
  /** Edit this draft; omitted → a new one. */
  purchase?: PurchaseDetail;
  /** Active products (the draft's archived ones are added from its lines). */
  products: readonly ProductOption[];
  /** Active warehouses with their active sub-warehouses. */
  warehouses: readonly WarehouseOption[];
  /** `YYYY-MM-DD` in the store zone: default and latest selectable date (OQ-07). */
  today: string;
}

const LINE_GRID =
  'lg:grid lg:grid-cols-[1.5rem_minmax(7rem,2fr)_minmax(6rem,1.4fr)_6rem_5.5rem_7rem_7rem_2.25rem] lg:items-start lg:gap-2';

function emptyLine(subWarehouseId = ''): LineValues {
  return {
    productId: '',
    subWarehouseId,
    inputUnit: QtyUnit.BLOCK,
    inputQty: undefined as unknown as number,
    inputPrice: undefined as unknown as number,
  };
}

function defaults(purchase: PurchaseDetail | undefined, today: string, firstSub: string) {
  if (!purchase) {
    return {
      docDate: today,
      note: '',
      lines: [emptyLine(firstSub)],
      paidCash: 0,
      paidCard: 0,
      paidCredit: 0,
    } satisfies PurchaseDraftInput;
  }
  return {
    docDate: purchase.docDay,
    note: purchase.note ?? '',
    lines: purchase.lines.map((line) => ({
      productId: line.product.id,
      subWarehouseId: line.subWarehouse.id,
      inputUnit: line.inputUnit,
      inputQty: line.inputQty,
      inputPrice: line.inputPrice,
    })),
    paidCash: purchase.paidCash,
    paidCard: purchase.paidCard,
    paidCredit: purchase.paidCredit,
  } satisfies PurchaseDraftInput;
}

function lineTotal(line: Partial<LineValues> | undefined): number {
  const qty = line?.inputQty ?? 0;
  const price = line?.inputPrice ?? 0;
  return Number.isFinite(qty * price) ? qty * price : 0;
}

/** UNITS_PER_BLOCK_CHANGED params: the lines whose saved pieces no longer match. */
function changedLines(params: ActionError['params']): { lineNo: number; product: string }[] {
  const lines = params?.lines;
  return Array.isArray(lines) ? (lines as { lineNo: number; product: string }[]) : [];
}

/**
 * Purchase draft form (T-404, FR-4.1): date (no future days), lines with
 * product, target sub-warehouse, unit, quantity and price per unit, payment
 * split and note. Save keeps it a draft. "Post" (T-405) acts on the saved
 * draft only, so it is disabled while the form has unsaved changes.
 */
export function PurchaseForm({ purchase, products, warehouses, today }: PurchaseFormProps) {
  const t = useTranslations('purchases');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const tUnit = useTranslations('enums.QtyUnit');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [version, setVersion] = useState(purchase?.version ?? 0);
  const [stale, setStale] = useState(false);

  const firstSub = warehouses[0]?.subWarehouses[0]?.id ?? '';
  const form = useForm<PurchaseDraftInput>({
    resolver: zodResolver(purchaseDraftInputSchema, {
      error: (issue) => {
        if (issue.code === 'invalid_type') return tCommon('required');
        if (issue.code === 'invalid_format' || issue.code === 'invalid_value')
          return tCommon('required');
        if (issue.code === 'too_small' && issue.origin === 'array') return t('form.noLines');
        if (issue.code === 'too_big' && issue.origin === 'string') return tCommon('tooLong');
        return tCommon('invalid');
      },
    }),
    defaultValues: defaults(purchase, today, firstSub),
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'lines' });
  const lines = useWatch({ control: form.control, name: 'lines' });
  const [paidCash, paidCard, paidCredit, note] = useWatch({
    control: form.control,
    name: ['paidCash', 'paidCard', 'paidCredit', 'note'],
  });

  // Products of the draft's lines that are no longer active stay pickable by name.
  const productOptions = useMemo(() => {
    const known = new Set(products.map((p) => p.id));
    const extra = (purchase?.lines ?? [])
      .filter((line) => !known.has(line.product.id))
      .map((line) => ({
        id: line.product.id,
        name: t('form.archivedOption', { name: line.product.name }),
        sku: null,
        barcode: null,
        unitsPerBlock: line.product.unitsPerBlock,
      }));
    return [...products, ...extra];
  }, [products, purchase, t]);
  const productById = useMemo(
    () => new Map(productOptions.map((p) => [p.id, p])),
    [productOptions],
  );

  const archivedSubs = useMemo(() => {
    const active = new Set(warehouses.flatMap((w) => w.subWarehouses.map((s) => s.id)));
    const seen = new Map<string, string>();
    for (const line of purchase?.lines ?? []) {
      if (!active.has(line.subWarehouse.id)) {
        seen.set(
          line.subWarehouse.id,
          `${line.subWarehouse.warehouseName} / ${line.subWarehouse.name}`,
        );
      }
    }
    return [...seen];
  }, [purchase, warehouses]);

  const { isDirty } = form.formState;
  const total = (lines ?? []).reduce((sum, line) => sum + lineTotal(line), 0);
  const paid = (paidCash ?? 0) + (paidCard ?? 0) + (paidCredit ?? 0);
  const difference = total - paid;

  function errorMessage(error: ActionError): string {
    const params = error.params ?? {};
    const name = typeof params.name === 'string' ? params.name : null;
    switch (error.code) {
      case 'ENTITY_ARCHIVED':
        return name ? t('form.archivedItem', { name }) : tErrors(error.code);
      case 'WAREHOUSE_IN_STOCK_COUNT':
        return t('post.stockCount', {
          warehouse: String(params.warehouseName ?? ''),
          number: String(params.stockCountNumber ?? ''),
        });
      case 'UNITS_PER_BLOCK_CHANGED': {
        const lines = changedLines(params);
        if (lines.length === 0) return tErrors(error.code);
        return t('post.unitsChanged', {
          lines: lines.map((line) => `${line.lineNo} (${line.product})`).join(', '),
        });
      }
      case 'CASHBOX_INSUFFICIENT':
        return t('post.cashbox', { cashbox: String(params.cashbox ?? '') });
      case 'NOTE_REQUIRED':
        return t('post.noteRequired');
      default:
        return tErrors(error.code);
    }
  }

  function onSubmit(values: PurchaseDraftInput) {
    startTransition(async () => {
      if (!purchase) {
        const result = await createPurchase(values);
        if (!result.ok) {
          form.setError('root', { message: errorMessage(result.error) });
          return;
        }
        toast.success(t('form.created', { number: result.data.number }));
        router.replace(`${PURCHASES_HREF}/${result.data.id}`);
        return;
      }
      const result = await updatePurchase({ ...values, id: purchase.id, version });
      if (!result.ok) {
        if (result.error.code === 'DOCUMENT_CHANGED') setStale(true);
        form.setError('root', { message: errorMessage(result.error) });
        return;
      }
      setVersion(result.data.version);
      form.reset(values);
      toast.success(tCommon('saved'));
      router.refresh();
    });
  }

  async function onPost(): Promise<boolean> {
    if (!purchase) return true;
    form.clearErrors('root');
    const result = await postPurchase({ id: purchase.id, version });
    if (!result.ok) {
      const code = result.error.code;
      if (code === 'DOCUMENT_CHANGED' || code === 'DOCUMENT_NOT_DRAFT') setStale(true);
      form.setError('root', { message: errorMessage(result.error) });
      return true;
    }
    toast.success(t('post.done', { number: purchase.number }));
    router.refresh();
    return true;
  }

  async function onDelete(): Promise<boolean> {
    if (!purchase) return true;
    const result = await deletePurchase({ id: purchase.id, version });
    if (!result.ok) {
      toast.error(errorMessage(result.error));
      return false;
    }
    toast.success(t('form.deleted', { number: purchase.number }));
    router.replace(PURCHASES_HREF);
    return true;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6" noValidate>
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-[12rem_1fr]">
            <FormField
              control={form.control}
              name="docDate"
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
                      maxLength={PURCHASE_NOTE_MAX}
                      placeholder={t('form.notePlaceholder')}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <section aria-labelledby="purchase-lines" className="flex flex-col gap-3">
          <h2 id="purchase-lines" className="text-lg font-semibold">
            {t('form.lines')}
          </h2>
          <div
            className={cn(LINE_GRID, 'hidden px-1 text-xs font-medium text-muted-foreground')}
            aria-hidden
          >
            <span>#</span>
            <span>{t('form.product')}</span>
            <span>{t('form.subWarehouse')}</span>
            <span>{t('form.unit')}</span>
            <span>{t('form.qty')}</span>
            <span>{t('form.price')}</span>
            <span className="text-right">{t('form.lineTotal')}</span>
            <span />
          </div>
          {fields.map((field, index) => {
            const line = lines?.[index];
            const product = line?.productId ? productById.get(line.productId) : undefined;
            const pieces =
              product && line?.inputUnit === QtyUnit.BLOCK && line.inputQty
                ? line.inputQty * product.unitsPerBlock
                : null;
            return (
              <div
                key={field.id}
                className={cn(
                  LINE_GRID,
                  'flex flex-col gap-2 rounded-md border p-3 lg:rounded-none lg:border-0 lg:border-b lg:p-1 lg:pb-2',
                )}
              >
                <span className="pt-2 text-sm text-muted-foreground tabular-nums">{index + 1}</span>
                <FormField
                  control={form.control}
                  name={`lines.${index}.productId`}
                  render={({ field: f, fieldState }) => (
                    <FormItem>
                      <FormLabel className="lg:sr-only">{t('form.product')}</FormLabel>
                      <ProductPicker
                        options={productOptions}
                        value={f.value}
                        onSelect={(id) => {
                          f.onChange(id);
                          f.onBlur();
                        }}
                        placeholder={t('form.productSearch')}
                        emptyText={t('form.noProducts')}
                        invalid={Boolean(fieldState.error)}
                        ariaLabel={t('form.product')}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`lines.${index}.subWarehouseId`}
                  render={({ field: f }) => (
                    <FormItem>
                      <FormLabel className="lg:sr-only">{t('form.subWarehouse')}</FormLabel>
                      <Select value={f.value || undefined} onValueChange={f.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder={t('form.pickSubWarehouse')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {warehouses.map((warehouse) => (
                            <SelectGroup key={warehouse.id}>
                              <SelectLabel>{warehouse.name}</SelectLabel>
                              {warehouse.subWarehouses.map((sub) => (
                                <SelectItem key={sub.id} value={sub.id}>
                                  {sub.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ))}
                          {archivedSubs.map(([id, name]) => (
                            <SelectItem key={id} value={id}>
                              {t('form.archivedOption', { name })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`lines.${index}.inputUnit`}
                  render={({ field: f }) => (
                    <FormItem>
                      <FormLabel className="lg:sr-only">{t('form.unit')}</FormLabel>
                      <Select value={f.value} onValueChange={f.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.values(QtyUnit).map((unit) => (
                            <SelectItem key={unit} value={unit}>
                              {tUnit(unit)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`lines.${index}.inputQty`}
                  render={({ field: f }) => (
                    <FormItem>
                      <FormLabel className="lg:sr-only">{t('form.qty')}</FormLabel>
                      <FormControl>
                        <Input
                          inputMode="numeric"
                          autoComplete="off"
                          name={f.name}
                          ref={f.ref}
                          onBlur={f.onBlur}
                          value={f.value ?? ''}
                          onChange={(event) => f.onChange(toNumber(event))}
                          className="tabular-nums"
                        />
                      </FormControl>
                      {pieces !== null && (
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {t('form.pieces', { count: pieces })}
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`lines.${index}.inputPrice`}
                  render={({ field: f }) => (
                    <FormItem>
                      <FormLabel className="lg:sr-only">{t('form.price')}</FormLabel>
                      <FormControl>
                        <Input
                          inputMode="numeric"
                          autoComplete="off"
                          name={f.name}
                          ref={f.ref}
                          onBlur={f.onBlur}
                          value={f.value ?? ''}
                          onChange={(event) => f.onChange(toNumber(event))}
                          className="tabular-nums"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex items-center justify-between gap-2 lg:block lg:pt-2 lg:text-right">
                  <span className="text-sm text-muted-foreground lg:sr-only">
                    {t('form.lineTotal')}
                  </span>
                  <MoneyText amount={lineTotal(line)} className="text-sm font-medium" />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="self-end lg:self-start"
                  aria-label={t('form.removeLine', { n: index + 1 })}
                  title={t('form.removeLine', { n: index + 1 })}
                  disabled={fields.length === 1}
                  onClick={() => remove(index)}
                >
                  <Trash2Icon />
                </Button>
              </div>
            );
          })}
          {form.formState.errors.lines?.root?.message && (
            <p role="alert" className="text-sm text-destructive">
              {form.formState.errors.lines.root.message}
            </p>
          )}
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => append(emptyLine(lines?.at(-1)?.subWarehouseId ?? firstSub))}
            >
              <PlusIcon />
              {t('form.addLine')}
            </Button>
          </div>
        </section>

        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-lg font-semibold">{t('form.payment')}</h2>
              <p className="text-sm">
                <span className="text-muted-foreground">{t('form.total')}: </span>
                <MoneyText amount={total} className="text-base font-semibold" />
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {(['paidCash', 'paidCard', 'paidCredit'] as const).map((name) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field: f }) => (
                    <FormItem>
                      <FormLabel>{t(`form.${name}`)}</FormLabel>
                      <FormControl>
                        <Input
                          inputMode="numeric"
                          autoComplete="off"
                          name={f.name}
                          ref={f.ref}
                          onBlur={f.onBlur}
                          value={f.value === 0 ? '' : f.value}
                          placeholder="0"
                          onChange={(event) => f.onChange(toAmount(event))}
                          className="tabular-nums"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
            <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
              {difference === 0 ? (
                <p className="text-emerald-700 dark:text-emerald-400">{t('form.splitOk')}</p>
              ) : (
                <p className="text-amber-700 dark:text-amber-400">
                  {t(difference > 0 ? 'form.splitUnder' : 'form.splitOver')}{' '}
                  <MoneyText amount={Math.abs(difference)} />
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={total === 0}
                onClick={() =>
                  form.setValue(
                    'paidCash',
                    Math.max(0, total - (paidCard ?? 0) - (paidCredit ?? 0)),
                    { shouldDirty: true },
                  )
                }
              >
                {t('form.restToCash')}
              </Button>
            </div>
            {(paidCredit ?? 0) > 0 && !note?.trim() && (
              <p className="text-sm text-amber-700 dark:text-amber-400">{t('form.creditNote')}</p>
            )}
          </CardContent>
        </Card>

        {form.formState.errors.root && (
          <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
            <span>{form.formState.errors.root.message}</span>
            {stale && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.location.reload()}
              >
                {t('form.reload')}
              </Button>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant={purchase ? 'outline' : 'default'} disabled={isPending}>
            {tCommon('save')}
          </Button>
          {purchase && (
            <ConfirmDialog
              trigger={
                <Button type="button" disabled={isPending || isDirty}>
                  <CheckCircle2Icon />
                  {t('post.button')}
                </Button>
              }
              title={t('post.title', { number: purchase.number })}
              description={t('post.description')}
              confirmLabel={t('post.button')}
              destructive
              onConfirm={onPost}
            />
          )}
          <Button asChild variant="outline">
            <Link href={PURCHASES_HREF}>{t('form.back')}</Link>
          </Button>
          {purchase && isDirty && (
            <p className="text-sm text-muted-foreground">{t('post.saveFirst')}</p>
          )}
          {purchase && (
            <ConfirmDialog
              trigger={
                <Button type="button" variant="ghost" className="ml-auto text-destructive">
                  <Trash2Icon />
                  {t('form.delete')}
                </Button>
              }
              title={t('form.deleteTitle', { number: purchase.number })}
              description={t('form.deleteDescription')}
              confirmLabel={t('form.delete')}
              destructive
              onConfirm={onDelete}
            />
          )}
        </div>
      </form>
    </Form>
  );
}
