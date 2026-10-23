// UI texts straight from apps/web/messages/*.json, so locators follow the
// app's wording instead of copies of it. `msg('sales.post.button')`;
// placeholders `{name}` are filled in, rich-text tags (`<link>…</link>`) dropped.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { REPO_ROOT } from '../env';

export type Locale = 'uz' | 'ru';

type Messages = { [key: string]: string | Messages };

const cache = new Map<Locale, Messages>();

function messages(locale: Locale): Messages {
  let loaded = cache.get(locale);
  if (!loaded) {
    const file = path.join(REPO_ROOT, 'apps/web/messages', `${locale}.json`);
    loaded = JSON.parse(readFileSync(file, 'utf8')) as Messages;
    cache.set(locale, loaded);
  }
  return loaded;
}

export function msgIn(
  locale: Locale,
  key: string,
  values: Record<string, string | number> = {},
): string {
  let node: string | Messages | undefined = messages(locale);
  for (const part of key.split('.')) {
    node = typeof node === 'object' ? node[part] : undefined;
  }
  if (typeof node !== 'string') throw new Error(`No "${key}" message in ${locale}.json`);
  return node
    .replace(/<\/?[a-z]+>/g, '')
    .replace(/\{(\w+)\}/g, (match, name: string) =>
      name in values ? String(values[name]) : match,
    );
}

/** Uzbek (the default locale) — what the flows use. */
export function msg(key: string, values?: Record<string, string | number>): string {
  return msgIn('uz', key, values);
}

/** The no-break space formatSom puts between digit groups and before the unit. */
const NBSP = String.fromCharCode(0xa0);

/** Money as the app prints it (formatSom): "35 000 soʻm". */
export function som(amount: number, locale: Locale = 'uz'): string {
  const grouped = String(amount).replace(/\B(?=(\d{3})+$)/g, NBSP);
  return `${grouped}${NBSP}${msgIn(locale, 'common.som')}`;
}
