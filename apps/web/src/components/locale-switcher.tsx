'use client';

import type { Locale } from '@drinks/shared';
import { Button } from '@drinks/ui/components/button';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { saveUserLocale } from '@/features/i18n/actions';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

// Switches the URL prefix (/uz ↔ /ru); next-intl's proxy then stores NEXT_LOCALE.
export function LocaleSwitcher() {
  const t = useTranslations('localeSwitcher');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function switchTo(next: Locale) {
    if (next === locale) return;
    startTransition(async () => {
      // A failed save must not block the switch: the URL/cookie still carry the choice.
      await saveUserLocale(next);
      router.replace(pathname, { locale: next });
    });
  }

  return (
    <div role="group" aria-label={t('label')} className="inline-flex gap-1">
      {routing.locales.map((value) => (
        <Button
          key={value}
          type="button"
          size="sm"
          variant={value === locale ? 'default' : 'outline'}
          aria-pressed={value === locale}
          disabled={isPending}
          lang={value}
          onClick={() => switchTo(value)}
        >
          {t(value)}
        </Button>
      ))}
    </div>
  );
}
