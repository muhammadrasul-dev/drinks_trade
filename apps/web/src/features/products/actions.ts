'use server';

import { products } from '@drinks/server';
import {
  productCreateInputSchema,
  productIdInputSchema,
  productImageFileSchema,
  productUpdateInputSchema,
} from '@drinks/shared/schemas';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { action } from '@/lib/action';

// Products (T-303). The services check permissions and re-validate; every
// write refreshes the products pages (list, form, categories' counts).
function refresh(): void {
  revalidatePath('/[locale]/products', 'layout');
}

export const createProduct = action(productCreateInputSchema, async (input, { ctx }) => {
  const product = await products.create(ctx, input);
  refresh();
  return product;
});

export const updateProduct = action(productUpdateInputSchema, async (input, { ctx }) => {
  const product = await products.update(ctx, input);
  refresh();
  return product;
});

export const archiveProduct = action(productIdInputSchema, async (input, { ctx }) => {
  const product = await products.archive(ctx, input);
  refresh();
  return product;
});

export const restoreProduct = action(productIdInputSchema, async (input, { ctx }) => {
  const product = await products.restore(ctx, input);
  refresh();
  return product;
});

/** FormData { id, file }: files travel as multipart (next.config serverActions.bodySizeLimit). */
const imageFormSchema = z
  .instanceof(FormData)
  .transform((form) => ({ id: form.get('id'), file: form.get('file') }))
  .pipe(z.object({ id: z.uuid(), file: productImageFileSchema }));

export const setProductImage = action(imageFormSchema, async ({ id, file }, { ctx }) => {
  const product = await products.setImage(ctx, {
    id,
    data: new Uint8Array(await file.arrayBuffer()),
  });
  refresh();
  return product;
});

export const removeProductImage = action(productIdInputSchema, async (input, { ctx }) => {
  const product = await products.removeImage(ctx, input);
  refresh();
  return product;
});
