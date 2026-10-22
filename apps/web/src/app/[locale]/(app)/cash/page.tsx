import type { Locale } from '@drinks/shared';
import { setRequestLocale } from 'next-intl/server';

import { ComingSoon } from '@/components/coming-soon';
import { requireSection } from '@/lib/session';

export default async function CashPage({ params }: PageProps<'/[locale]/cash'>) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  await requireSection(locale as Locale, 'cash');
  return <ComingSoon section="cash" />;
}
