'use server';

import { brands, categories } from '@drinks/server';
import {
  catalogCreateInputSchema,
  catalogIdInputSchema,
  catalogKindSchema,
  catalogRenameInputSchema,
} from '@drinks/shared/schemas';
import { revalidatePath } from 'next/cache';

import { action } from '@/lib/action';

// Categories and brands (T-302). `kind` picks the list; the services check
// permissions and re-validate. Every write refreshes the products pages.
const SERVICES = { category: categories, brand: brands } as const;
const withKind = { kind: catalogKindSchema };

function refresh(): void {
  revalidatePath('/[locale]/products', 'layout');
}

export const createCatalogItem = action(
  catalogCreateInputSchema.extend(withKind),
  async ({ kind, ...input }, { ctx }) => {
    const item = await SERVICES[kind].create(ctx, input);
    refresh();
    return item;
  },
);

export const renameCatalogItem = action(
  catalogRenameInputSchema.extend(withKind),
  async ({ kind, ...input }, { ctx }) => {
    const item = await SERVICES[kind].rename(ctx, input);
    refresh();
    return item;
  },
);

export const archiveCatalogItem = action(
  catalogIdInputSchema.extend(withKind),
  async ({ kind, ...input }, { ctx }) => {
    const item = await SERVICES[kind].archive(ctx, input);
    refresh();
    return item;
  },
);

export const restoreCatalogItem = action(
  catalogIdInputSchema.extend(withKind),
  async ({ kind, ...input }, { ctx }) => {
    const item = await SERVICES[kind].restore(ctx, input);
    refresh();
    return item;
  },
);
