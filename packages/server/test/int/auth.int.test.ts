// T-201: login, lockout, sessions and their audit rows against a real Postgres.
// Auth commits its own transactions, so fixtures are committed too. They are
// left in place (audit_log is append-only and references the users); every run
// uses fresh usernames.
import { prisma } from '@drinks/db';
import { ErrorCode } from '@drinks/shared';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { auth, hashPassword, type RequestMeta } from '../../src/index';

const RUN = Date.now().toString(36);
const PASSWORD = 'correct horse battery';
const meta = (ip: string | null = '10.0.0.1'): RequestMeta => ({
  ip,
  userAgent: 'vitest',
  requestId: `req-${RUN}`,
});

let organizationId: string;
let storeId: string;
let userCount = 0;

/** A fresh STAFF user (the DB allows a single OWNER). */
async function createUser(options: { isActive?: boolean } = {}) {
  userCount += 1;
  return prisma.user.create({
    data: {
      organizationId,
      username: `t201_${RUN}_${userCount}`,
      passwordHash: await hashPassword(PASSWORD),
      fullName: 'T-201 user',
      role: 'STAFF',
      isActive: options.isActive ?? true,
    },
  });
}

function loginError(input: unknown, requestMeta = meta()) {
  return auth.login(input, requestMeta).then(
    () => {
      throw new Error('login unexpectedly succeeded');
    },
    (error: unknown) => error,
  );
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Fakes only Date, so pg's sockets and timers keep working. */
function setNow(date: Date) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(date);
}

beforeAll(async () => {
  const organization = await prisma.organization.create({ data: { name: `T-201 org ${RUN}` } });
  const store = await prisma.store.create({
    data: { organizationId: organization.id, name: 'T-201 store' },
  });
  organizationId = organization.id;
  storeId = store.id;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('auth.login', () => {
  it('opens a session for the right password, username case-insensitive', async () => {
    const user = await createUser();
    const { token, session } = await auth.login(
      { username: `  ${user.username.toUpperCase()} `, password: PASSWORD },
      meta(),
    );

    expect(session.user).toEqual({
      id: user.id,
      username: user.username,
      fullName: 'T-201 user',
      role: 'STAFF',
      locale: 'uz',
    });
    expect(session.storeId).toBe(storeId);
    expect(session.organizationId).toBe(organizationId);

    // Only the SHA-256 of the token is stored.
    const rows = await prisma.session.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]!.id).not.toContain(token);
    expect(rows[0]).toMatchObject({ ip: '10.0.0.1', userAgent: 'vitest' });

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.lastLoginAt).not.toBeNull();
    expect((await auth.getSession(token))?.user.id).toBe(user.id);
  });

  it('rejects a wrong password with INVALID_CREDENTIALS and counts it', async () => {
    const user = await createUser();
    const error = await loginError({ username: user.username, password: 'wrong password' });
    expect(error).toMatchObject({ code: ErrorCode.INVALID_CREDENTIALS });
    expect(
      await prisma.loginAttempt.findUnique({
        where: { username_ip: { username: user.username, ip: '10.0.0.1' } },
      }),
    ).toMatchObject({ failedCount: 1, lockedUntil: null });
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it('rejects an unknown user the same way, still running argon2', async () => {
    const user = await createUser();
    const time = async (username: string) => {
      const started = performance.now();
      await loginError({ username, password: 'wrong password' }, meta('10.0.0.9'));
      return performance.now() - started;
    };
    const unknown = `t201_${RUN}_nobody`;
    await time(unknown); // warm-up: builds the dummy hash once

    const known: number[] = [];
    const missing: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      known.push(await time(user.username));
      missing.push(await time(unknown));
    }
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[1]!;
    // Without the dummy verify an unknown user returns in ~1 ms instead of tens.
    expect(median(missing)).toBeGreaterThan(median(known) * 0.5);

    expect(await loginError({ username: unknown, password: PASSWORD })).toMatchObject({
      code: ErrorCode.INVALID_CREDENTIALS,
    });
  });

  it('rejects an inactive user: USER_INACTIVE only with the right password', async () => {
    const user = await createUser({ isActive: false });
    expect(await loginError({ username: user.username, password: PASSWORD })).toMatchObject({
      code: ErrorCode.USER_INACTIVE,
    });
    expect(await loginError({ username: user.username, password: 'wrong password' })).toMatchObject(
      { code: ErrorCode.INVALID_CREDENTIALS },
    );
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it('rejects invalid input with VALIDATION_FAILED', async () => {
    expect(await loginError({ username: ' ', password: '' })).toMatchObject({
      code: ErrorCode.VALIDATION_FAILED,
      fieldErrors: { username: expect.any(Array), password: expect.any(Array) },
    });
  });
});

describe('auth.login lockout (5 failures → 15 minutes)', () => {
  it('blocks the 6th attempt, even with the right password, for that IP only', async () => {
    const user = await createUser();
    for (let i = 1; i <= 5; i += 1) {
      expect(await loginError({ username: user.username, password: `wrong ${i}` })).toMatchObject({
        code: ErrorCode.INVALID_CREDENTIALS,
      });
    }
    const blocked = await loginError({ username: user.username, password: PASSWORD });
    expect(blocked).toMatchObject({
      code: ErrorCode.TOO_MANY_ATTEMPTS,
      params: { lockedUntil: expect.any(String) },
    });
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);

    // The lock is per (username, IP), as architecture §12 specifies.
    await expect(
      auth.login({ username: user.username, password: PASSWORD }, meta('10.0.0.2')),
    ).resolves.toMatchObject({ session: { user: { id: user.id } } });
  });

  it('lifts the block after 15 minutes and resets the counter on success', async () => {
    const user = await createUser();
    const start = new Date();
    setNow(start);
    for (let i = 0; i < 5; i += 1) {
      await loginError({ username: user.username, password: 'wrong password' });
    }

    setNow(new Date(start.getTime() + 14 * MINUTE));
    expect(await loginError({ username: user.username, password: PASSWORD })).toMatchObject({
      code: ErrorCode.TOO_MANY_ATTEMPTS,
    });

    setNow(new Date(start.getTime() + 15 * MINUTE + 1_000));
    await expect(
      auth.login({ username: user.username, password: PASSWORD }, meta()),
    ).resolves.toBeDefined();
    expect(
      await prisma.loginAttempt.count({ where: { username: user.username, ip: '10.0.0.1' } }),
    ).toBe(0);
  });

  it('starts counting again after the block expires', async () => {
    const user = await createUser();
    const start = new Date();
    setNow(start);
    for (let i = 0; i < 5; i += 1) {
      await loginError({ username: user.username, password: 'wrong password' });
    }
    setNow(new Date(start.getTime() + 16 * MINUTE));
    await loginError({ username: user.username, password: 'wrong password' });
    expect(
      await prisma.loginAttempt.findUnique({
        where: { username_ip: { username: user.username, ip: '10.0.0.1' } },
      }),
    ).toMatchObject({ failedCount: 1, lockedUntil: null });
  });
});

describe('sessions', () => {
  it('logout deletes the session', async () => {
    const user = await createUser();
    const { token } = await auth.login({ username: user.username, password: PASSWORD }, meta());
    await auth.logout(token);
    expect(await auth.getSession(token)).toBeNull();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    await expect(auth.logout(token)).resolves.toBeUndefined();
  });

  it('returns null for unknown or missing tokens', async () => {
    expect(await auth.getSession('not-a-token')).toBeNull();
    expect(await auth.getSession(undefined)).toBeNull();
  });

  it('slides the 30-day expiry, writing at most once a day', async () => {
    const user = await createUser();
    const start = new Date();
    setNow(start);
    const { token, session } = await auth.login(
      { username: user.username, password: PASSWORD },
      meta(),
    );
    expect(session.expiresAt.getTime()).toBe(start.getTime() + 30 * DAY);

    // Within a day: no write.
    setNow(new Date(start.getTime() + 2 * 60 * MINUTE));
    expect((await auth.getSession(token))?.expiresAt.getTime()).toBe(start.getTime() + 30 * DAY);

    // Later: pushed to now + 30 days.
    const later = new Date(start.getTime() + 20 * DAY);
    setNow(later);
    expect((await auth.getSession(token))?.expiresAt.getTime()).toBe(later.getTime() + 30 * DAY);
    const row = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.expiresAt.getTime()).toBe(later.getTime() + 30 * DAY);

    // Unused for more than 30 days: expired and deleted.
    setNow(new Date(later.getTime() + 30 * DAY + 1_000));
    expect(await auth.getSession(token)).toBeNull();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it('ends the session of a deactivated user', async () => {
    const user = await createUser();
    const { token } = await auth.login({ username: user.username, password: PASSWORD }, meta());
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    expect(await auth.getSession(token)).toBeNull();
  });
});

describe('audit', () => {
  it('writes LOGIN and LOGIN_FAILED rows without passwords, hashes or tokens', async () => {
    const user = await createUser();
    const unknown = `t201_${RUN}_ghost`;
    await loginError({ username: user.username, password: 'wrong-secret-1' }, meta('10.0.0.5'));
    await loginError({ username: unknown, password: 'wrong-secret-2' }, meta('10.0.0.5'));
    const { token } = await auth.login(
      { username: user.username, password: PASSWORD },
      meta('10.0.0.5'),
    );

    const rows = await prisma.auditLog.findMany({
      where: { OR: [{ entityId: user.id }, { entityId: unknown }] },
      orderBy: { id: 'asc' },
    });
    expect(rows.map((row) => [row.action, row.userId, row.storeId])).toEqual([
      ['LOGIN_FAILED', null, null],
      ['LOGIN_FAILED', null, null],
      ['LOGIN', user.id, storeId],
    ]);
    expect(rows[0]!.meta).toMatchObject({
      username: user.username,
      ip: '10.0.0.5',
      reason: 'INVALID_CREDENTIALS',
      failedCount: 1,
      requestId: `req-${RUN}`,
    });
    expect(rows[1]!.meta).toMatchObject({ username: unknown, reason: 'INVALID_CREDENTIALS' });
    expect(rows[2]!.meta).toMatchObject({ ip: '10.0.0.5', userAgent: 'vitest' });

    const dump = JSON.stringify(rows, (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
    const { id: tokenHash } = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    for (const secret of [PASSWORD, 'wrong-secret-1', 'wrong-secret-2', token, tokenHash]) {
      expect(dump).not.toContain(secret);
    }
    expect(dump).not.toContain('$argon2');
  });
});
