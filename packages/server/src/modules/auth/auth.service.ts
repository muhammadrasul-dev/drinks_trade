// Own session auth (ADR-006, architecture §11–12, business-logic §11):
// argon2id passwords, DB sessions keyed by the token's SHA-256, 30-day sliding
// expiry, and a lock after 5 failed attempts per (username, IP) for 15 minutes.
import {
  DomainError,
  ErrorCode,
  type Locale,
  type UserRole,
  validationError,
} from '@drinks/shared';
import { loginInputSchema } from '@drinks/shared/schemas';

import type { ServiceContext } from '../../core/context';
import { type Tx, withTransaction } from '../../core/tx';
import { audit } from '../audit';

import { getDummyHash, verifyPassword } from './password';
import { generateSessionToken, hashSessionToken } from './token';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const SESSION_TTL_MS = 30 * DAY_MS;
/** A session's expiry is pushed forward at most once per this interval (saves a write per request). */
export const SESSION_REFRESH_INTERVAL_MS = DAY_MS;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_DURATION_MS = 15 * MINUTE_MS;

/** Who is calling, taken from the HTTP request by apps/web. */
export interface RequestMeta {
  /** Client IP; null when unknown (all such requests share one counter). */
  ip: string | null;
  userAgent: string | null;
  requestId: string;
}

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  locale: Locale;
}

export interface AuthSession {
  user: AuthUser;
  organizationId: string;
  /** v1 has one store per organization (architecture §5.2). */
  storeId: string;
  expiresAt: Date;
}

export interface LoginResult {
  /** Raw token for the cookie; the DB keeps only its hash. */
  token: string;
  session: AuthSession;
}

const userSelect = {
  id: true,
  username: true,
  fullName: true,
  role: true,
  locale: true,
  isActive: true,
  organizationId: true,
  // v1: the organization's only store.
  organization: {
    select: { stores: { select: { id: true }, orderBy: { createdAt: 'asc' }, take: 1 } },
  },
} as const;

type SelectedUser = {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  locale: Locale;
  isActive: boolean;
  organizationId: string;
  organization: { stores: { id: string }[] };
};

function toAuthSession(user: SelectedUser, expiresAt: Date): AuthSession {
  const store = user.organization.stores[0];
  if (!store) throw new Error(`Organization ${user.organizationId} has no store`);
  return {
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      locale: user.locale,
    },
    organizationId: user.organizationId,
    storeId: store.id,
    expiresAt,
  };
}

function ipKey(meta: RequestMeta): string {
  return meta.ip ?? 'unknown';
}

type FailureReason =
  | typeof ErrorCode.INVALID_CREDENTIALS
  | typeof ErrorCode.USER_INACTIVE
  | typeof ErrorCode.TOO_MANY_ATTEMPTS;

/** LOGIN_FAILED audit row. Only the typed username goes in, never the password. */
function auditFailure(
  tx: Tx,
  meta: RequestMeta,
  username: string,
  userId: string | null,
  reason: FailureReason,
  extra: Record<string, unknown> = {},
): Promise<void> {
  return audit.log(
    tx,
    { user: null, storeId: null, requestId: meta.requestId },
    {
      action: 'LOGIN_FAILED',
      entityType: 'user',
      entityId: userId ?? username,
      meta: { username, ip: meta.ip, userAgent: meta.userAgent, reason, ...extra },
    },
  );
}

/**
 * Counts one failed attempt for (username, ip) and locks the pair on the 5th.
 * The count restarts when the previous failure is older than the lock window
 * or a lock has run out. Returns the new count.
 */
async function recordFailure(tx: Tx, username: string, ip: string, now: Date): Promise<number> {
  const windowStart = new Date(now.getTime() - LOCK_DURATION_MS);
  const lockedUntil = new Date(now.getTime() + LOCK_DURATION_MS);
  const rows = await tx.$queryRaw<{ failed_count: number }[]>`
    INSERT INTO login_attempt AS a (username, ip, failed_count, last_failed_at, locked_until)
    VALUES (${username}, ${ip}, 1, ${now}, NULL)
    ON CONFLICT (username, ip) DO UPDATE SET
      failed_count = CASE
        WHEN a.last_failed_at <= ${windowStart} OR a.locked_until <= ${now} THEN 1
        ELSE a.failed_count + 1
      END,
      last_failed_at = ${now},
      locked_until = NULL
    RETURNING failed_count`;
  const failedCount = rows[0]!.failed_count;
  if (failedCount >= MAX_FAILED_ATTEMPTS) {
    await tx.loginAttempt.update({
      where: { username_ip: { username, ip } },
      data: { lockedUntil },
    });
  }
  return failedCount;
}

/**
 * Checks the credentials and opens a session. Throws DomainError:
 * VALIDATION_FAILED, TOO_MANY_ATTEMPTS, INVALID_CREDENTIALS or USER_INACTIVE.
 * Failure bookkeeping (counter, LOGIN_FAILED audit) is committed before the throw.
 */
export async function login(input: unknown, meta: RequestMeta): Promise<LoginResult> {
  const parsed = loginInputSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  const { username, password } = parsed.data;
  const ip = ipKey(meta);
  const now = new Date();
  const { prisma } = await import('@drinks/db');

  const attempt = await prisma.loginAttempt.findUnique({
    where: { username_ip: { username, ip } },
  });
  if (attempt?.lockedUntil && attempt.lockedUntil > now) {
    const lockedUntil = attempt.lockedUntil;
    await withTransaction((tx) =>
      auditFailure(tx, meta, username, null, ErrorCode.TOO_MANY_ATTEMPTS, { lockedUntil }),
    );
    throw new DomainError(ErrorCode.TOO_MANY_ATTEMPTS, { lockedUntil: lockedUntil.toISOString() });
  }

  const user = await prisma.user.findUnique({
    where: { username },
    select: { ...userSelect, passwordHash: true },
  });
  // Always run argon2, also for unknown logins: equal timing hides which exist.
  const passwordOk = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), password);

  if (!user || !passwordOk) {
    await withTransaction(async (tx) => {
      const failedCount = await recordFailure(tx, username, ip, now);
      await auditFailure(tx, meta, username, user?.id ?? null, ErrorCode.INVALID_CREDENTIALS, {
        failedCount,
      });
    });
    throw new DomainError(ErrorCode.INVALID_CREDENTIALS);
  }

  if (!user.isActive) {
    // Right password, so not a guess: reported, but not counted.
    await withTransaction((tx) =>
      auditFailure(tx, meta, username, user.id, ErrorCode.USER_INACTIVE),
    );
    throw new DomainError(ErrorCode.USER_INACTIVE);
  }

  const token = generateSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  const session = toAuthSession(user, expiresAt);

  await withTransaction(async (tx) => {
    await tx.loginAttempt.deleteMany({ where: { username, ip } });
    await tx.session.create({
      data: {
        id: hashSessionToken(token),
        userId: user.id,
        expiresAt,
        ip: meta.ip,
        userAgent: meta.userAgent,
        createdAt: now,
      },
    });
    await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
    await audit.log(
      tx,
      { user: { id: user.id }, storeId: session.storeId, requestId: meta.requestId },
      {
        action: 'LOGIN',
        entityType: 'user',
        entityId: user.id,
        meta: { ip: meta.ip, userAgent: meta.userAgent },
      },
    );
  });

  return { token, session };
}

/** Deletes the session behind the token; unknown tokens are ignored. */
export async function logout(token: string | null | undefined): Promise<void> {
  if (!token) return;
  const { prisma } = await import('@drinks/db');
  await prisma.session.deleteMany({ where: { id: hashSessionToken(token) } });
}

/**
 * Resolves a cookie token to its session, or null when it is unknown, expired
 * or the user is inactive. Read from the DB on every request (ADR-006), and the
 * expiry slides to now + 30 days (written at most once per day).
 */
export async function getSession(token: string | null | undefined): Promise<AuthSession | null> {
  if (!token) return null;
  const { prisma } = await import('@drinks/db');
  const id = hashSessionToken(token);
  const row = await prisma.session.findUnique({
    where: { id },
    select: { expiresAt: true, user: { select: userSelect } },
  });
  if (!row) return null;

  const now = new Date();
  if (row.expiresAt <= now || !row.user.isActive) {
    await prisma.session.deleteMany({ where: { id } });
    return null;
  }

  let expiresAt = row.expiresAt;
  if (expiresAt.getTime() - now.getTime() < SESSION_TTL_MS - SESSION_REFRESH_INTERVAL_MS) {
    expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await prisma.session.updateMany({ where: { id }, data: { expiresAt } });
  }
  return toAuthSession(row.user, expiresAt);
}

/** ServiceContext for service calls made on behalf of a session. */
export function toServiceContext(session: AuthSession, requestId: string): ServiceContext {
  return {
    user: { id: session.user.id, role: session.user.role, locale: session.user.locale },
    storeId: session.storeId,
    organizationId: session.organizationId,
    requestId,
  };
}
