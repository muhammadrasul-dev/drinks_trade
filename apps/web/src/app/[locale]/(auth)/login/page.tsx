import type { Locale } from '@drinks/shared';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@drinks/ui/components/card';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { LocaleSwitcher } from '@/components/locale-switcher';
import { LoginForm } from '@/features/auth/components/login-form';
import { redirect } from '@/i18n/navigation';
import { getCurrentSession } from '@/lib/session';

export default async function LoginPage({ params }: PageProps<'/[locale]/login'>) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  // Already signed in → home, in the user's saved language.
  const session = await getCurrentSession();
  if (session) redirect({ href: '/', locale: session.user.locale });

  const t = await getTranslations('auth.login');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <LocaleSwitcher />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
