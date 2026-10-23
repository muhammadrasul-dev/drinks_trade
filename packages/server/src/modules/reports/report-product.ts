// The product block of a report row (T-801, T-802): name, SKU, category /
// brand and the archive mark, by name.
import type { Prisma } from '@drinks/db';

export const REPORT_PRODUCT_SELECT = {
  id: true,
  name: true,
  sku: true,
  unitsPerBlock: true,
  minStock: true,
  archivedAt: true,
  category: { select: { id: true, name: true } },
  brand: { select: { id: true, name: true } },
} as const satisfies Prisma.ProductSelect;

/** By name; the id breaks ties so equal names keep one order. */
export const REPORT_PRODUCT_ORDER: Prisma.ProductOrderByWithRelationInput[] = [
  { name: 'asc' },
  { id: 'asc' },
];

type ReportProductRecord = Prisma.ProductGetPayload<{ select: typeof REPORT_PRODUCT_SELECT }>;

export function toReportProduct(product: ReportProductRecord) {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    unitsPerBlock: product.unitsPerBlock,
    archived: product.archivedAt !== null,
    category: product.category,
    brand: product.brand,
  };
}
