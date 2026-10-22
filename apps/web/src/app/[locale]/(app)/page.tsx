import type { Locale } from '@drinks/shared';
import { PageHeader } from '@drinks/ui/components/page-header';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { requireSection } from '@/lib/session';

// Dashboard placeholder; T-902 fills it.
export default async function DashboardPage({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const { user } = await requireSection(locale as Locale, 'dashboard');
  const t = await getTranslations();

  return (
    <PageHeader
      title={t('nav.sections.dashboard')}
      description={t('home.greeting', {
        name: user.fullName,
        role: t(`enums.UserRole.${user.role}`),
      })}
    />
  );
}
