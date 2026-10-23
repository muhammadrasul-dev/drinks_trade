import { sales, warehouses } from '@drinks/server';
import {
  can,
  ErrorCode,
  formatDate,
  isDomainError,
  type Locale,
  type SaleDetail,
  storeToday,
} from '@drinks/shared';
import { PageHeader } from '@drinks/ui/components/page-header';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { z } from 'zod';

import { DocStatusBadge } from '@/components/doc-status-badge';
import { SaleForm } from '@/features/sales/components/sale-form';
import { SaleReverseButton } from '@/features/sales/components/sale-reverse-button';
import { SaleView } from '@/features/sales/components/sale-view';
import { getServiceContext, requireSection } from '@/lib/session';

// One sale (T-501): a draft opens in the form, anything else read-only;
// the OWNER may reverse a posted one (T-503).
export default async function SalePage({ params }: PageProps<'/[locale]/sales/[id]'>) {
  const { locale, id } = await params;
  setRequestLocale(locale as Locale);
  const session = await requireSection(locale as Locale, 'sales');
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await getServiceContext(session);

  let sale: SaleDetail;
  try {
    sale = await sales.get(ctx, { id });
  } catch (error) {
    if (isDomainError(error) && error.code === ErrorCode.NOT_FOUND) notFound();
    throw error;
  }
  const t = await getTranslations('sales');
  const header = (
    <PageHeader
      title={
        <span className="flex flex-wrap items-center gap-3">
          {t('docTitle', { number: sale.number })}
          <DocStatusBadge status={sale.status} />
        </span>
      }
      description={t('docDescription', {
        date: formatDate(sale.docDate),
        author: sale.createdBy.fullName,
      })}
      actions={
        sale.status === 'POSTED' &&
        can(session.user.role, 'document.reverse') && (
          <SaleReverseButton id={sale.id} number={sale.number} />
        )
      }
    />
  );

  if (sale.status !== 'DRAFT') {
    return (
      <>
        {header}
        <SaleView sale={sale} />
      </>
    );
  }

  const [productOptions, warehouseOptions] = await Promise.all([
    sales.productOptions(ctx),
    warehouses.options(ctx),
  ]);
  return (
    <>
      {header}
      <SaleForm
        key={sale.version}
        sale={sale}
        products={productOptions}
        warehouses={warehouseOptions}
        today={storeToday()}
      />
    </>
  );
}
