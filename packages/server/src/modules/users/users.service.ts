import { DomainError, ErrorCode, Locale, type UserRole, validationError } from '@drinks/shared';
import { resetPasswordInputSchema } from '@drinks/shared/schemas';
import { z } from 'zod';

import type { ServiceContext } from '../../core/context';
import { withTransaction } from '../../core/tx';
import { audit } from '../audit';
import { hashPassword } from '../auth/password';

const localeSchema = z.enum(Locale);

/** The signed-in user picks their UI language (architecture §7); the next login redirects to it. */
export async function updateOwnLocale(ctx: ServiceContext, locale: unknown): Promise<void> {
  const parsed = localeSchema.safeParse(locale);
  if (!parsed.success) throw new DomainError(ErrorCode.VALIDATION_FAILED);
  const next = parsed.data;

  await withTransaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: ctx.user.id },
      select: { locale: true },
    });
    if (!user) throw new DomainError(ErrorCode.NOT_FOUND, { entity: 'user' });
    if (user.locale === next) return;
    await tx.user.update({ where: { id: ctx.user.id }, data: { locale: next } });
    await audit.log(tx, ctx, {
      action: 'USER_UPDATE',
      entityType: 'user',
      entityId: ctx.user.id,
      before: { locale: user.locale },
      after: { locale: next },
    });
  });
}

/** Who ran a reset outside a session (no ServiceContext): the server admin's CLI. */
export interface ResetPasswordMeta {
  requestId: string;
  /** Where the reset came from, recorded in the audit meta (e.g. "cli"). */
  source: string;
}

export interface ResetPasswordResult {
  userId: string;
  username: string;
  role: UserRole;
  /** The reset does not reactivate an account (business-logic §11). */
  isActive: boolean;
  sessionsRevoked: number;
  attemptsCleared: number;
}

/**
 * Server-admin password reset (`pnpm user:reset-password <login>`, business-logic
 * §11): sets a new argon2id hash, deletes all of the user's sessions and their
 * login_attempt rows (lifting any lock), and audits PASSWORD_RESET — all in one
 * transaction. Works for any role and for inactive users (who stay inactive).
 * Throws VALIDATION_FAILED, or NOT_FOUND for an unknown login.
 */
export async function resetPassword(
  input: unknown,
  meta: ResetPasswordMeta,
): Promise<ResetPasswordResult> {
  const parsed = resetPasswordInputSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  const { username, password } = parsed.data;
  // argon2 is deliberately slow; hash before opening the transaction.
  const passwordHash = await hashPassword(password);

  return withTransaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        role: true,
        isActive: true,
        // v1: the organization's only store (architecture §5.2).
        organization: {
          select: { stores: { select: { id: true }, orderBy: { createdAt: 'asc' }, take: 1 } },
        },
      },
    });
    if (!user) throw new DomainError(ErrorCode.NOT_FOUND, { entity: 'user', username });

    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordChangedAt: new Date() },
    });
    const sessions = await tx.session.deleteMany({ where: { userId: user.id } });
    // The lock counter is keyed by the typed (lowercased) login, per IP.
    const attempts = await tx.loginAttempt.deleteMany({ where: { username: user.username } });

    const result: ResetPasswordResult = {
      userId: user.id,
      username: user.username,
      role: user.role,
      isActive: user.isActive,
      sessionsRevoked: sessions.count,
      attemptsCleared: attempts.count,
    };
    // Never the password or its hash (architecture §11).
    await audit.log(
      tx,
      {
        user: null,
        storeId: user.organization.stores[0]?.id ?? null,
        requestId: meta.requestId,
      },
      {
        action: 'PASSWORD_RESET',
        entityType: 'user',
        entityId: user.id,
        meta: {
          username: user.username,
          source: meta.source,
          sessionsRevoked: result.sessionsRevoked,
          attemptsCleared: result.attemptsCleared,
        },
      },
    );
    return result;
  });
}
