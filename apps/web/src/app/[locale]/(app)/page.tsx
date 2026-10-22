import type { Locale } from '@drinks/shared';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { LocaleSwitcher } from '@/components/locale-switcher';
import { LogoutButton } from '@/features/auth/components/logout-button';
import { requireSession } from '@/lib/session';

// Protected placeholder; T-203 replaces it with the (app) layout and dashboard.
export default async function HomePage({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const session = await requireSession(locale as Locale);
  const t = await getTranslations('home');
  const tRole = await getTranslations('enums.UserRole');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <LocaleSwitcher />
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-muted-foreground text-sm">
        {t('greeting', { name: session.user.fullName, role: tRole(session.user.role) })}
      </p>
      <LogoutButton />
    </main>
  );
}
