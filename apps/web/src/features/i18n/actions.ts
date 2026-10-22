'use server';

import { auth, users } from '@drinks/server';
import type { ActionResult } from '@drinks/shared';
import { ErrorCode } from '@drinks/shared';
import { hasLocale } from 'next-intl';

import { routing } from '@/i18n/routing';
import { toActionError } from '@/lib/action-error';
import { getCurrentSession, getRequestMeta } from '@/lib/session';

/**
 * Persists the chosen UI language to `user.locale` (architecture §7), so the next
 * login redirects to it. Without a session (login page) the choice lives only in
 * the URL prefix and next-intl's NEXT_LOCALE cookie (set by src/proxy.ts).
 */
export async function saveUserLocale(locale: string): Promise<ActionResult<null>> {
  // Server Actions are public endpoints: validate even though the UI sends a typed value.
  if (!hasLocale(routing.locales, locale)) {
    return { ok: false, error: { code: ErrorCode.VALIDATION_FAILED } };
  }
  const session = await getCurrentSession();
  if (!session) return { ok: true, data: null };
  try {
    const { requestId } = await getRequestMeta();
    await users.updateOwnLocale(auth.toServiceContext(session, requestId), locale);
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
  return { ok: true, data: null };
}
