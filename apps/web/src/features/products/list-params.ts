import type { ProductListQuery } from '@drinks/shared/schemas';

import {
  firstParam,
  hrefWith,
  pageParam,
  type SearchParams,
  textParam,
  uuidParam,
} from '@/lib/search-params';

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

/** URL search params → service query; invalid values are dropped, never an error page. */
export function parseListParams(params: SearchParams): ProductListFilters & ProductListQuery {
  const q = textParam(params.q, 100);
  const categoryId = uuidParam(params.category);
  const brandId = uuidParam(params.brand);
  const page = pageParam(params.page);
  return {
    ...(q && { q }),
    ...(categoryId && { categoryId }),
    ...(brandId && { brandId }),
    ...(firstParam(params.archived) === '1' && { archived: true }),
    ...(page && { page }),
  };
}

/** Filters → `/products?…` (page 1 and empty values left out). */
export function listHref(filters: ProductListFilters): string {
  return hrefWith(PRODUCTS_HREF, {
    q: filters.q,
    category: filters.categoryId,
    brand: filters.brandId,
    archived: filters.archived,
    page: filters.page,
  });
}

/** The authenticated image route (app/api/products/[id]/image); `v` busts the cache. */
export function productImageUrl(id: string, version: string): string {
  return `/api/products/${id}/image?v=${encodeURIComponent(version)}`;
}
