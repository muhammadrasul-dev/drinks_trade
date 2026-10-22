// T-302: categories and brands against a real Postgres. Each test builds its
// own organization, so names never clash between tests.
import { prisma } from '@drinks/db';
import { makeBrand, makeProduct, makeStoreFixture, type StoreFixture } from '@drinks/db/test-utils';
import { ErrorCode } from '@drinks/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { brands, categories, type ServiceContext } from '../../src/index';

let f: StoreFixture;
let owner: ServiceContext;
let staff: ServiceContext;

beforeEach(async () => {
  f = await makeStoreFixture(prisma);
  owner = {
    user: { id: f.owner.id, role: 'OWNER', locale: 'uz' },
    storeId: f.store.id,
    organizationId: f.organization.id,
    requestId: 'req-catalog',
  };
  staff = { ...owner, user: { id: f.staff.id, role: 'STAFF', locale: 'uz' } };
});

afterAll(async () => {
  await prisma.$disconnect();
});

const auditRows = (entityId: string) =>
  prisma.auditLog.findMany({ where: { entityId }, orderBy: { id: 'asc' } });

describe('categories', () => {
  it('STAFF creates a category with a trimmed name and an audit row', async () => {
    const item = await categories.create(staff, { name: '  Gazli ichimliklar ' });

    expect(item).toMatchObject({ name: 'Gazli ichimliklar', archived: false, productCount: 0 });
    const rows = await auditRows(item.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'CREATE',
      entityType: 'category',
      userId: f.staff.id,
      storeId: f.store.id,
      after: { name: 'Gazli ichimliklar' },
    });
  });

  it('T-302: a duplicate name throws DUPLICATE_VALUE, case-insensitively', async () => {
    await categories.create(owner, { name: 'Suv' });

    await expect(categories.create(owner, { name: 'suv' })).rejects.toMatchObject({
      code: ErrorCode.DUPLICATE_VALUE,
      params: { entity: 'category', field: 'name', archived: false },
    });
    expect(await prisma.category.count({ where: { organizationId: f.organization.id } })).toBe(1);
  });

  it('T-302: the name of an archived category is taken too (archived: true)', async () => {
    const item = await categories.create(owner, { name: 'Sharbat' });
    await categories.archive(owner, { id: item.id });

    await expect(categories.create(owner, { name: 'SHARBAT' })).rejects.toMatchObject({
      code: ErrorCode.DUPLICATE_VALUE,
      params: { archived: true },
    });
  });

  it('the same name is free in another organization', async () => {
    await categories.create(owner, { name: 'Pivo' });
    const other = await makeStoreFixture(prisma);
    const otherCtx = { ...owner, organizationId: other.organization.id, storeId: other.store.id };

    await expect(categories.create(otherCtx, { name: 'Pivo' })).resolves.toMatchObject({
      name: 'Pivo',
    });
  });

  it('two concurrent creates of one name: one wins, the other gets DUPLICATE_VALUE', async () => {
    const results = await Promise.allSettled([
      categories.create(owner, { name: 'Energetik' }),
      categories.create(owner, { name: 'Energetik' }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const [rejected] = results.filter((r) => r.status === 'rejected');
    expect(rejected?.reason).toMatchObject({ code: ErrorCode.DUPLICATE_VALUE });
  });

  it('renames, audits before/after, and rejects a name another category has', async () => {
    const a = await categories.create(owner, { name: 'Choy' });
    await categories.create(owner, { name: 'Kofe' });

    const renamed = await categories.rename(staff, { id: a.id, name: 'Muzli choy' });
    expect(renamed).toMatchObject({ id: a.id, name: 'Muzli choy' });
    // Same name (only case of another row differs) → DUPLICATE_VALUE.
    await expect(categories.rename(owner, { id: a.id, name: 'KOFE' })).rejects.toMatchObject({
      code: ErrorCode.DUPLICATE_VALUE,
    });
    // Unchanged name → no write, no audit row; a case change of its own name is allowed.
    await categories.rename(owner, { id: a.id, name: 'Muzli choy' });
    await categories.rename(owner, { id: a.id, name: 'Muzli Choy' });

    const rows = await auditRows(a.id);
    expect(rows.map((r) => r.action)).toEqual(['CREATE', 'UPDATE', 'UPDATE']);
    expect(rows[1]).toMatchObject({ before: { name: 'Choy' }, after: { name: 'Muzli choy' } });
  });

  it('archives and restores; repeated calls are no-ops; lists split active and archived', async () => {
    const a = await categories.create(owner, { name: 'B toifa' });
    const b = await categories.create(owner, { name: 'A toifa' });
    await makeProduct(prisma, { organizationId: f.organization.id, categoryId: a.id });

    const archived = await categories.archive(staff, { id: a.id });
    await categories.archive(staff, { id: a.id });
    expect(archived).toMatchObject({ archived: true, productCount: 1 });
    expect((await categories.list(staff)).map((i) => i.id)).toEqual([b.id]);
    expect((await categories.list(staff, { archived: true })).map((i) => i.id)).toEqual([a.id]);
    // The product keeps its category.
    expect(await prisma.product.count({ where: { categoryId: a.id } })).toBe(1);

    await categories.restore(owner, { id: a.id });
    await categories.restore(owner, { id: a.id });
    // Sorted by name.
    expect((await categories.list(owner)).map((i) => i.name)).toEqual(['A toifa', 'B toifa']);

    const rows = await auditRows(a.id);
    expect(rows.map((r) => r.action)).toEqual(['CREATE', 'ARCHIVE', 'RESTORE']);
    expect(rows[2]).toMatchObject({ after: { archivedAt: null } });
  });

  it('another organization’s category is NOT_FOUND', async () => {
    const other = await makeStoreFixture(prisma);
    const foreign = await categories.create(
      { ...owner, organizationId: other.organization.id, storeId: other.store.id },
      { name: 'Begona' },
    );

    await expect(categories.archive(owner, { id: foreign.id })).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
      params: { entity: 'category' },
    });
    await expect(
      categories.rename(owner, { id: foreign.id, name: 'Meniki' }),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
    expect(await categories.list(owner)).toEqual([]);
  });

  it('rejects invalid input with VALIDATION_FAILED and field errors', async () => {
    await expect(categories.create(owner, { name: '  ' })).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_FAILED,
      fieldErrors: { name: expect.any(Array) },
    });
    await expect(categories.archive(owner, { id: 'not-a-uuid' })).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_FAILED,
    });
  });
});

describe('brands', () => {
  it('works the same way on the brand table', async () => {
    await makeBrand(prisma, { organizationId: f.organization.id, name: 'Coca-Cola' });

    await expect(brands.create(staff, { name: 'coca-cola' })).rejects.toMatchObject({
      code: ErrorCode.DUPLICATE_VALUE,
      params: { entity: 'brand' },
    });
    const pepsi = await brands.create(staff, { name: 'Pepsi' });
    await brands.archive(owner, { id: pepsi.id });

    expect((await brands.list(owner)).map((i) => i.name)).toEqual(['Coca-Cola']);
    expect(await auditRows(pepsi.id)).toEqual([
      expect.objectContaining({ action: 'CREATE', entityType: 'brand' }),
      expect.objectContaining({ action: 'ARCHIVE', entityType: 'brand' }),
    ]);
    // Brands and categories are separate lists.
    expect(await categories.list(owner)).toEqual([]);
  });
});
