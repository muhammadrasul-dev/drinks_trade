'use client';

import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { PRODUCTS_HREF } from '@/features/products/list-params';

interface ReportProduct {
  id: string;
  name: string;
  sku: string | null;
  archived: boolean;
  category: { name: string } | null;
  brand: { name: string } | null;
}

/** Product column of a report row: name (links to the card), archive mark, category · brand · SKU. */
export function ReportProductCell({ product }: { product: ReportProduct }) {
  const t = useTranslations('reports');
  const refs = [product.category?.name, product.brand?.name, product.sku].filter(Boolean);
  return (
    <div className="flex min-w-40 flex-col">
      <span className="flex flex-wrap items-center gap-1.5">
        <Link href={`${PRODUCTS_HREF}/${product.id}`} className="font-medium hover:underline">
          {product.name}
        </Link>
        {product.archived && (
          <span className="rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            {t('archivedTag')}
          </span>
        )}
      </span>
      {refs.length > 0 && <span className="text-xs text-muted-foreground">{refs.join(' · ')}</span>}
    </div>
  );
}
