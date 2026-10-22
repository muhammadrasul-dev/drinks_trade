import type { Locale } from '@drinks/shared';
import { Button } from '@drinks/ui/components/button';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { LocaleSwitcher } from '@/components/locale-switcher';
import { Link } from '@/i18n/navigation';

// Placeholder home page; T-203 replaces it with the (app) layout and dashboard.
export default async function HomePage({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations('home');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <LocaleSwitcher />
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-muted-foreground text-sm">{t('description')}</p>
      <Button asChild>
        <Link href="/login">{t('goToLogin')}</Link>
      </Button>
    </main>
  );
}
