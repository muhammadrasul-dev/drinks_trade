import type { routing } from './i18n/routing';
import type messages from '../messages/uz.json';

// Typed translation keys and locales for next-intl (uz.json is the reference shape).
declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
