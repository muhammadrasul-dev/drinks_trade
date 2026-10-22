// T-205: users.resetPassword, the service behind `pnpm user:reset-password`
// (business-logic §11), against a real Postgres.
import { prisma } from '@drinks/db';
import { makeStoreFixture, makeUser, type StoreFixture } from '@drinks/db/test-utils';
import { ErrorCode } from '@drinks/shared';
import { beforeAll, describe, expect, it } from 'vitest';

import { auth, hashPassword, type RequestMeta, users, verifyPassword } from '../../src/index';

const OLD_PASSWORD = 'old password 1';
const NEW_PASSWORD = 'new password 2';
const resetMeta = { requestId: 'req-reset', source: 'cli' };
const requestMeta = (ip: string): RequestMeta => ({ ip, userAgent: 'vitest', requestId: 'req' });

let fixture: StoreFixture;

beforeAll(async () => {
  fixture = await makeStoreFixture(prisma);
  const passwordHash = await hashPassword(OLD_PASSWORD);
  await prisma.user.updateMany({ data: { passwordHash } });
});

function errorOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('unexpectedly succeeded');
    },
    (error: unknown) => error,
  );
}

describe('users.resetPassword', () => {
  it('sets the hash, revokes sessions, lifts the lock and audits without the password', async () => {
    const { owner, staff } = fixture;
    // Two owner sessions, one staff session that must survive.
    await auth.login({ username: owner.username, password: OLD_PASSWORD }, requestMeta('1.1.1.1'));
    await auth.login({ username: owner.username, password: OLD_PASSWORD }, requestMeta('2.2.2.2'));
    await auth.login({ username: staff.username, password: OLD_PASSWORD }, requestMeta('1.1.1.1'));
    // Lock the owner on one IP, one failure on another; a staff failure stays.
    for (let i = 0; i < 5; i += 1) {
      await errorOf(
        auth.login({ username: owner.username, password: 'wrong' }, requestMeta('3.3.3.3')),
      );
    }
    await errorOf(
      auth.login({ username: owner.username, password: 'wrong' }, requestMeta('4.4.4.4')),
    );
    await errorOf(
      auth.login({ username: staff.username, password: 'wrong' }, requestMeta('3.3.3.3')),
    );
    expect(
      await errorOf(
        auth.login({ username: owner.username, password: OLD_PASSWORD }, requestMeta('3.3.3.3')),
      ),
    ).toMatchObject({ code: ErrorCode.TOO_MANY_ATTEMPTS });

    // The login is matched case-insensitively, like auth.login.
    const result = await users.resetPassword(
      { username: ` ${owner.username.toUpperCase()} `, password: NEW_PASSWORD },
      resetMeta,
    );

    expect(result).toEqual({
      userId: owner.id,
      username: owner.username,
      role: 'OWNER',
      isActive: true,
      sessionsRevoked: 2,
      attemptsCleared: 2,
    });
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(await verifyPassword(saved.passwordHash, NEW_PASSWORD)).toBe(true);
    expect(await verifyPassword(saved.passwordHash, OLD_PASSWORD)).toBe(false);
    expect(saved.passwordChangedAt).toBeInstanceOf(Date);
    expect(await prisma.session.count({ where: { userId: owner.id } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: staff.id } })).toBe(1);
    expect(await prisma.loginAttempt.count({ where: { username: owner.username } })).toBe(0);
    expect(await prisma.loginAttempt.count({ where: { username: staff.username } })).toBe(1);

    const rows = await prisma.auditLog.findMany({ where: { action: 'PASSWORD_RESET' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: null,
      storeId: fixture.store.id,
      entityType: 'user',
      entityId: owner.id,
      before: null,
      after: null,
      meta: {
        username: owner.username,
        source: 'cli',
        sessionsRevoked: 2,
        attemptsCleared: 2,
        requestId: 'req-reset',
      },
    });
    const serialized = JSON.stringify(rows[0], (_key, v: unknown) =>
      typeof v === 'bigint' ? v.toString() : v,
    );
    expect(serialized).not.toContain(NEW_PASSWORD);
    expect(serialized).not.toContain(saved.passwordHash);

    // The lock is gone: the new password works at once from the locked IP.
    const { session } = await auth.login(
      { username: owner.username, password: NEW_PASSWORD },
      requestMeta('3.3.3.3'),
    );
    expect(session.user.id).toBe(owner.id);
  });

  it('keeps an inactive user inactive', async () => {
    const user = await makeUser(prisma, {
      organizationId: fixture.organization.id,
      passwordHash: await hashPassword(OLD_PASSWORD),
      isActive: false,
    });

    const result = await users.resetPassword(
      { username: user.username, password: NEW_PASSWORD },
      resetMeta,
    );

    expect(result).toMatchObject({ isActive: false, role: 'STAFF', sessionsRevoked: 0 });
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(saved.isActive).toBe(false);
    expect(await verifyPassword(saved.passwordHash, NEW_PASSWORD)).toBe(true);
    expect(
      await errorOf(
        auth.login({ username: user.username, password: NEW_PASSWORD }, requestMeta('5.5.5.5')),
      ),
    ).toMatchObject({ code: ErrorCode.USER_INACTIVE });
    expect(
      await prisma.auditLog.count({ where: { action: 'PASSWORD_RESET', entityId: user.id } }),
    ).toBe(1);
  });

  it('rejects an unknown login with NOT_FOUND and changes nothing', async () => {
    const before = await prisma.auditLog.count({ where: { action: 'PASSWORD_RESET' } });

    expect(
      await errorOf(users.resetPassword({ username: 'nobody', password: NEW_PASSWORD }, resetMeta)),
    ).toMatchObject({ code: ErrorCode.NOT_FOUND, params: { entity: 'user', username: 'nobody' } });
    expect(await prisma.auditLog.count({ where: { action: 'PASSWORD_RESET' } })).toBe(before);
  });

  it('rejects a short password with VALIDATION_FAILED and keeps the old hash', async () => {
    const { staff } = fixture;
    const before = await prisma.user.findUniqueOrThrow({ where: { id: staff.id } });

    const error = await errorOf(
      users.resetPassword({ username: staff.username, password: 'short' }, resetMeta),
    );

    expect(error).toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
    expect(error).toHaveProperty('fieldErrors.password');
    const after = await prisma.user.findUniqueOrThrow({ where: { id: staff.id } });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(await prisma.session.count({ where: { userId: staff.id } })).toBe(1);
  });
});
