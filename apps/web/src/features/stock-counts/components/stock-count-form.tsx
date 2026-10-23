'use client';

import {
  type ActionError,
  costAmount,
  countTotals,
  type ProductOption,
  splitPieces,
  type StockCountDetail,
  type StockCountRow,
  toPieces,
} from '@drinks/shared';
import { STOCK_COUNT_NOTE_MAX, STOCK_COUNT_QTY_MAX } from '@drinks/shared/schemas';
import { Button } from '@drinks/ui/components/button';
import { Card, CardContent } from '@drinks/ui/components/card';
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
import { cn } from '@drinks/ui/lib/utils';
import { CheckCircle2Icon, PlusIcon, SearchIcon, XCircleIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useMemo, useState, useTransition } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { MoneyText } from '@/components/money-text';
import { QtyText } from '@/components/qty-text';
import { useRouter } from '@/i18n/navigation';
import { ProductPicker } from '@/features/purchases/components/product-picker';

import { cancelStockCount, postStockCount, updateStockCount } from '../actions';

interface StockCountFormProps {
  count: StockCountDetail;
  /** Active products, for "add a row" (extra goods found). */
  products: readonly ProductOption[];
  /** Active sub-warehouses of the counted warehouse. */
  subWarehouses: readonly { id: string; name: string }[];
  /** `YYYY-MM-DD` in the store zone: latest selectable date (OQ-07). */
  today: string;
}

/** What the user typed in one row; both empty = not counted (OQ-13). */
interface Entry {
  blocks: string;
  pieces: string;
}

type FormRow = Omit<StockCountRow, 'countedQty' | 'diffQty' | 'diffAmount'>;

const keyOf = (row: { subWarehouse: { id: string }; product: { id: string } }) =>
  `${row.subWarehouse.id}:${row.product.id}`;

const ROW_GRID =
  'lg:grid lg:grid-cols-[minmax(10rem,2fr)_7rem_5rem_5rem_7rem_7rem] lg:items-center lg:gap-3';

function entryOf(row: StockCountRow): Entry {
  if (row.countedQty === null) return { blocks: '', pieces: '' };
  const { blocks, pieces } = splitPieces(row.countedQty, row.product.unitsPerBlock);
  return { blocks: String(blocks), pieces: String(pieces) };
}

function isCounted(entry: Entry | undefined): entry is Entry {
  return Boolean(entry && (entry.blocks !== '' || entry.pieces !== ''));
}

function countedQty(entry: Entry, unitsPerBlock: number): number {
  return toPieces(Number(entry.blocks || 0), Number(entry.pieces || 0), unitsPerBlock);
}

/** Digits only, capped like the schema (STOCK_COUNT_QTY_MAX). */
function digits(value: string): string {
  const cleaned = value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return cleaned !== '' && Number(cleaned) > STOCK_COUNT_QTY_MAX
    ? String(STOCK_COUNT_QTY_MAX)
    : cleaned;
}

/**
 * The counting form of an open stock count (T-601, FR-5.1): every
 * sub-warehouse × product with stock, grouped by sub-warehouse, with the
 * system qty, block + piece inputs and the live difference. A row left empty
 * is not counted and keeps its balance (OQ-13); "0" is a count. Extra goods
 * are added as rows. Amounts appear only when the server sent them (OWNER).
 * "Bajarish" (T-602) posts the saved count after a confirmation that names
 * the uncounted rows.
 */
export function StockCountForm({ count, products, subWarehouses, today }: StockCountFormProps) {
  const t = useTranslations('stockCounts');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const router = useRouter();
  const ids = { date: useId(), note: useId(), search: useId(), sub: useId() };
  const [isPending, startTransition] = useTransition();
  const [version, setVersion] = useState(count.version);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const [docDate, setDocDate] = useState(count.docDay);
  const [note, setNote] = useState(count.note ?? '');
  const [rows, setRows] = useState<FormRow[]>(count.rows);
  const [entries, setEntries] = useState<Record<string, Entry>>(() =>
    Object.fromEntries(count.rows.map((row) => [keyOf(row), entryOf(row)])),
  );
  const [search, setSearch] = useState('');
  const [addSub, setAddSub] = useState(subWarehouses[0]?.id ?? '');
  const [addProduct, setAddProduct] = useState('');

  const showAmounts = count.estimate !== undefined;
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  function touch() {
    setDirty(true);
    setError(null);
  }

  function setEntry(key: string, patch: Partial<Entry>) {
    setEntries((current) => ({
      ...current,
      [key]: { ...(current[key] ?? { blocks: '', pieces: '' }), ...patch },
    }));
    touch();
  }

  function addRow() {
    const product = productById.get(addProduct);
    const sub = subWarehouses.find((s) => s.id === addSub);
    if (!product || !sub) return;
    const key = `${sub.id}:${product.id}`;
    if (!rows.some((row) => keyOf(row) === key)) {
      setRows((current) => [
        ...current,
        {
          subWarehouse: { id: sub.id, name: sub.name, archived: false },
          product: { ...product, archived: false },
          systemQty: null,
        },
      ]);
    }
    setEntries((current) => ({
      ...current,
      [key]: current[key] ?? { blocks: '', pieces: '0' },
    }));
    setAddProduct('');
    setSearch('');
    touch();
  }

  // Live per-row figures from the inputs.
  const computed = rows.map((row) => {
    const entry = entries[keyOf(row)];
    const counted = isCounted(entry) ? countedQty(entry, row.product.unitsPerBlock) : null;
    const diff = counted !== null && row.systemQty !== null ? counted - row.systemQty : null;
    const amount =
      diff !== null && row.avgCost !== undefined ? costAmount(diff, row.avgCost) : null;
    return { row, key: keyOf(row), entry, counted, diff, amount };
  });
  const countedRows = computed.filter((item) => item.counted !== null).length;
  const uncounted = computed.length - countedRows;

  // BR-8 estimate, as the server computes it on posting.
  const estimate = showAmounts
    ? countTotals(
        computed.flatMap(({ row, diff }) =>
          diff === null || row.avgCost === undefined
            ? []
            : [{ productId: row.product.id, diffQty: diff, avgCost: row.avgCost }],
        ),
      )
    : null;
  // Posting takes the saved count; the confirmation names what it leaves out.
  const postBlocked = dirty ? t('post.saveFirst') : countedRows === 0 ? t('post.empty') : null;

  const needle = search.trim().toLowerCase();
  const visible = computed.filter(
    ({ row }) =>
      needle === '' ||
      row.product.name.toLowerCase().includes(needle) ||
      row.product.sku?.toLowerCase().includes(needle) ||
      row.product.barcode?.toLowerCase().includes(needle),
  );
  const groups = new Map<string, { name: string; items: typeof visible }>();
  for (const item of visible) {
    const group = groups.get(item.row.subWarehouse.id) ?? {
      name: item.row.subWarehouse.name,
      items: [],
    };
    group.items.push(item);
    groups.set(item.row.subWarehouse.id, group);
  }

  function errorMessage(actionError: ActionError): string {
    const params = actionError.params ?? {};
    if (actionError.code === 'ENTITY_ARCHIVED' && typeof params.name === 'string') {
      return t('form.archivedItem', { name: params.name });
    }
    return tErrors(actionError.code);
  }

  function onSave() {
    setError(null);
    startTransition(async () => {
      const lines = computed
        .filter((item) => isCounted(item.entry))
        .map(({ row, entry }) => ({
          subWarehouseId: row.subWarehouse.id,
          productId: row.product.id,
          blocks: Number(entry!.blocks || 0),
          pieces: Number(entry!.pieces || 0),
        }));
      const result = await updateStockCount({ id: count.id, version, docDate, note, lines });
      if (!result.ok) {
        const code = result.error.code;
        if (code === 'DOCUMENT_CHANGED' || code === 'DOCUMENT_NOT_DRAFT') setStale(true);
        setError(errorMessage(result.error));
        return;
      }
      setVersion(result.data.version);
      setDirty(false);
      toast.success(tCommon('saved'));
      router.refresh();
    });
  }

  async function onPost(): Promise<boolean> {
    const result = await postStockCount({ id: count.id, version });
    if (!result.ok) {
      const code = result.error.code;
      if (code === 'DOCUMENT_CHANGED' || code === 'DOCUMENT_NOT_DRAFT') setStale(true);
      toast.error(errorMessage(result.error));
      return false;
    }
    toast.success(t('post.done', { number: count.number }));
    router.refresh();
    return true;
  }

  async function onCancel(): Promise<boolean> {
    const result = await cancelStockCount({ id: count.id, version });
    if (!result.ok) {
      if (result.error.code === 'DOCUMENT_CHANGED') setStale(true);
      toast.error(errorMessage(result.error));
      return false;
    }
    toast.success(t('cancel.done', { number: count.number }));
    router.refresh();
    return true;
  }

  return (
    <div className="flex flex-col gap-6">
      <div
        role="status"
        className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
      >
        {t('form.blocked', { warehouse: count.warehouse.name })}
      </div>

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-[12rem_1fr]">
          <div className="flex flex-col gap-2">
            <Label htmlFor={ids.date}>{t('form.date')}</Label>
            <Input
              id={ids.date}
              type="date"
              max={today}
              value={docDate}
              onChange={(event) => {
                setDocDate(event.target.value);
                touch();
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={ids.note}>{t('form.note')}</Label>
            <Input
              id={ids.note}
              value={note}
              maxLength={STOCK_COUNT_NOTE_MAX}
              onChange={(event) => {
                setNote(event.target.value);
                touch();
              }}
            />
          </div>
        </CardContent>
      </Card>

      <section aria-labelledby="count-rows" className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="count-rows" className="text-lg font-semibold">
            {t('form.rows')}
          </h2>
          <div className="relative sm:w-64">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id={ids.search}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('form.search')}
              aria-label={t('form.search')}
              className="pl-8"
            />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{t('form.hint')}</p>

        {computed.length === 0 && (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t('form.noRows')}
          </p>
        )}

        <div
          className={cn(ROW_GRID, 'hidden px-1 text-xs font-medium text-muted-foreground')}
          aria-hidden
        >
          <span>{t('form.product')}</span>
          <span className="text-right">{t('form.system')}</span>
          <span>{t('form.blocks')}</span>
          <span>{t('form.pieces')}</span>
          <span className="text-right">{t('form.diff')}</span>
          <span className="text-right">{showAmounts ? t('form.diffAmount') : ''}</span>
        </div>

        {[...groups].map(([subId, group]) => (
          <div key={subId} className="flex flex-col gap-1">
            <h3 className="px-1 pt-2 text-sm font-semibold">{group.name}</h3>
            {group.items.map(({ row, key, entry, diff, amount }) => (
              <div
                key={key}
                className={cn(
                  ROW_GRID,
                  'flex flex-col gap-2 rounded-md border p-3 lg:rounded-none lg:border-0 lg:border-b lg:p-1 lg:pb-2',
                )}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{row.product.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {[
                      row.product.sku,
                      t('form.perBlock', { count: row.product.unitsPerBlock }),
                      row.product.archived ? t('form.archived') : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <div className="flex justify-between gap-2 text-sm lg:block lg:text-right">
                  <span className="text-muted-foreground lg:sr-only">{t('form.system')}</span>
                  {row.systemQty === null ? (
                    <span className="text-muted-foreground">{t('form.afterSave')}</span>
                  ) : (
                    <QtyText qty={row.systemQty} unitsPerBlock={row.product.unitsPerBlock} />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 lg:contents">
                  <Input
                    inputMode="numeric"
                    autoComplete="off"
                    value={entry?.blocks ?? ''}
                    placeholder={t('form.blocks')}
                    aria-label={t('form.blocksOf', { product: row.product.name, sub: group.name })}
                    onChange={(event) => setEntry(key, { blocks: digits(event.target.value) })}
                    className="tabular-nums"
                  />
                  <Input
                    inputMode="numeric"
                    autoComplete="off"
                    value={entry?.pieces ?? ''}
                    placeholder={t('form.pieces')}
                    aria-label={t('form.piecesOf', { product: row.product.name, sub: group.name })}
                    onChange={(event) => setEntry(key, { pieces: digits(event.target.value) })}
                    className="tabular-nums"
                  />
                </div>
                <div className="flex justify-between gap-2 text-sm lg:block lg:text-right">
                  <span className="text-muted-foreground lg:sr-only">{t('form.diff')}</span>
                  {diff === null ? (
                    <span className="text-muted-foreground">
                      {isCounted(entry) ? '…' : t('form.notCounted')}
                    </span>
                  ) : (
                    <QtyText
                      qty={diff}
                      unitsPerBlock={row.product.unitsPerBlock}
                      className={cn(
                        diff < 0 && 'text-destructive',
                        diff > 0 && 'text-emerald-700 dark:text-emerald-400',
                      )}
                    />
                  )}
                </div>
                <div className="flex justify-between gap-2 text-sm lg:block lg:text-right">
                  {showAmounts && (
                    <>
                      <span className="text-muted-foreground lg:sr-only">
                        {t('form.diffAmount')}
                      </span>
                      {amount === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <MoneyText amount={amount} />
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}

        <Card>
          <CardContent className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">{t('form.addTitle')}</h3>
            <div className="flex flex-col gap-2 md:flex-row md:items-end">
              <div className="flex flex-col gap-2 md:w-56">
                <Label htmlFor={ids.sub}>{t('form.subWarehouse')}</Label>
                <Select value={addSub || undefined} onValueChange={setAddSub}>
                  <SelectTrigger id={ids.sub} className="w-full">
                    <SelectValue placeholder={t('form.subWarehouse')} />
                  </SelectTrigger>
                  <SelectContent>
                    {subWarehouses.map((sub) => (
                      <SelectItem key={sub.id} value={sub.id}>
                        {sub.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Label>{t('form.product')}</Label>
                <ProductPicker
                  options={products}
                  value={addProduct}
                  onSelect={setAddProduct}
                  placeholder={t('form.productSearch')}
                  emptyText={t('form.noProducts')}
                  ariaLabel={t('form.product')}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={!addProduct || !addSub}
                onClick={addRow}
              >
                <PlusIcon />
                {t('form.addRow')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">{t('form.countedRows')}</span>
            <span className="tabular-nums">
              {countedRows} / {computed.length}
            </span>
          </div>
          {uncounted > 0 && (
            <p className="text-muted-foreground">{t('form.uncounted', { count: uncounted })}</p>
          )}
          {estimate && (
            <>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t('form.shortage')}</span>
                <MoneyText amount={estimate.shortageAmount} className="text-destructive" />
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t('form.surplus')}</span>
                <MoneyText amount={estimate.surplusAmount} />
              </div>
              <p className="text-xs text-muted-foreground">{t('form.estimateHint')}</p>
            </>
          )}
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
          {stale && (
            <>
              {' '}
              <button
                type="button"
                className="underline underline-offset-4"
                onClick={() => router.refresh()}
              >
                {t('form.reload')}
              </button>
            </>
          )}
        </p>
      )}

      {/* Actions on the left like the sale form: toasts (bottom right) never cover them. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Button
          type="button"
          variant="outline"
          onClick={onSave}
          disabled={isPending || stale || !dirty}
        >
          {tCommon('save')}
        </Button>
        <ConfirmDialog
          trigger={
            <Button type="button" disabled={isPending || stale || postBlocked !== null}>
              <CheckCircle2Icon />
              {t('post.button')}
            </Button>
          }
          title={t('post.title', { number: count.number })}
          description={t('post.description', { warehouse: count.warehouse.name })}
          confirmLabel={t('post.button')}
          onConfirm={onPost}
        >
          {(uncounted > 0 || estimate) && (
            <div className="flex flex-col gap-2 text-sm">
              {uncounted > 0 && (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  {t('form.uncounted', { count: uncounted })}
                </p>
              )}
              {estimate && (
                <>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t('form.shortage')}</span>
                    <MoneyText amount={estimate.shortageAmount} className="text-destructive" />
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t('form.surplus')}</span>
                    <MoneyText amount={estimate.surplusAmount} />
                  </div>
                </>
              )}
            </div>
          )}
        </ConfirmDialog>
        {postBlocked && <span className="text-sm text-muted-foreground">{postBlocked}</span>}
        <ConfirmDialog
          trigger={
            <Button type="button" variant="outline" className="text-destructive sm:ml-auto">
              <XCircleIcon />
              {t('cancel.button')}
            </Button>
          }
          title={t('cancel.title', { number: count.number })}
          description={t('cancel.description', { warehouse: count.warehouse.name })}
          confirmLabel={t('cancel.button')}
          destructive
          onConfirm={onCancel}
        />
      </div>
    </div>
  );
}
