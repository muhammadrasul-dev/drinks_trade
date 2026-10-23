import { products, purchases, warehouses } from '@drinks/server';
import {
  can,
  ErrorCode,
  formatDate,
  isDomainError,
  type Locale,
  type PurchaseDetail,
  storeToday,
} from '@drinks/shared';
import { PageHeader } from '@drinks/ui/components/page-header';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { z } from 'zod';

import { DocStatusBadge } from '@/features/purchases/components/doc-status-badge';
import { PurchaseForm } from '@/features/purchases/components/purchase-form';
import { PurchaseReverseButton } from '@/features/purchases/components/purchase-reverse-button';
import { PurchaseView } from '@/features/purchases/components/purchase-view';
import { getServiceContext, requireSection } from '@/lib/session';

// One purchase (T-404): a draft opens in the form, anything else read-only;
// the OWNER may reverse a posted one (T-406).
export default async function PurchasePage({ params }: PageProps<'/[locale]/purchases/[id]'>) {
  const { locale, id } = await params;
  setRequestLocale(locale as Locale);
  const session = await requireSection(locale as Locale, 'purchases');
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await getServiceContext(session);

  let purchase: PurchaseDetail;
  try {
    purchase = await purchases.get(ctx, { id });
  } catch (error) {
    if (isDomainError(error) && error.code === ErrorCode.NOT_FOUND) notFound();
    throw error;
  }
  const t = await getTranslations('purchases');
  const header = (
    <PageHeader
      title={
        <span className="flex flex-wrap items-center gap-3">
          {t('docTitle', { number: purchase.number })}
          <DocStatusBadge status={purchase.status} />
        </span>
      }
      description={t('docDescription', {
        date: formatDate(purchase.docDate),
        author: purchase.createdBy.fullName,
      })}
      actions={
        purchase.status === 'POSTED' &&
        can(session.user.role, 'document.reverse') && (
          <PurchaseReverseButton id={purchase.id} number={purchase.number} />
        )
      }
    />
  );

  if (purchase.status !== 'DRAFT') {
    return (
      <>
        {header}
        <PurchaseView purchase={purchase} />
      </>
    );
  }

  const [productOptions, warehouseOptions] = await Promise.all([
    products.options(ctx),
    warehouses.options(ctx),
  ]);
  return (
    <>
      {header}
      <PurchaseForm
        key={purchase.version}
        purchase={purchase}
        products={productOptions}
        warehouses={warehouseOptions}
        today={storeToday()}
      />
    </>
  );
}
