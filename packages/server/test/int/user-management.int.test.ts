// T-204: account management by the OWNER and "My account" (architecture §11,
// business-logic §11) against a real Postgres. Each test builds its own
// organization; logins are unique per run.
import { prisma } from '@drinks/db';
import { makeStoreFixture, makeUser, type StoreFixture } from '@drinks/db/test-utils';
import { ErrorCode } from '@drinks/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  auth,
  hashPassword,
  type RequestMeta,
  type ServiceContext,
  users,
  verifyPassword,
} from '../../src/index';

const PASSWORD = 'password 123';
const NEW_PASSWORD = 'new password 456';
const meta = (ip = '10.0.0.1'): RequestMeta => ({ ip, userAgent: 'vitest', requestId: 'req' });

let passwordHash: string;
let f: StoreFixture;
let owner: ServiceContext;
let staff: ServiceContext;
let run = 0;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  f = await makeStoreFixture(prisma);
  await prisma.user.updateMany({
    where: { organizationId: f.organization.id },
    data: { passwordHash },
  });
  owner = {
    user: { id: f.owner.id, role: 'OWNER', locale: 'uz' },
    storeId: f.store.id,
    organizationId: f.organization.id,
    requestId: 'req-users',
  };
  staff = { ...owner, user: { id: f.staff.id, role: 'STAFF', locale: 'uz' } };
  run += 1;
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** A login unique across the test file (logins are global, not per organization). */
function login(name: string): string {
  return `t204_${Date.now().toString(36)}_${run}_${name}`.slice(0, 32);
}

function errorOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('unexpectedly succeeded');
    },
    (error: unknown) => error,
  );
}

const signIn = (username: string, password = PASSWORD, ip?: string) =>
  auth.login({ username, password }, meta(ip));

const sessionsOf = (userId: string) => prisma.session.count({ where: { userId } });
const auditOf = (entityId: string) =>
  prisma.auditLog.findMany({ where: { entityId }, orderBy: { id: 'asc' } });

/** The audit rows must not contain a password or a hash (architecture §11). */
async function expectNoSecrets(entityId: string, ...secrets: string[]): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: entityId } });
  const text = JSON.stringify(await auditOf(entityId), (_key, v: unknown) =>
    typeof v === 'bigint' ? v.toString() : v,
  );
  for (const secret of [...secrets, user.passwordHash, passwordHash]) {
    expect(text).not.toContain(secret);
  }
}

async function newStaff(name: string) {
  return users.create(owner, {
    fullName: `Xodim ${name}`,
    username: login(name),
    password: PASSWORD,
    locale: 'uz',
  });
}

describe('T-204: STAFF cannot manage users', () => {
  it('every management and own-account call is FORBIDDEN and writes nothing', async () => {
    const target = await newStaff('target');
    const before = await prisma.auditLog.count();
    const calls: Promise<unknown>[] = [
      users.list(staff),
      users.create(staff, {
        fullName: 'X',
        username: login('x'),
        password: PASSWORD,
        locale: 'uz',
      }),
      users.update(staff, {
        id: target.id,
        fullName: 'Y',
        username: target.username,
        locale: 'uz',
      }),
      users.setPassword(staff, { id: target.id, password: NEW_PASSWORD }),
      users.deactivate(staff, { id: target.id }),
      users.activate(staff, { id: target.id }),
      users.updateOwnProfile(staff, { fullName: 'Me' }),
      users.changeOwnUsername(staff, { currentPassword: PASSWORD, username: login('me') }, null),
      users.changeOwnPassword(
        staff,
        { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
        null,
      ),
    ];

    for (const call of calls) {
      expect(await errorOf(call)).toMatchObject({
        code: ErrorCode.FORBIDDEN,
        params: { permission: 'user.manage' },
      });
    }
    expect(await prisma.auditLog.count()).toBe(before);
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: f.staff.id } });
    expect(await verifyPassword(saved.passwordHash, PASSWORD)).toBe(true);
    expect(saved.username).toBe(f.staff.username);
  });
});

describe('users.list', () => {
  it('returns the organization accounts, OWNER first, without hashes', async () => {
    const inactive = await newStaff('a_inactive');
    await users.deactivate(owner, { id: inactive.id });
    await makeUser(prisma); // another organization

    const list = await users.list(owner);

    expect(list.map((u) => u.id)).toEqual([f.owner.id, f.staff.id, inactive.id]);
    expect(list[2]).toMatchObject({ isActive: false, role: 'STAFF' });
    expect(Object.keys(list[0]!).sort()).toEqual(
      [
        'createdAt',
        'fullName',
        'id',
        'isActive',
        'lastLoginAt',
        'locale',
        'passwordChangedAt',
        'role',
        'username',
      ].sort(),
    );
  });
});

describe('users.create', () => {
  it('creates a lowercased STAFF account that can sign in; the audit has no password', async () => {
    const username = login('ali');
    const created = await users.create(owner, {
      fullName: '  Ali Valiyev ',
      username: ` ${username.toUpperCase()} `,
      password: PASSWORD,
      locale: 'ru',
      role: 'OWNER',
    } as never);

    expect(created).toMatchObject({
      username,
      fullName: 'Ali Valiyev',
      role: 'STAFF',
      locale: 'ru',
      isActive: true,
    });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: created.id } });
    expect(row).toMatchObject({ organizationId: f.organization.id, createdById: f.owner.id });
    expect((await signIn(username)).session.user.id).toBe(created.id);

    const rows = await prisma.auditLog.findMany({
      where: { entityId: created.id, action: 'USER_CREATE' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: f.owner.id,
      storeId: f.store.id,
      after: { username, fullName: 'Ali Valiyev', role: 'STAFF', locale: 'ru', isActive: true },
    });
    await expectNoSecrets(created.id, PASSWORD);
  });

  it('T-204: a duplicate login → DUPLICATE_VALUE, case-insensitively, inactive ones too', async () => {
    const existing = await newStaff('dup');
    await users.deactivate(owner, { id: existing.id });
    const count = await prisma.user.count();

    expect(
      await errorOf(
        users.create(owner, {
          fullName: 'Dup',
          username: existing.username.toUpperCase(),
          password: PASSWORD,
          locale: 'uz',
        }),
      ),
    ).toMatchObject({
      code: ErrorCode.DUPLICATE_VALUE,
      params: { entity: 'user', field: 'username' },
    });
    // The OWNER's login is taken as well.
    expect(
      await errorOf(
        users.create(owner, {
          fullName: 'Dup',
          username: f.owner.username,
          password: PASSWORD,
          locale: 'uz',
        }),
      ),
    ).toMatchObject({ code: ErrorCode.DUPLICATE_VALUE });
    expect(await prisma.user.count()).toBe(count);
  });

  it('two parallel creates of one login: one wins, the other gets DUPLICATE_VALUE', async () => {
    const username = login('race');
    const input = { fullName: 'Race', username, password: PASSWORD, locale: 'uz' as const };

    const results = await Promise.allSettled([
      users.create(owner, input),
      users.create(owner, input),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    expect(rejected?.reason).toMatchObject({ code: ErrorCode.DUPLICATE_VALUE });
    expect(await prisma.user.count({ where: { username } })).toBe(1);
  });

  it('clears a lock left on the login before the account existed', async () => {
    const username = login('locked');
    for (let i = 0; i < 5; i += 1) await errorOf(signIn(username, 'wrong'));

    await users.create(owner, { fullName: 'L', username, password: PASSWORD, locale: 'uz' });

    expect(await prisma.loginAttempt.count({ where: { username } })).toBe(0);
    await expect(signIn(username)).resolves.toBeDefined();
  });

  it('rejects a bad login format with VALIDATION_FAILED', async () => {
    const error = await errorOf(
      users.create(owner, { fullName: 'B', username: 'a b', password: 'short', locale: 'uz' }),
    );
    expect(error).toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
    expect(error).toHaveProperty('fieldErrors.username');
    expect(error).toHaveProperty('fieldErrors.password');
  });
});

describe('users.update', () => {
  it('a new login signs the user out and clears both logins’ counters', async () => {
    const target = await newStaff('rename');
    const newLogin = login('renamed');
    await signIn(target.username);
    await signIn(target.username);
    await errorOf(signIn(target.username, 'wrong'));
    await errorOf(signIn(newLogin, 'wrong'));

    const updated = await users.update(owner, {
      id: target.id,
      fullName: 'Renamed',
      username: newLogin.toUpperCase(),
      locale: 'ru',
    });

    expect(updated).toMatchObject({ username: newLogin, fullName: 'Renamed', locale: 'ru' });
    expect(await sessionsOf(target.id)).toBe(0);
    expect(
      await prisma.loginAttempt.count({ where: { username: { in: [target.username, newLogin] } } }),
    ).toBe(0);
    expect(await errorOf(signIn(target.username))).toMatchObject({
      code: ErrorCode.INVALID_CREDENTIALS,
    });
    await expect(signIn(newLogin)).resolves.toBeDefined();

    const rows = await prisma.auditLog.findMany({
      where: { entityId: target.id, action: 'USER_UPDATE' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: f.owner.id,
      before: { fullName: target.fullName, username: target.username, locale: 'uz' },
      after: { fullName: 'Renamed', username: newLogin, locale: 'ru' },
      meta: { sessionsRevoked: 2, attemptsCleared: 2 },
    });
  });

  it('a name or language change keeps the sessions; no change → no audit row', async () => {
    const target = await newStaff('keep');
    await signIn(target.username);

    await users.update(owner, {
      id: target.id,
      fullName: 'Kept',
      username: target.username,
      locale: 'uz',
    });
    await users.update(owner, {
      id: target.id,
      fullName: ' Kept ',
      username: target.username,
      locale: 'uz',
    });

    expect(await sessionsOf(target.id)).toBe(1);
    const rows = await prisma.auditLog.findMany({
      where: { entityId: target.id, action: 'USER_UPDATE' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      before: { fullName: target.fullName },
      after: { fullName: 'Kept' },
    });
    expect(rows[0]!.meta).not.toHaveProperty('sessionsRevoked');
  });

  it('T-204: a taken login → DUPLICATE_VALUE and nothing changes', async () => {
    const a = await newStaff('a');
    const b = await newStaff('b');

    expect(
      await errorOf(
        users.update(owner, { id: a.id, fullName: 'A', username: b.username, locale: 'uz' }),
      ),
    ).toMatchObject({ code: ErrorCode.DUPLICATE_VALUE, params: { field: 'username' } });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a.id } })).username).toBe(
      a.username,
    );
  });

  it('the OWNER account is not edited here (FORBIDDEN); another organization → NOT_FOUND', async () => {
    const stranger = await makeUser(prisma);
    const edit = (id: string, username: string) =>
      users.update(owner, { id, fullName: 'X', username, locale: 'uz' });

    expect(await errorOf(edit(f.owner.id, f.owner.username))).toMatchObject({
      code: ErrorCode.FORBIDDEN,
      params: { reason: 'self' },
    });
    expect(await errorOf(edit(stranger.id, stranger.username))).toMatchObject({
      code: ErrorCode.NOT_FOUND,
      params: { entity: 'user' },
    });
  });
});

describe('users.setPassword', () => {
  it('sets the hash, signs the user out, lifts the lock; the audit has no password', async () => {
    const target = await newStaff('pw');
    await signIn(target.username, PASSWORD, '1.1.1.1');
    for (let i = 0; i < 5; i += 1) await errorOf(signIn(target.username, 'wrong', '2.2.2.2'));

    const result = await users.setPassword(owner, { id: target.id, password: NEW_PASSWORD });

    expect(result.passwordChangedAt).toBeInstanceOf(Date);
    expect(await sessionsOf(target.id)).toBe(0);
    expect(await prisma.loginAttempt.count({ where: { username: target.username } })).toBe(0);
    expect(await errorOf(signIn(target.username, PASSWORD, '3.3.3.3'))).toMatchObject({
      code: ErrorCode.INVALID_CREDENTIALS,
    });
    await expect(signIn(target.username, NEW_PASSWORD, '2.2.2.2')).resolves.toBeDefined();

    const rows = await prisma.auditLog.findMany({
      where: { entityId: target.id, action: 'PASSWORD_RESET' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: f.owner.id,
      before: null,
      after: null,
      meta: { username: target.username, source: 'owner', sessionsRevoked: 1, attemptsCleared: 1 },
    });
    await expectNoSecrets(target.id, PASSWORD, NEW_PASSWORD);
  });

  it('cannot set the OWNER’s password here, and rejects a short one', async () => {
    expect(
      await errorOf(users.setPassword(owner, { id: f.owner.id, password: NEW_PASSWORD })),
    ).toMatchObject({ code: ErrorCode.FORBIDDEN });
    expect(
      await errorOf(users.setPassword(owner, { id: f.staff.id, password: 'short' })),
    ).toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
  });
});

describe('users.deactivate / activate', () => {
  it('deactivation ends every session and blocks sign-in; activation lets it back', async () => {
    const target = await newStaff('off');
    const { token } = await signIn(target.username);
    await signIn(target.username);

    const off = await users.deactivate(owner, { id: target.id });

    expect(off.isActive).toBe(false);
    expect(await sessionsOf(target.id)).toBe(0);
    expect(await auth.getSession(token)).toBeNull();
    expect(await errorOf(signIn(target.username))).toMatchObject({
      code: ErrorCode.USER_INACTIVE,
    });
    await users.deactivate(owner, { id: target.id }); // no-op

    const on = await users.activate(owner, { id: target.id });
    expect(on.isActive).toBe(true);
    await expect(signIn(target.username)).resolves.toBeDefined();

    const rows = (await auditOf(target.id)).filter((r) => r.action.startsWith('USER_'));
    expect(rows.map((r) => r.action)).toEqual(['USER_CREATE', 'USER_DEACTIVATE', 'USER_ACTIVATE']);
    expect(rows[1]).toMatchObject({
      before: { isActive: true },
      after: { isActive: false },
      meta: { sessionsRevoked: 2 },
    });
  });

  it('T-204: the OWNER cannot deactivate themself', async () => {
    await signIn(f.owner.username);

    expect(await errorOf(users.deactivate(owner, { id: f.owner.id }))).toMatchObject({
      code: ErrorCode.FORBIDDEN,
      params: { reason: 'self' },
    });
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: f.owner.id } });
    expect(saved.isActive).toBe(true);
    expect(await sessionsOf(f.owner.id)).toBe(1);
  });
});

describe('My account (OWNER)', () => {
  it('changeOwnPassword: needs the current password, keeps this session, ends the others', async () => {
    const current = await signIn(f.owner.username, PASSWORD, '1.1.1.1');
    const other = await signIn(f.owner.username, PASSWORD, '2.2.2.2');
    await errorOf(signIn(f.owner.username, 'wrong', '3.3.3.3'));

    expect(
      await errorOf(
        users.changeOwnPassword(
          owner,
          { currentPassword: 'wrong password', newPassword: NEW_PASSWORD },
          current.token,
        ),
      ),
    ).toMatchObject({ code: ErrorCode.CURRENT_PASSWORD_INVALID });
    expect(await sessionsOf(f.owner.id)).toBe(2);

    await users.changeOwnPassword(
      owner,
      { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
      current.token,
    );

    expect(await auth.getSession(current.token)).not.toBeNull();
    expect(await auth.getSession(other.token)).toBeNull();
    expect(await prisma.loginAttempt.count({ where: { username: f.owner.username } })).toBe(0);
    await expect(signIn(f.owner.username, NEW_PASSWORD)).resolves.toBeDefined();

    const rows = await prisma.auditLog.findMany({
      where: { entityId: f.owner.id, action: 'PASSWORD_RESET' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: f.owner.id,
      meta: { source: 'self', sessionsRevoked: 1, attemptsCleared: 1 },
    });
    await expectNoSecrets(f.owner.id, PASSWORD, NEW_PASSWORD);
  });

  it('changeOwnUsername: needs the current password, rejects a taken login, keeps this session', async () => {
    const current = await signIn(f.owner.username, PASSWORD, '1.1.1.1');
    const other = await signIn(f.owner.username, PASSWORD, '2.2.2.2');
    const newLogin = login('boss');

    expect(
      await errorOf(
        users.changeOwnUsername(
          owner,
          { currentPassword: 'wrong password', username: newLogin },
          current.token,
        ),
      ),
    ).toMatchObject({ code: ErrorCode.CURRENT_PASSWORD_INVALID });
    expect(
      await errorOf(
        users.changeOwnUsername(
          owner,
          { currentPassword: PASSWORD, username: f.staff.username.toUpperCase() },
          current.token,
        ),
      ),
    ).toMatchObject({ code: ErrorCode.DUPLICATE_VALUE });

    const result = await users.changeOwnUsername(
      owner,
      { currentPassword: PASSWORD, username: newLogin },
      current.token,
    );

    expect(result.username).toBe(newLogin);
    expect((await auth.getSession(current.token))?.user.username).toBe(newLogin);
    expect(await auth.getSession(other.token)).toBeNull();
    expect(await errorOf(signIn(f.owner.username))).toMatchObject({
      code: ErrorCode.INVALID_CREDENTIALS,
    });
    await expect(signIn(newLogin)).resolves.toBeDefined();
    const rows = await prisma.auditLog.findMany({
      where: { entityId: f.owner.id, action: 'USER_UPDATE' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      before: { username: f.owner.username },
      after: { username: newLogin },
      meta: { source: 'self', sessionsRevoked: 1 },
    });
    await expectNoSecrets(f.owner.id, PASSWORD);
  });

  it('updateOwnProfile changes the full name and audits it', async () => {
    const result = await users.updateOwnProfile(owner, { fullName: '  Egasi Akmal ' });

    expect(result.fullName).toBe('Egasi Akmal');
    const rows = await prisma.auditLog.findMany({
      where: { entityId: f.owner.id, action: 'USER_UPDATE' },
    });
    expect(rows[0]).toMatchObject({
      before: { fullName: f.owner.fullName },
      after: { fullName: 'Egasi Akmal' },
    });
  });
});
