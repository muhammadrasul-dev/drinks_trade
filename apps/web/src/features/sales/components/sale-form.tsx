'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type ActionError,
  formatSom,
  lineStock,
  QtyUnit,
  type SaleDetail,
  type SaleProductOption,
  stockKeyOf,
  unitPieces,
  type WarehouseOption,
} from '@drinks/shared';
import { SALE_NOTE_MAX, type SaleDraftInput, saleDraftInputSchema } from '@drinks/shared/schemas';
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
import { QtyText } from '@/components/qty-text';
import { ProductPicker } from '@/features/purchases/components/product-picker';
import { Link, useRouter } from '@/i18n/navigation';
import { toNumber, toAmount } from '@/lib/number-input';

import { createSale, deleteSale, postSale, updateSale } from '../actions';
import { SALES_HREF } from '../list-params';
import { useAvailability } from '../use-availability';

type LineValues = SaleDraftInput['lines'][number];

/** A line of INSUFFICIENT_STOCK / UNITS_PER_BLOCK_CHANGED / SALE_PRICE_CHANGED params. */
interface ErrorLine {
  lineNo?: number;
  subWarehouseId?: string;
  available?: number;
  required?: number;
  unitsPerBlock?: number;
  unitPrice?: number;
  salePrice?: number;
}

function errorLines(params: ActionError['params']): ErrorLine[] {
  const lines = params?.lines;
  return Array.isArray(lines) ? (lines as ErrorLine[]) : [];
}

/** Posting errors that point at lines → messages keyed by lineNo (1-based). */
type LineErrors = ReadonlyMap<number, string>;

interface SaleFormProps {
  /** Edit this draft; omitted → a new one. */
  sale?: SaleDetail;
  /** Active products with their per-piece sale price (the draft's archived ones come from its lines). */
  products: readonly SaleProductOption[];
  /** Active warehouses with their active sub-warehouses. */
  warehouses: readonly WarehouseOption[];
  /** `YYYY-MM-DD` in the store zone: default and latest selectable date (OQ-07). */
  today: string;
}

const LINE_GRID =
  'xl:grid xl:grid-cols-[1.5rem_minmax(7rem,2fr)_minmax(6rem,1.4fr)_6rem_5.5rem_6rem_7rem_7rem_2.25rem] xl:items-start xl:gap-2';

function emptyLine(subWarehouseId = ''): LineValues {
  return {
    productId: '',
    subWarehouseId,
    inputUnit: QtyUnit.BLOCK,
    inputQty: undefined as unknown as number,
  };
}

function defaults(sale: SaleDetail | undefined, today: string, firstSub: string) {
  if (!sale) {
    return {
      docDate: today,
      note: '',
      lines: [emptyLine(firstSub)],
      paidCash: 0,
      paidCard: 0,
      paidCredit: 0,
    } satisfies SaleDraftInput;
  }
  return {
    docDate: sale.docDay,
    note: sale.note ?? '',
    lines: sale.lines.map((line) => ({
      productId: line.product.id,
      subWarehouseId: line.subWarehouse.id,
      inputUnit: line.inputUnit,
      inputQty: line.inputQty,
    })),
    paidCash: sale.paidCash,
    paidCard: sale.paidCard,
    paidCredit: sale.paidCredit,
  } satisfies SaleDraftInput;
}

/** Pieces of a line (BR-1), 0 while it is incomplete. */
function piecesOf(line: Partial<LineValues> | undefined, product?: SaleProductOption): number {
  if (!line?.inputQty || !product) return 0;
  const qty = unitPieces(line.inputUnit ?? QtyUnit.PIECE, line.inputQty, product.unitsPerBlock);
  return Number.isSafeInteger(qty) ? qty : 0;
}

/**
 * Sale draft form (T-501, FR-3.1–3.3): date (no future days), lines with
 * product (name / SKU / barcode search), source sub-warehouse, unit and
 * quantity; the per-piece price comes from the product (read-only, OQ-05,
 * OQ-15). Each line shows the pair's current stock and turns red when the
 * draft needs more than that — the draft can still be saved, "Bajarish"
 * stays disabled (FR-3.3). Payment split and note as on purchases. "Bajarish"
 * (T-502) posts the saved draft; errors that name lines show under them.
 */
export function SaleForm({ sale, products, warehouses, today }: SaleFormProps) {
  const t = useTranslations('sales');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const tUnit = useTranslations('enums.QtyUnit');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [version, setVersion] = useState(sale?.version ?? 0);
  const [stale, setStale] = useState(false);
  const [lineErrors, setLineErrors] = useState<LineErrors>(new Map());

  const firstSub = warehouses[0]?.subWarehouses[0]?.id ?? '';
  const form = useForm<SaleDraftInput>({
    resolver: zodResolver(saleDraftInputSchema, {
      error: (issue) => {
        if (issue.code === 'invalid_type') return tCommon('required');
        if (issue.code === 'invalid_format' || issue.code === 'invalid_value')
          return tCommon('required');
        if (issue.code === 'too_small' && issue.origin === 'array') return t('form.noLines');
        if (issue.code === 'too_big' && issue.origin === 'string') return tCommon('tooLong');
        return tCommon('invalid');
      },
    }),
    defaultValues: defaults(sale, today, firstSub),
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'lines' });
  const lines = useWatch({ control: form.control, name: 'lines' });
  const [paidCash, paidCard, paidCredit, note] = useWatch({
    control: form.control,
    name: ['paidCash', 'paidCard', 'paidCredit', 'note'],
  });

  // Products of the draft's lines that are no longer active stay pickable by
  // name, at the price the draft saved (saving rejects them anyway).
  const productOptions = useMemo(() => {
    const known = new Set(products.map((p) => p.id));
    const extra = new Map<string, SaleProductOption>();
    for (const line of sale?.lines ?? []) {
      if (known.has(line.product.id)) continue;
      extra.set(line.product.id, {
        id: line.product.id,
        name: t('form.archivedOption', { name: line.product.name }),
        sku: null,
        barcode: null,
        unitsPerBlock: line.product.unitsPerBlock,
        salePrice: line.unitPrice,
      });
    }
    return [...products, ...extra.values()];
  }, [products, sale, t]);
  const productById = useMemo(
    () => new Map(productOptions.map((p) => [p.id, p])),
    [productOptions],
  );

  const archivedSubs = useMemo(() => {
    const active = new Set(warehouses.flatMap((w) => w.subWarehouses.map((s) => s.id)));
    const seen = new Map<string, string>();
    for (const line of sale?.lines ?? []) {
      if (!active.has(line.subWarehouse.id)) {
        seen.set(
          line.subWarehouse.id,
          `${line.subWarehouse.warehouseName} / ${line.subWarehouse.name}`,
        );
      }
    }
    return [...seen];
  }, [sale, warehouses]);

  // Complete lines → pieces and price; the stock check runs on those.
  const computed = (lines ?? []).map((line) => {
    const product = line?.productId ? productById.get(line.productId) : undefined;
    const qty = piecesOf(line, product);
    const ready = Boolean(product && line?.subWarehouseId && qty > 0);
    return {
      product,
      qty,
      ready,
      key: ready
        ? stockKeyOf({ subWarehouseId: line.subWarehouseId, productId: line.productId })
        : '',
      lineTotal: product ? qty * product.salePrice : 0,
    };
  });
  const keys = [...new Set(computed.filter((c) => c.ready).map((c) => c.key))].sort();
  const known = useAvailability(sale, keys);
  const readyLines = computed.filter((c) => c.ready && known.has(c.key));
  const stockByLine = new Map(
    lineStock(
      readyLines.map((c) => {
        const [subWarehouseId = '', productId = ''] = c.key.split(':');
        return { subWarehouseId, productId, qty: c.qty };
      }),
      (key) => known.get(stockKeyOf(key)) ?? 0,
    ).map((stock, index) => [readyLines[index]!, stock]),
  );
  const stockShort = [...stockByLine.values()].some((stock) => stock.short);

  const { isDirty } = form.formState;
  const total = computed.reduce((sum, c) => sum + c.lineTotal, 0);
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
      case 'NOTE_REQUIRED':
        return t('post.noteRequired');
      case 'PAYMENT_SPLIT_MISMATCH':
        return t('post.splitMismatch');
      default:
        return tErrors(error.code);
    }
  }

  /** INSUFFICIENT_STOCK, UNITS_PER_BLOCK_CHANGED and SALE_PRICE_CHANGED name their lines. */
  function lineErrorsOf(error: ActionError): LineErrors {
    const subName = (id: string | undefined) =>
      sale?.lines.find((line) => line.subWarehouse.id === id)?.subWarehouse.name ?? '';
    const messages = new Map<number, string>();
    for (const line of errorLines(error.params)) {
      if (line.lineNo === undefined) continue;
      switch (error.code) {
        case 'INSUFFICIENT_STOCK':
          messages.set(
            line.lineNo,
            t('post.lineShort', {
              subWarehouse: subName(line.subWarehouseId),
              available: line.available ?? 0,
              required: line.required ?? 0,
            }),
          );
          break;
        case 'UNITS_PER_BLOCK_CHANGED':
          messages.set(
            line.lineNo,
            t('post.lineUnitsChanged', { unitsPerBlock: line.unitsPerBlock ?? 0 }),
          );
          break;
        case 'SALE_PRICE_CHANGED':
          messages.set(
            line.lineNo,
            t('post.linePriceChanged', {
              unitPrice: formatSom(line.unitPrice ?? 0, tCommon('som')),
              salePrice: formatSom(line.salePrice ?? 0, tCommon('som')),
            }),
          );
          break;
      }
    }
    return messages;
  }

  function onSubmit(values: SaleDraftInput) {
    startTransition(async () => {
      if (!sale) {
        const result = await createSale(values);
        if (!result.ok) {
          form.setError('root', { message: errorMessage(result.error) });
          return;
        }
        toast.success(t('form.created', { number: result.data.number }));
        router.replace(`${SALES_HREF}/${result.data.id}`);
        return;
      }
      const result = await updateSale({ ...values, id: sale.id, version });
      if (!result.ok) {
        const code = result.error.code;
        if (code === 'DOCUMENT_CHANGED' || code === 'DOCUMENT_NOT_DRAFT') setStale(true);
        form.setError('root', { message: errorMessage(result.error) });
        return;
      }
      setVersion(result.data.version);
      setLineErrors(new Map());
      form.reset(values);
      toast.success(tCommon('saved'));
      router.refresh();
    });
  }

  async function onPost(): Promise<boolean> {
    if (!sale) return true;
    form.clearErrors('root');
    setLineErrors(new Map());
    const result = await postSale({ id: sale.id, version });
    if (!result.ok) {
      const code = result.error.code;
      if (code === 'DOCUMENT_CHANGED' || code === 'DOCUMENT_NOT_DRAFT') setStale(true);
      const byLine = lineErrorsOf(result.error);
      setLineErrors(byLine);
      form.setError('root', {
        message: byLine.size > 0 ? t('post.failed') : errorMessage(result.error),
      });
      return true;
    }
    toast.success(t('post.done', { number: sale.number }));
    router.refresh();
    return true;
  }

  async function onDelete(): Promise<boolean> {
    if (!sale) return true;
    const result = await deleteSale({ id: sale.id, version });
    if (!result.ok) {
      toast.error(errorMessage(result.error));
      return false;
    }
    toast.success(t('form.deleted', { number: sale.number }));
    router.replace(SALES_HREF);
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
                      maxLength={SALE_NOTE_MAX}
                      placeholder={t('form.notePlaceholder')}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <section aria-labelledby="sale-lines" className="flex flex-col gap-3">
          <h2 id="sale-lines" className="text-lg font-semibold">
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
            <span>{t('form.available')}</span>
            <span className="text-right">{t('form.lineTotal')}</span>
            <span />
          </div>
          {fields.map((field, index) => {
            const line = lines?.[index];
            const c = computed[index];
            const product = c?.product;
            const stock = c ? stockByLine.get(c) : undefined;
            const available = c?.ready ? known.get(c.key) : undefined;
            // Posting errors refer to the saved lines; once the form changes they are stale.
            const postError = isDirty ? undefined : lineErrors.get(index + 1);
            return (
              <div
                key={field.id}
                className={cn(
                  LINE_GRID,
                  'flex flex-col gap-2 rounded-md border p-3 xl:rounded-none xl:border-0 xl:border-b xl:p-1 xl:pb-2',
                  (stock?.short || postError) && 'border-destructive/60 bg-destructive/5',
                )}
              >
                <span className="pt-2 text-sm text-muted-foreground tabular-nums">{index + 1}</span>
                <FormField
                  control={form.control}
                  name={`lines.${index}.productId`}
                  render={({ field: f, fieldState }) => (
                    <FormItem>
                      <FormLabel className="xl:sr-only">{t('form.product')}</FormLabel>
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
                      <FormLabel className="xl:sr-only">{t('form.subWarehouse')}</FormLabel>
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
                      <FormLabel className="xl:sr-only">{t('form.unit')}</FormLabel>
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
                      <FormLabel className="xl:sr-only">{t('form.qty')}</FormLabel>
                      <FormControl>
                        <Input
                          inputMode="numeric"
                          autoComplete="off"
                          name={f.name}
                          ref={f.ref}
                          onBlur={f.onBlur}
                          value={f.value ?? ''}
                          onChange={(event) => f.onChange(toNumber(event))}
                          aria-invalid={stock?.short || undefined}
                          className="tabular-nums"
                        />
                      </FormControl>
                      {line?.inputUnit === QtyUnit.BLOCK && c && c.qty > 0 && (
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {t('form.pieces', { count: c.qty })}
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex items-center justify-between gap-2 text-sm xl:block xl:pt-2">
                  <span className="text-muted-foreground xl:sr-only">{t('form.price')}</span>
                  {product ? (
                    <MoneyText amount={product.salePrice} />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 text-sm xl:block xl:pt-2">
                  <span className="text-muted-foreground xl:sr-only">{t('form.available')}</span>
                  {product && available !== undefined ? (
                    <span className={cn(stock?.short && 'font-medium text-destructive')}>
                      <QtyText qty={available} unitsPerBlock={product.unitsPerBlock} />
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 xl:block xl:pt-2 xl:text-right">
                  <span className="text-sm text-muted-foreground xl:sr-only">
                    {t('form.lineTotal')}
                  </span>
                  <MoneyText amount={c?.lineTotal ?? 0} className="text-sm font-medium" />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="self-end xl:self-start"
                  aria-label={t('form.removeLine', { n: index + 1 })}
                  title={t('form.removeLine', { n: index + 1 })}
                  disabled={fields.length === 1}
                  onClick={() => remove(index)}
                >
                  <Trash2Icon />
                </Button>
                {postError && (
                  <p role="alert" className="text-sm text-destructive xl:col-span-8 xl:col-start-2">
                    {postError}
                  </p>
                )}
                {!postError && stock?.short && product && (
                  <p role="alert" className="text-sm text-destructive xl:col-span-8 xl:col-start-2">
                    {t('form.short', {
                      available: stock.available,
                      required: stock.required,
                    })}
                  </p>
                )}
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
          <Button type="submit" variant={sale ? 'outline' : 'default'} disabled={isPending}>
            {tCommon('save')}
          </Button>
          {sale && (
            <ConfirmDialog
              trigger={
                <Button type="button" disabled={isPending || isDirty || stockShort}>
                  <CheckCircle2Icon />
                  {t('post.button')}
                </Button>
              }
              title={t('post.title', { number: sale.number })}
              description={t('post.description')}
              confirmLabel={t('post.button')}
              onConfirm={onPost}
            />
          )}
          <Button asChild variant="outline">
            <Link href={SALES_HREF}>{t('form.back')}</Link>
          </Button>
          {stockShort ? (
            <p className="text-sm text-destructive">{t('post.short')}</p>
          ) : (
            sale &&
            isDirty && <p className="text-sm text-muted-foreground">{t('post.saveFirst')}</p>
          )}
          {sale && (
            <ConfirmDialog
              trigger={
                <Button type="button" variant="ghost" className="ml-auto text-destructive">
                  <Trash2Icon />
                  {t('form.delete')}
                </Button>
              }
              title={t('form.deleteTitle', { number: sale.number })}
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
