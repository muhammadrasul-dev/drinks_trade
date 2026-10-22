import type { ProductListQuery } from '@drinks/shared/schemas';
import { z } from 'zod';

// /products filters live in the URL (?q=&category=&brand=&archived=1&page=),
// so a filtered list can be bookmarked and the server renders it directly.

export const PRODUCTS_HREF = '/products';

export interface ProductListFilters {
  q?: string;
  categoryId?: string;
  brandId?: string;
  archived?: boolean;
  page?: number;
}

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const uuid = z.uuid();

/** URL search params → service query; invalid values are dropped, never an error page. */
export function parseListParams(params: SearchParams): ProductListFilters & ProductListQuery {
  const q = first(params.q)?.trim().slice(0, 100);
  const categoryId = first(params.category);
  const brandId = first(params.brand);
  const page = Number(first(params.page));
  return {
    ...(q && { q }),
    ...(categoryId && uuid.safeParse(categoryId).success && { categoryId }),
    ...(brandId && uuid.safeParse(brandId).success && { brandId }),
    ...(first(params.archived) === '1' && { archived: true }),
    ...(Number.isSafeInteger(page) && page > 1 && { page }),
  };
}

/** Filters → `/products?…` (page 1 and empty values left out). */
export function listHref(filters: ProductListFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.categoryId) params.set('category', filters.categoryId);
  if (filters.brandId) params.set('brand', filters.brandId);
  if (filters.archived) params.set('archived', '1');
  if (filters.page && filters.page > 1) params.set('page', String(filters.page));
  const query = params.toString();
  return query ? `${PRODUCTS_HREF}?${query}` : PRODUCTS_HREF;
}

/** The authenticated image route (app/api/products/[id]/image); `v` busts the cache. */
export function productImageUrl(id: string, version: string): string {
  return `/api/products/${id}/image?v=${encodeURIComponent(version)}`;
}
