import { products, stockCounts, warehouses } from '@drinks/server';
import {
  ErrorCode,
  formatDate,
  isDomainError,
  type Locale,
  type StockCountDetail,
  storeToday,
} from '@drinks/shared';
import { PageHeader } from '@drinks/ui/components/page-header';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { z } from 'zod';

import { StockCountForm } from '@/features/stock-counts/components/stock-count-form';
import { StockCountStatusBadge } from '@/features/stock-counts/components/stock-count-status-badge';
import { StockCountView } from '@/features/stock-counts/components/stock-count-view';
import { getServiceContext, requireSection } from '@/lib/session';

// One stock count (T-601): an open one shows the counting form, a posted or
// cancelled one is read-only.
export default async function StockCountPage({ params }: PageProps<'/[locale]/stock-counts/[id]'>) {
  const { locale, id } = await params;
  setRequestLocale(locale as Locale);
  const session = await requireSection(locale as Locale, 'stockCounts');
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await getServiceContext(session);

  let count: StockCountDetail;
  try {
    count = await stockCounts.get(ctx, { id });
  } catch (error) {
    if (isDomainError(error) && error.code === ErrorCode.NOT_FOUND) notFound();
    throw error;
  }
  const t = await getTranslations('stockCounts');
  const header = (
    <PageHeader
      title={
        <span className="flex flex-wrap items-center gap-3">
          {t('docTitle', { number: count.number })}
          <StockCountStatusBadge status={count.status} />
        </span>
      }
      description={t('docDescription', {
        warehouse: count.warehouse.name,
        date: formatDate(count.docDate),
        author: count.createdBy.fullName,
      })}
    />
  );

  if (count.status !== 'DRAFT') {
    return (
      <>
        {header}
        <StockCountView count={count} />
      </>
    );
  }

  const [productOptions, warehouseOptions] = await Promise.all([
    products.options(ctx),
    warehouses.options(ctx),
  ]);
  const subWarehouses =
    warehouseOptions.find((warehouse) => warehouse.id === count.warehouse.id)?.subWarehouses ?? [];
  return (
    <>
      {header}
      <StockCountForm
        key={count.version}
        count={count}
        products={productOptions}
        subWarehouses={subWarehouses}
        today={storeToday()}
      />
    </>
  );
}
