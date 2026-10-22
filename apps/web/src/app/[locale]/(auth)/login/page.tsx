import type { Locale } from '@drinks/shared';
import { Button } from '@drinks/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@drinks/ui/components/card';
import { Input } from '@drinks/ui/components/input';
import { Label } from '@drinks/ui/components/label';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { LocaleSwitcher } from '@/components/locale-switcher';

// Minimal placeholder so both locales can be checked (T-202). T-201 replaces it
// with the real form (react-hook-form + zod, login Server Action).
export default async function LoginPage({ params }: PageProps<'/[locale]/login'>) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations('auth.login');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <LocaleSwitcher />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="username">{t('username')}</Label>
            <Input id="username" name="username" autoComplete="username" disabled />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">{t('password')}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              disabled
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Button className="w-full" disabled>
            {t('submit')}
          </Button>
          <p className="text-muted-foreground text-xs">{t('notReady')}</p>
        </CardFooter>
      </Card>
    </main>
  );
}
