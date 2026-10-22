// T-201: the language switcher persists user.locale through usersService.
import { prisma } from '@drinks/db';
import { ErrorCode } from '@drinks/shared';
import { expect, it } from 'vitest';

import { auth, hashPassword, users } from '../../src/index';

it('updateOwnLocale stores the locale and audits the change', async () => {
  const run = Date.now().toString(36);
  const organization = await prisma.organization.create({ data: { name: `T-201 org ${run}` } });
  await prisma.store.create({ data: { organizationId: organization.id, name: 'T-201 store' } });
  const user = await prisma.user.create({
    data: {
      organizationId: organization.id,
      username: `t201_${run}_locale`,
      passwordHash: await hashPassword('password123'),
      fullName: 'Locale',
      role: 'STAFF',
    },
  });
  const { session } = await auth.login(
    { username: user.username, password: 'password123' },
    { ip: null, userAgent: null, requestId: 'req-locale' },
  );
  const ctx = auth.toServiceContext(session, 'req-locale');

  await users.updateOwnLocale(ctx, 'ru');
  await users.updateOwnLocale(ctx, 'ru'); // unchanged → no second audit row
  await expect(users.updateOwnLocale(ctx, 'en')).rejects.toMatchObject({
    code: ErrorCode.VALIDATION_FAILED,
  });

  expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).locale).toBe('ru');
  const rows = await prisma.auditLog.findMany({
    where: { entityId: user.id, action: 'USER_UPDATE' },
  });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    userId: user.id,
    before: { locale: 'uz' },
    after: { locale: 'ru' },
  });
});
