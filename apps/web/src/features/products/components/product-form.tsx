'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type ActionError,
  blockPrice,
  type CatalogItem,
  formatQty,
  type Product,
} from '@drinks/shared';
import {
  PRODUCT_CODE_MAX,
  PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_IMAGE_TYPES,
  PRODUCT_NAME_MAX,
  SALE_PRICE_MAX,
  type ProductCreateInput,
  productCreateInputSchema,
} from '@drinks/shared/schemas';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@drinks/ui/components/alert-dialog';
import { Button } from '@drinks/ui/components/button';
import { Card, CardContent } from '@drinks/ui/components/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@drinks/ui/components/select';
import { toast } from '@drinks/ui/components/sonner';
import { ImageIcon, Trash2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ChangeEvent, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { type FieldPath, useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';

import { MoneyText } from '@/components/money-text';
import { Link, useRouter } from '@/i18n/navigation';

import { createProduct, removeProductImage, setProductImage, updateProduct } from '../actions';
import { PRODUCTS_HREF, productImageUrl } from '../list-params';

type Values = z.output<typeof productCreateInputSchema>;
type FieldName = FieldPath<ProductCreateInput>;

const NONE = '__none';
const FIELDS: readonly FieldName[] = [
  'name',
  'unitsPerBlock',
  'salePrice',
  'categoryId',
  'brandId',
  'sku',
  'barcode',
  'minStock',
  'expiryDate',
];

interface ProductFormProps {
  /** Edit this product; omitted → create a new one. */
  product?: Product;
  /** Active categories / brands; the product's archived ones are added by the form. */
  categories: readonly CatalogItem[];
  brands: readonly CatalogItem[];
}

function defaults(product?: Product): ProductCreateInput {
  return {
    name: product?.name ?? '',
    unitsPerBlock: product?.unitsPerBlock ?? (undefined as unknown as number),
    salePrice: product?.salePrice ?? (undefined as unknown as number),
    categoryId: product?.category?.id ?? null,
    brandId: product?.brand?.id ?? null,
    sku: product?.sku ?? '',
    barcode: product?.barcode ?? '',
    minStock: product?.minStock ?? 0,
    expiryDate: product?.expiryDate ?? '',
  };
}

/** Digits only → number; empty → undefined (the schema then says "required"). */
function toNumber(event: ChangeEvent<HTMLInputElement>): number | undefined {
  const digits = event.target.value.replace(/\D/g, '');
  return digits === '' ? undefined : Number(digits);
}

/**
 * Product card (T-303, FR-1.1): all fields, live block price (OQ-15), a
 * warning before units per block changes (OQ-06) and the photo. The photo is
 * sent after the product itself is saved.
 */
export function ProductForm({ product, categories, brands }: ProductFormProps) {
  const t = useTranslations('products');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const tUnit = useTranslations('enums.QtyUnit');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingValues, setPendingValues] = useState<Values | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const qtyLabels = { block: tUnit('BLOCK'), piece: tUnit('PIECE') };

  const form = useForm({
    resolver: zodResolver(productCreateInputSchema, {
      error: (issue) => {
        if (issue.code === 'invalid_type') return tCommon('required');
        if (issue.code === 'too_small' && issue.origin === 'string') return tCommon('required');
        if (issue.code === 'too_big' && issue.origin === 'string') return tCommon('tooLong');
        return tCommon('invalid');
      },
    }),
    defaultValues: defaults(product),
  });

  const [unitsPerBlock, salePrice, minStock] = useWatch({
    control: form.control,
    name: ['unitsPerBlock', 'salePrice', 'minStock'],
  });
  const validUnits = Number.isSafeInteger(unitsPerBlock) && unitsPerBlock > 0;
  const shownBlockPrice =
    validUnits && Number.isSafeInteger(salePrice) && salePrice <= SALE_PRICE_MAX
      ? blockPrice(salePrice, unitsPerBlock)
      : null;

  // Preview of a newly chosen file; revoked when it changes or the form unmounts.
  const previewUrl = useMemo(
    () => (imageFile ? URL.createObjectURL(imageFile) : null),
    [imageFile],
  );
  useEffect(() => () => void (previewUrl && URL.revokeObjectURL(previewUrl)), [previewUrl]);
  const currentImageUrl =
    previewUrl ??
    (product?.imageVersion && !removeImage
      ? productImageUrl(product.id, product.imageVersion)
      : null);

  // An archived category / brand already set stays selectable for this product (T-302).
  const categoryOptions = withCurrent(categories, product?.category);
  const brandOptions = withCurrent(brands, product?.brand);

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!(PRODUCT_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      setImageError(t('form.imageInvalidType'));
    } else if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
      setImageError(t('form.imageTooBig'));
    } else {
      setImageError(null);
      setImageFile(file);
      setRemoveImage(false);
    }
  }

  function onRemoveImage() {
    setImageFile(null);
    setImageError(null);
    setRemoveImage(Boolean(product?.imageVersion));
  }

  function showError(error: ActionError) {
    const field = error.params?.field;
    const entity = error.params?.entity;
    if (error.code === 'DUPLICATE_VALUE' && (field === 'sku' || field === 'barcode')) {
      form.setError(field, {
        message: t(error.params?.archived ? 'form.duplicateArchived' : 'form.duplicate'),
      });
    } else if (
      (error.code === 'ENTITY_ARCHIVED' || error.code === 'NOT_FOUND') &&
      (entity === 'category' || entity === 'brand')
    ) {
      form.setError(entity === 'category' ? 'categoryId' : 'brandId', {
        message: tErrors(error.code),
      });
    } else if (error.code === 'VALIDATION_FAILED' && error.fieldErrors) {
      for (const name of FIELDS) {
        if (error.fieldErrors[name]) form.setError(name, { message: tCommon('invalid') });
      }
    } else {
      form.setError('root', { message: tErrors(error.code) });
    }
  }

  function save(values: Values) {
    startTransition(async () => {
      const result = product
        ? await updateProduct({ ...values, id: product.id })
        : await createProduct(values);
      if (!result.ok) {
        showError(result.error);
        return;
      }
      const saved = result.data;

      if (imageFile) {
        const data = new FormData();
        data.set('id', saved.id);
        data.set('file', imageFile);
        const upload = await setProductImage(data);
        if (!upload.ok) {
          toast.error(t('form.imageUploadFailed'));
          setImageFile(null);
          // A new product exists now: continue on its edit page.
          if (!product) router.replace(`${PRODUCTS_HREF}/${saved.id}`);
          return;
        }
      } else if (removeImage) {
        const removal = await removeProductImage({ id: saved.id });
        if (!removal.ok) {
          toast.error(tErrors(removal.error.code));
          return;
        }
      }

      toast.success(tCommon('saved'));
      router.push(PRODUCTS_HREF);
    });
  }

  function onSubmit(values: Values) {
    // OQ-06: changing pieces per block re-splits stock into blocks — confirm first.
    if (product && values.unitsPerBlock !== product.unitsPerBlock) {
      setPendingValues(values);
      return;
    }
    save(values);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
        <Card>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>{t('form.name')}</FormLabel>
                  <FormControl>
                    <Input
                      autoFocus={!product}
                      autoComplete="off"
                      maxLength={PRODUCT_NAME_MAX}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="unitsPerBlock"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('form.unitsPerBlock')}</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="numeric"
                      autoComplete="off"
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={field.value ?? ''}
                      onChange={(event) => field.onChange(toNumber(event))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="salePrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('form.salePrice')}</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="numeric"
                      autoComplete="off"
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={field.value ?? ''}
                      onChange={(event) => field.onChange(toNumber(event))}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('form.blockPrice')}
                    {validUnits && ` (${unitsPerBlock} ${tUnit('PIECE')})`}:{' '}
                    {shownBlockPrice === null ? '—' : <MoneyText amount={shownBlockPrice} />}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('form.category')}</FormLabel>
                  <RefSelect
                    value={field.value}
                    onChange={field.onChange}
                    items={categoryOptions}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="brandId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('form.brand')}</FormLabel>
                  <RefSelect value={field.value} onChange={field.onChange} items={brandOptions} />
                  <FormMessage />
                </FormItem>
              )}
            />

            {(['sku', 'barcode'] as const).map((name) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t(`form.${name}`)}</FormLabel>
                    <FormControl>
                      <Input
                        autoComplete="off"
                        maxLength={PRODUCT_CODE_MAX}
                        inputMode={name === 'barcode' ? 'numeric' : undefined}
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}

            <FormField
              control={form.control}
              name="minStock"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('form.minStock')}</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="numeric"
                      autoComplete="off"
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={field.value ?? ''}
                      onChange={(event) => field.onChange(toNumber(event))}
                    />
                  </FormControl>
                  <FormDescription>
                    {validUnits && Number.isSafeInteger(minStock) && minStock > 0
                      ? `= ${formatQty(minStock, unitsPerBlock, qtyLabels)}`
                      : t('form.minStockHint')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="expiryDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('form.expiryDate')}</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} value={field.value ?? ''} className="w-fit" />
                  </FormControl>
                  <FormDescription>{t('form.expiryDateHint')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-col gap-2 md:col-span-2">
              <span className="text-sm font-medium">{t('form.image')}</span>
              <div className="flex items-center gap-4">
                <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                  {currentImageUrl ? (
                    // A blob: preview or the authenticated image route — not for next/image.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={currentImageUrl}
                      alt={product?.name ?? ''}
                      className="size-full object-contain"
                    />
                  ) : (
                    <ImageIcon className="size-8 text-muted-foreground" aria-hidden />
                  )}
                </div>
                <div className="flex flex-col items-start gap-2">
                  <input
                    ref={fileInput}
                    type="file"
                    accept={PRODUCT_IMAGE_TYPES.join(',')}
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden
                    onChange={onFileChange}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInput.current?.click()}
                    >
                      <ImageIcon />
                      {t('form.chooseImage')}
                    </Button>
                    {currentImageUrl && (
                      <Button type="button" variant="ghost" size="sm" onClick={onRemoveImage}>
                        <Trash2Icon />
                        {t('form.removeImage')}
                      </Button>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{t('form.imageHint')}</p>
                  {imageError && (
                    <p role="alert" className="text-sm text-destructive">
                      {imageError}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {form.formState.errors.root && (
          <p role="alert" className="text-sm text-destructive">
            {form.formState.errors.root.message}
          </p>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={isPending}>
            {tCommon('save')}
          </Button>
          <Button asChild type="button" variant="outline">
            <Link href={PRODUCTS_HREF}>{tCommon('cancel')}</Link>
          </Button>
        </div>
      </form>

      {product && (
        <AlertDialog
          open={pendingValues !== null}
          onOpenChange={(open) => !open && setPendingValues(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('unitsChange.title')}</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="flex flex-col gap-2">
                  <p>
                    {t('unitsChange.description', {
                      from: product.unitsPerBlock,
                      to: pendingValues?.unitsPerBlock ?? product.unitsPerBlock,
                    })}
                  </p>
                  {product.stockQty > 0 && pendingValues && (
                    <p className="font-medium text-foreground">
                      {t('unitsChange.stock', {
                        before: formatQty(product.stockQty, product.unitsPerBlock, qtyLabels),
                        after: formatQty(product.stockQty, pendingValues.unitsPerBlock, qtyLabels),
                      })}
                    </p>
                  )}
                  <p>{t('unitsChange.drafts')}</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (pendingValues) save(pendingValues);
                  setPendingValues(null);
                }}
              >
                {t('unitsChange.confirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Form>
  );
}

/** Active items plus the product's own archived one, so the current value still shows. */
function withCurrent(
  items: readonly CatalogItem[],
  current: Product['category'] | undefined,
): readonly Pick<CatalogItem, 'id' | 'name' | 'archived'>[] {
  if (!current || items.some((item) => item.id === current.id)) return items;
  return [...items, current];
}

function RefSelect({
  value,
  onChange,
  items,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  items: readonly Pick<CatalogItem, 'id' | 'name' | 'archived'>[];
}) {
  const t = useTranslations('products');
  return (
    <Select value={value || NONE} onValueChange={(next) => onChange(next === NONE ? null : next)}>
      <FormControl>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        <SelectItem value={NONE}>{t('form.none')}</SelectItem>
        {items.map((item) => (
          <SelectItem key={item.id} value={item.id}>
            {item.archived ? t('form.archivedOption', { name: item.name }) : item.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
