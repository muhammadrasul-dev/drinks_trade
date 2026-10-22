'use server';

import type { ActionResult } from '@drinks/shared';
import { ErrorCode, Locale } from '@drinks/shared';

/** Signature the locale switcher depends on; keep it when the real implementation lands. */
export type SaveUserLocale = (locale: Locale) => Promise<ActionResult<null>>;

/**
 * Persists the chosen UI language to `user.locale` (architecture §7), so the next
 * login redirects to it. Until then the choice lives only in the URL prefix and
 * next-intl's NEXT_LOCALE cookie (set by src/proxy.ts).
 *
 * HOOK(T-201/T-104): replace the body with a call through @drinks/server, e.g.
 *   const ctx = await getServiceContext(); // no session → return { ok: true, data: null }
 *   await usersService.updateOwnLocale(ctx, locale);
 * apps/web must not import Prisma or @drinks/db (architecture §3.1).
 */
export async function saveUserLocale(locale: Locale): Promise<ActionResult<null>> {
  // Server Actions are public endpoints: validate even though the UI sends a typed value.
  if (!Object.values<string>(Locale).includes(locale)) {
    return { ok: false, error: { code: ErrorCode.VALIDATION_FAILED } };
  }
  return { ok: true, data: null };
}

saveUserLocale satisfies SaveUserLocale;
