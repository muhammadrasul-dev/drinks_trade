import { Locale } from '@drinks/shared';
import { defineRouting } from 'next-intl/routing';

// URL prefix is always present (/uz/..., /ru/...); default uz (architecture §7, ADR-014).
// Locale for "/" is resolved by next-intl: NEXT_LOCALE cookie → Accept-Language → uz.
export const routing = defineRouting({
  locales: Object.values(Locale),
  defaultLocale: Locale.uz,
  localePrefix: 'always',
});
