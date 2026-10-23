// User accounts (T-204, architecture §11, business-logic §11): the OWNER manages
// STAFF accounts, changes their own login/password with the current password,
// and the server admin resets any password from the CLI (T-205). Accounts are
// never deleted, only deactivated. Passwords and hashes never reach the audit log.
import {
  DomainError,
  ErrorCode,
  type UserAccount,
  type UserRole,
  validationError,
  parseInput,
} from '@drinks/shared';
import {
  localeSchema,
  type OwnPasswordInput,
  ownPasswordInputSchema,
  type OwnProfileInput,
  ownProfileInputSchema,
  type OwnUsernameInput,
  ownUsernameInputSchema,
  resetPasswordInputSchema,
  type UserCreateInput,
  userCreateInputSchema,
  type UserIdInput,
  userIdInputSchema,
  type UserSetPasswordInput,
  userSetPasswordInputSchema,
  type UserUpdateInput,
  userUpdateInputSchema,
} from '@drinks/shared/schemas';

import type { ServiceContext } from '../../core/context';
import { assertCan } from '../../core/rbac';
import { type Tx, withTransaction } from '../../core/tx';
import { audit } from '../audit';
import { hashPassword, verifyPassword } from '../auth/password';
import { hashSessionToken } from '../auth/token';

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

// ---------------------------------------------------------------------------
// Account management by the OWNER (permission `user.manage`).

const ACCOUNT_SELECT = {
  id: true,
  username: true,
  fullName: true,
  role: true,
  locale: true,
  isActive: true,
  lastLoginAt: true,
  passwordChangedAt: true,
  createdAt: true,
} as const;

/** Copies only the DTO fields (a row selected with the hash must not leak it). */
function toAccount(row: UserAccount): UserAccount {
  return {
    id: row.id,
    username: row.username,
    fullName: row.fullName,
    role: row.role,
    locale: row.locale,
    isActive: row.isActive,
    lastLoginAt: row.lastLoginAt,
    passwordChangedAt: row.passwordChangedAt,
    createdAt: row.createdAt,
  };
}

function duplicateUsername(): DomainError {
  return new DomainError(ErrorCode.DUPLICATE_VALUE, { entity: 'user', field: 'username' });
}

/** Unique-constraint violation (P2002) — a concurrent request took the same login. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

/** Runs a write; a concurrent duplicate login (P2002) → DUPLICATE_VALUE. */
async function write<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await withTransaction(fn);
  } catch (error) {
    if (isUniqueViolation(error)) throw duplicateUsername();
    throw error;
  }
}

/**
 * Logins are globally unique and stored lowercased, so comparing the
 * normalized value is the case-insensitive check (inactive accounts count too).
 */
async function assertUsernameFree(tx: Tx, username: string, exceptId?: string): Promise<void> {
  const clash = await tx.user.findUnique({ where: { username }, select: { id: true } });
  if (clash && clash.id !== exceptId) throw duplicateUsername();
}

// A type alias (not an interface) so it fits the audit meta's Record type.
type Revoked = { sessionsRevoked: number; attemptsCleared: number };

/**
 * Signs a user out: deletes their sessions (except `keepSessionId`, the
 * caller's own when they change their own login/password) and the failed-login
 * counters of the given logins — the counter is keyed by the typed login, so a
 * renamed account must neither keep nor inherit a lock.
 */
async function revokeAccess(
  tx: Tx,
  userId: string,
  usernames: string[],
  keepSessionId?: string,
): Promise<Revoked> {
  const sessions = await tx.session.deleteMany({
    where: { userId, ...(keepSessionId && { id: { not: keepSessionId } }) },
  });
  const attempts = await tx.loginAttempt.deleteMany({ where: { username: { in: usernames } } });
  return { sessionsRevoked: sessions.count, attemptsCleared: attempts.count };
}

/**
 * The STAFF account the OWNER acts on. Another organization's user →
 * NOT_FOUND; the caller's own account or the OWNER's → FORBIDDEN (own changes
 * go through "My account"; the OWNER can never be deactivated).
 */
async function findStaff(tx: Tx, ctx: ServiceContext, id: string): Promise<UserAccount> {
  const row = await tx.user.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: ACCOUNT_SELECT,
  });
  if (!row) throw new DomainError(ErrorCode.NOT_FOUND, { entity: 'user' });
  if (row.id === ctx.user.id) throw new DomainError(ErrorCode.FORBIDDEN, { reason: 'self' });
  if (row.role !== 'STAFF') throw new DomainError(ErrorCode.FORBIDDEN, { reason: 'owner' });
  return row;
}

/** The organization's accounts: the OWNER first, then active and inactive staff by name. */
export async function list(ctx: ServiceContext): Promise<UserAccount[]> {
  assertCan(ctx.user, 'user.manage');
  const { prisma } = await import('@drinks/db');
  const rows = await prisma.user.findMany({
    where: { organizationId: ctx.organizationId },
    select: ACCOUNT_SELECT,
    orderBy: [{ role: 'asc' }, { isActive: 'desc' }, { fullName: 'asc' }, { username: 'asc' }],
  });
  return rows.map(toAccount);
}

/** Creates a STAFF account (the role is never an input: one OWNER per organization). */
export async function create(ctx: ServiceContext, input: UserCreateInput): Promise<UserAccount> {
  assertCan(ctx.user, 'user.manage');
  const { fullName, username, password, locale } = parseInput(userCreateInputSchema, input);
  // argon2 is deliberately slow; hash before opening the transaction.
  const passwordHash = await hashPassword(password);

  return write(async (tx) => {
    await assertUsernameFree(tx, username);
    const row = await tx.user.create({
      data: {
        organizationId: ctx.organizationId,
        username,
        passwordHash,
        fullName,
        role: 'STAFF',
        locale,
        createdById: ctx.user.id,
      },
      select: ACCOUNT_SELECT,
    });
    // A lock left by failed attempts at a then-unknown login must not hit the new account.
    const { attemptsCleared } = await revokeAccess(tx, row.id, [username]);
    await audit.log(tx, ctx, {
      action: 'USER_CREATE',
      entityType: 'user',
      entityId: row.id,
      after: { username, fullName, role: row.role, locale, isActive: true },
      ...(attemptsCleared > 0 && { meta: { attemptsCleared } }),
    });
    return toAccount(row);
  });
}

const EDITABLE_FIELDS = ['fullName', 'username', 'locale'] as const;

/** Edits a STAFF account's full name, login and language; a new login signs them out. */
export async function update(ctx: ServiceContext, input: UserUpdateInput): Promise<UserAccount> {
  assertCan(ctx.user, 'user.manage');
  const { id, ...next } = parseInput(userUpdateInputSchema, input);

  return write(async (tx) => {
    const current = await findStaff(tx, ctx, id);
    const fields = EDITABLE_FIELDS.filter((field) => current[field] !== next[field]);
    if (fields.length === 0) return current;

    const usernameChanged = fields.includes('username');
    if (usernameChanged) await assertUsernameFree(tx, next.username, id);
    const row = await tx.user.update({
      where: { id },
      data: pick(next, fields),
      select: ACCOUNT_SELECT,
    });
    const revoked = usernameChanged
      ? await revokeAccess(tx, id, [current.username, next.username])
      : undefined;
    await audit.log(tx, ctx, {
      action: 'USER_UPDATE',
      entityType: 'user',
      entityId: id,
      before: pick(current, fields),
      after: pick(next, fields),
      ...(revoked && { meta: revoked }),
    });
    return toAccount(row);
  });
}

function pick<T extends object, K extends keyof T>(value: T, keys: readonly K[]): Pick<T, K> {
  return Object.fromEntries(keys.map((key) => [key, value[key]])) as Pick<T, K>;
}

/**
 * The OWNER sets a new password for a STAFF account: all of its sessions and
 * its failed-login counters go. An inactive account stays inactive (as OQ-17).
 */
export async function setPassword(
  ctx: ServiceContext,
  input: UserSetPasswordInput,
): Promise<UserAccount> {
  assertCan(ctx.user, 'user.manage');
  const { id, password } = parseInput(userSetPasswordInputSchema, input);
  const passwordHash = await hashPassword(password);

  return withTransaction(async (tx) => {
    const current = await findStaff(tx, ctx, id);
    const row = await tx.user.update({
      where: { id },
      data: { passwordHash, passwordChangedAt: new Date() },
      select: ACCOUNT_SELECT,
    });
    const revoked = await revokeAccess(tx, id, [current.username]);
    await audit.log(tx, ctx, {
      action: 'PASSWORD_RESET',
      entityType: 'user',
      entityId: id,
      meta: { username: current.username, source: 'owner', ...revoked },
    });
    return toAccount(row);
  });
}

/** Blocks sign-in and ends every session at once (ADR-006). The OWNER cannot be deactivated. */
export async function deactivate(ctx: ServiceContext, input: UserIdInput): Promise<UserAccount> {
  return setActive(ctx, input, false);
}

/** Lets a deactivated STAFF account sign in again (with its current password). */
export async function activate(ctx: ServiceContext, input: UserIdInput): Promise<UserAccount> {
  return setActive(ctx, input, true);
}

async function setActive(
  ctx: ServiceContext,
  input: UserIdInput,
  isActive: boolean,
): Promise<UserAccount> {
  assertCan(ctx.user, 'user.manage');
  const { id } = parseInput(userIdInputSchema, input);

  return withTransaction(async (tx) => {
    const current = await findStaff(tx, ctx, id);
    if (current.isActive === isActive) return current;
    const row = await tx.user.update({
      where: { id },
      data: { isActive },
      select: ACCOUNT_SELECT,
    });
    const sessionsRevoked = isActive
      ? 0
      : (await tx.session.deleteMany({ where: { userId: id } })).count;
    await audit.log(tx, ctx, {
      action: isActive ? 'USER_ACTIVATE' : 'USER_DEACTIVATE',
      entityType: 'user',
      entityId: id,
      before: { isActive: current.isActive },
      after: { isActive },
      ...(!isActive && { meta: { sessionsRevoked } }),
    });
    return toAccount(row);
  });
}

// ---------------------------------------------------------------------------
// "My account" (OWNER). STAFF cannot change their own login or password —
// the OWNER does it for them (architecture §11).

/** The caller's own account with its hash, for the current-password check. */
async function findSelf(ctx: ServiceContext): Promise<UserAccount & { passwordHash: string }> {
  const { prisma } = await import('@drinks/db');
  const row = await prisma.user.findFirst({
    where: { id: ctx.user.id, organizationId: ctx.organizationId },
    select: { ...ACCOUNT_SELECT, passwordHash: true },
  });
  if (!row) throw new DomainError(ErrorCode.NOT_FOUND, { entity: 'user' });
  return row;
}

async function assertCurrentPassword(passwordHash: string, password: string): Promise<void> {
  if (!(await verifyPassword(passwordHash, password))) {
    throw new DomainError(ErrorCode.CURRENT_PASSWORD_INVALID);
  }
}

/** The OWNER's own full name (no password needed). */
export async function updateOwnProfile(
  ctx: ServiceContext,
  input: OwnProfileInput,
): Promise<UserAccount> {
  assertCan(ctx.user, 'user.manage');
  const { fullName } = parseInput(ownProfileInputSchema, input);
  const self = await findSelf(ctx);
  if (self.fullName === fullName) return toAccount(self);

  return withTransaction(async (tx) => {
    const row = await tx.user.update({
      where: { id: self.id },
      data: { fullName },
      select: ACCOUNT_SELECT,
    });
    await audit.log(tx, ctx, {
      action: 'USER_UPDATE',
      entityType: 'user',
      entityId: self.id,
      before: { fullName: self.fullName },
      after: { fullName },
    });
    return toAccount(row);
  });
}

/**
 * The OWNER's own login, confirmed with the current password
 * (CURRENT_PASSWORD_INVALID otherwise). Every other session of theirs is
 * signed out; the one making the change (`currentSessionToken`, the cookie
 * value) stays (OQ-22).
 */
export async function changeOwnUsername(
  ctx: ServiceContext,
  input: OwnUsernameInput,
  currentSessionToken: string | null | undefined,
): Promise<UserAccount> {
  assertCan(ctx.user, 'user.manage');
  const { currentPassword, username } = parseInput(ownUsernameInputSchema, input);
  const self = await findSelf(ctx);
  await assertCurrentPassword(self.passwordHash, currentPassword);
  if (self.username === username) return toAccount(self);

  return write(async (tx) => {
    await assertUsernameFree(tx, username, self.id);
    const row = await tx.user.update({
      where: { id: self.id },
      data: { username },
      select: ACCOUNT_SELECT,
    });
    const revoked = await revokeAccess(
      tx,
      self.id,
      [self.username, username],
      keptSession(currentSessionToken),
    );
    await audit.log(tx, ctx, {
      action: 'USER_UPDATE',
      entityType: 'user',
      entityId: self.id,
      before: { username: self.username },
      after: { username },
      meta: { source: 'self', ...revoked },
    });
    return toAccount(row);
  });
}

/**
 * The OWNER's own password, confirmed with the current one
 * (CURRENT_PASSWORD_INVALID otherwise). Every other session of theirs is
 * signed out; the one making the change stays (OQ-22).
 */
export async function changeOwnPassword(
  ctx: ServiceContext,
  input: OwnPasswordInput,
  currentSessionToken: string | null | undefined,
): Promise<UserAccount> {
  assertCan(ctx.user, 'user.manage');
  const { currentPassword, newPassword } = parseInput(ownPasswordInputSchema, input);
  const self = await findSelf(ctx);
  await assertCurrentPassword(self.passwordHash, currentPassword);
  const passwordHash = await hashPassword(newPassword);

  return withTransaction(async (tx) => {
    const row = await tx.user.update({
      where: { id: self.id },
      data: { passwordHash, passwordChangedAt: new Date() },
      select: ACCOUNT_SELECT,
    });
    const revoked = await revokeAccess(
      tx,
      self.id,
      [self.username],
      keptSession(currentSessionToken),
    );
    await audit.log(tx, ctx, {
      action: 'PASSWORD_RESET',
      entityType: 'user',
      entityId: self.id,
      meta: { username: self.username, source: 'self', ...revoked },
    });
    return toAccount(row);
  });
}

/** session.id of the caller's cookie token (sessions are stored by the token's hash). */
function keptSession(token: string | null | undefined): string | undefined {
  return token ? hashSessionToken(token) : undefined;
}
