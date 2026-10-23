// T-901: reading the audit log (BR-12, BR-13) against a real Postgres.
// Rows come from a real writer (categories) and from direct INSERTs, which
// the append-only trigger allows, so created_at can be set per test.
import { prisma } from '@drinks/db';
import {
  makeOrganization,
  makeProduct,
  makeStoreFixture,
  makeUser,
  type StoreFixture,
} from '@drinks/db/test-utils';
import { ErrorCode } from '@drinks/shared';
import { AUDIT_PAGE_SIZE } from '@drinks/shared/schemas';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { auditLog, categories, type ServiceContext } from '../../src/index';

let f: StoreFixture;
let owner: ServiceContext;
let staff: ServiceContext;

beforeEach(async () => {
  f = await makeStoreFixture(prisma);
  owner = {
    user: { id: f.owner.id, role: 'OWNER', locale: 'uz' },
    storeId: f.store.id,
    organizationId: f.organization.id,
    requestId: 'req-audit',
  };
  staff = { ...owner, user: { id: f.staff.id, role: 'STAFF', locale: 'uz' } };
});

afterAll(async () => {
  await prisma.$disconnect();
});

interface RowInput {
  storeId?: string | null;
  userId?: string | null;
  action?: string;
  entityType?: string;
  entityId?: string;
  before?: object;
  after?: object;
  meta?: object;
  createdAt?: Date;
}

/** One audit row of the fixture's store by its OWNER unless overridden. */
function insertRow(row: RowInput = {}) {
  return prisma.auditLog.create({
    data: {
      storeId: row.storeId === undefined ? f.store.id : row.storeId,
      userId: row.userId === undefined ? f.owner.id : row.userId,
      action: row.action ?? 'UPDATE',
      entityType: row.entityType ?? 'product',
      entityId: row.entityId ?? crypto.randomUUID(),
      ...(row.before && { before: row.before }),
      ...(row.after && { after: row.after }),
      meta: row.meta ?? { requestId: 'r' },
      ...(row.createdAt && { createdAt: row.createdAt }),
    },
  });
}

function errorOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('unexpectedly succeeded');
    },
    (error: unknown) => error,
  );
}

describe('auditLog access (architecture §5.5: audit.read is OWNER only)', () => {
  it('rejects STAFF with FORBIDDEN', async () => {
    await insertRow();
    for (const call of [auditLog.list(staff), auditLog.userOptions(staff)]) {
      expect(await errorOf(call)).toMatchObject({
        code: ErrorCode.FORBIDDEN,
        params: { permission: 'audit.read' },
      });
    }
  });

  it('rejects malformed filters with VALIDATION_FAILED', async () => {
    expect(
      await errorOf(auditLog.list(owner, { user: 'bob' as never, from: '2026-02-30' })),
    ).toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
  });
});

describe('auditLog.list', () => {
  it('shows what a real writer logged, with names resolved', async () => {
    const category = await categories.create(staff, { name: 'Sharbatlar' });
    await categories.rename(owner, { id: category.id, name: 'Sharbatlar 1L' });

    const page = await auditLog.list(owner);
    expect(page.total).toBe(2);
    expect(page.items.map((item) => [item.action, item.user?.id])).toEqual([
      ['UPDATE', f.owner.id],
      ['CREATE', f.staff.id],
    ]);
    expect(page.items[0]).toMatchObject({
      entityType: 'category',
      entityId: category.id,
      before: { name: 'Sharbatlar' },
      after: { name: 'Sharbatlar 1L' },
      meta: { requestId: 'req-audit' },
      backdated: false,
      user: { id: f.owner.id, fullName: f.owner.fullName, username: f.owner.username },
    });
    expect(page.refs[category.id]).toBe('Sharbatlar 1L');
  });

  it('lists only the current store: other stores and store-less rows stay out (OQ-26)', async () => {
    const other = await makeStoreFixture(prisma);
    const mine = await insertRow({ entityId: 'mine' });
    await insertRow({ storeId: other.store.id, userId: other.owner.id, entityId: 'theirs' });
    await insertRow({
      storeId: null,
      userId: null,
      action: 'LOGIN_FAILED',
      entityType: 'user',
      entityId: f.staff.id,
    });
    await insertRow({
      storeId: null,
      userId: null,
      action: 'LOGIN_FAILED',
      entityType: 'user',
      entityId: 'nobody',
    });

    const page = await auditLog.list(owner);
    expect(page.items.map((item) => item.id)).toEqual([mine.id.toString()]);
    expect(page.total).toBe(1);
    expect((await auditLog.list(owner, { action: 'LOGIN_FAILED' })).items).toEqual([]);
  });

  it('pages newest first', async () => {
    const start = Date.parse('2026-10-01T06:00:00Z');
    for (let i = 0; i < AUDIT_PAGE_SIZE + 5; i += 1) {
      await insertRow({ entityId: `e${i}`, createdAt: new Date(start + i * 60_000) });
    }
    const since = { from: '2026-01-01' };
    const first = await auditLog.list(owner, since);
    const second = await auditLog.list(owner, { ...since, page: 2 });
    expect(first).toMatchObject({ total: AUDIT_PAGE_SIZE + 5, page: 1, pageSize: AUDIT_PAGE_SIZE });
    expect(first.items).toHaveLength(AUDIT_PAGE_SIZE);
    expect(first.items[0]?.entityId).toBe(`e${AUDIT_PAGE_SIZE + 4}`);
    expect(second.items.map((item) => item.entityId)).toEqual(['e4', 'e3', 'e2', 'e1', 'e0']);
    expect((await auditLog.list(owner, { ...since, page: 3 })).items).toEqual([]);
  });

  it('filters by user, system, entity type, action and entity id', async () => {
    const product = crypto.randomUUID();
    const byOwner = await insertRow({ entityId: product, action: 'CREATE' });
    const byStaff = await insertRow({ userId: f.staff.id, entityId: product });
    const system = await insertRow({
      userId: null,
      action: 'PASSWORD_RESET',
      entityType: 'user',
      entityId: f.staff.id,
    });
    const warehouse = await insertRow({ entityType: 'warehouse', action: 'ARCHIVE' });

    const ids = async (query: Parameters<typeof auditLog.list>[1]) =>
      (await auditLog.list(owner, query)).items.map((item) => item.id);

    expect(await ids({ user: f.staff.id })).toEqual([byStaff.id.toString()]);
    expect(await ids({ user: 'system', from: '2026-01-01' })).toEqual([system.id.toString()]);
    expect(await ids({ entityType: 'warehouse' })).toEqual([warehouse.id.toString()]);
    expect(await ids({ action: 'CREATE' })).toEqual([byOwner.id.toString()]);
    expect(await ids({ entityType: 'product', entityId: product })).toEqual(
      [byStaff, byOwner].map((row) => row.id.toString()),
    );
    expect(await ids({ user: f.owner.id, entityId: product, action: 'UPDATE' })).toEqual([]);
    expect(await ids({ action: 'NEVER_WRITTEN' })).toEqual([]);
  });

  it('filters by store-zone days (Asia/Tashkent, UTC+5)', async () => {
    // 2026-10-21 18:59 UTC = 21st 23:59 in Tashkent; 19:00 UTC = 22nd 00:00.
    const late21 = await insertRow({ createdAt: new Date('2026-10-21T18:59:00Z') });
    const early22 = await insertRow({ createdAt: new Date('2026-10-21T19:00:00Z') });
    const late22 = await insertRow({ createdAt: new Date('2026-10-22T18:59:59Z') });
    const early23 = await insertRow({ createdAt: new Date('2026-10-22T19:00:00Z') });
    const ids = async (query: Parameters<typeof auditLog.list>[1]) =>
      (await auditLog.list(owner, query)).items.map((item) => item.id);
    const id = (row: { id: bigint }) => row.id.toString();

    expect(await ids({ from: '2026-10-22', to: '2026-10-22' })).toEqual([late22, early22].map(id));
    expect(await ids({ from: '2026-10-23' })).toEqual([id(early23)]);
    expect(await ids({ from: '2026-10-01', to: '2026-10-21' })).toEqual([id(late21)]);
  });

  it('flags backdated rows, redacts secrets and resolves referenced names', async () => {
    const product = await makeProduct(prisma, { organizationId: f.organization.id, name: 'Cola' });
    const foreign = await makeProduct(prisma, {
      organizationId: (await makeOrganization(prisma)).id,
      name: 'Secret product',
    });
    const purchase = crypto.randomUUID(); // a deleted draft: no longer resolvable
    await insertRow({
      action: 'UPDATE',
      entityType: 'purchase',
      entityId: purchase,
      before: { lines: [{ lineNo: 1, productId: product.id, subWarehouseId: f.subWarehouse.id }] },
      after: {
        lines: [{ lineNo: 1, productId: foreign.id, subWarehouseId: f.subWarehouse.id }],
        passwordHash: 'leak',
        nested: { sessionToken: 'leak' },
      },
      meta: { requestId: 'r', backdated: true, password: 'leak', ip: '10.0.0.1' },
    });
    await insertRow({ action: 'USER_UPDATE', entityType: 'user', entityId: f.staff.id });

    const page = await auditLog.list(owner, { entityType: 'purchase' });
    const [row] = page.items;
    expect(row).toMatchObject({ backdated: true, meta: { requestId: 'r', ip: '10.0.0.1' } });
    expect(row?.meta).not.toHaveProperty('backdated');
    expect(JSON.stringify(page)).not.toContain('leak');
    expect(row?.after).toEqual({
      lines: [{ lineNo: 1, productId: foreign.id, subWarehouseId: f.subWarehouse.id }],
      nested: {},
    });
    expect(page.refs).toEqual({
      [product.id]: 'Cola',
      [f.subWarehouse.id]: `${f.warehouse.name} / ${f.subWarehouse.name}`,
    });
  });
});

describe('auditLog.userOptions', () => {
  it("lists the organization's accounts, inactive ones last", async () => {
    const gone = await makeUser(prisma, {
      organizationId: f.organization.id,
      fullName: 'Aaa',
      isActive: false,
    });
    await makeStoreFixture(prisma); // another organization
    const options = await auditLog.userOptions(owner);
    expect(options.map((option) => option.id)).toEqual(
      expect.arrayContaining([f.owner.id, f.staff.id, gone.id]),
    );
    expect(options).toHaveLength(3);
    expect(options.at(-1)).toEqual({
      id: gone.id,
      fullName: 'Aaa',
      username: gone.username,
      isActive: false,
    });
  });
});
