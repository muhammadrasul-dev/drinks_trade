// Audit log reading (T-901, BR-12): OWNER only (audit.read). The writer
// (audit.service.ts) is untouched; this file only reads audit_log.
import type { Prisma, PrismaClient } from '@drinks/db';
import {
  type AuditEntryDto,
  type AuditPage,
  type AuditUserOption,
  collectAuditRefs,
  isUuid,
  redactAuditValue,
  validationError,
} from '@drinks/shared';
import {
  AUDIT_PAGE_SIZE,
  AUDIT_SYSTEM_USER,
  type AuditListQuery,
  auditListQuerySchema,
} from '@drinks/shared/schemas';

import type { ServiceContext } from '../../core/context';
import { assertCan } from '../../core/rbac';

type Db = PrismaClient;

const ROW_SELECT = {
  id: true,
  createdAt: true,
  action: true,
  entityType: true,
  entityId: true,
  before: true,
  after: true,
  meta: true,
  user: { select: { id: true, fullName: true, username: true } },
} as const satisfies Prisma.AuditLogSelect;

type Row = Prisma.AuditLogGetPayload<{ select: typeof ROW_SELECT }>;

/** Store-zone day range [from, to] → created_at bounds (Asia/Tashkent is UTC+5, no DST). */
function dayRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from && { gte: new Date(`${from}T00:00:00+05:00`) }),
    ...(to && { lt: new Date(new Date(`${to}T00:00:00+05:00`).getTime() + 86_400_000) }),
  };
}

function toEntry(row: Row): AuditEntryDto {
  const { backdated, ...meta } = (redactAuditValue(row.meta) ?? {}) as Record<string, unknown>;
  return {
    id: row.id.toString(),
    createdAt: row.createdAt,
    user: row.user,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    before: redactAuditValue(row.before),
    after: redactAuditValue(row.after),
    meta,
    backdated: backdated === true,
  };
}

/** id → display name for the entities on the page, scoped to the caller's organization / store. */
async function resolveRefs(
  db: Db,
  ctx: ServiceContext,
  refs: Map<string, string>,
): Promise<Record<string, string>> {
  const idsOf = (type: string) =>
    [...refs].filter(([id, t]) => t === type && isUuid(id)).map(([id]) => id);
  const org = ctx.organizationId;
  const store = ctx.storeId;
  const lookups: Promise<{ id: string; label: string }[]>[] = [];
  const add = <T extends { id: string }>(
    type: string,
    query: (ids: string[]) => Promise<T[]>,
    label: (row: T) => string,
  ) => {
    const ids = idsOf(type);
    if (ids.length > 0) {
      lookups.push(
        query(ids).then((rows) => rows.map((row) => ({ id: row.id, label: label(row) }))),
      );
    }
  };

  add(
    'user',
    (ids) =>
      db.user.findMany({
        where: { id: { in: ids }, organizationId: org },
        select: { id: true, fullName: true },
      }),
    (row) => row.fullName,
  );
  add(
    'product',
    (ids) =>
      db.product.findMany({
        where: { id: { in: ids }, organizationId: org },
        select: { id: true, name: true },
      }),
    (row) => row.name,
  );
  add(
    'category',
    (ids) =>
      db.category.findMany({
        where: { id: { in: ids }, organizationId: org },
        select: { id: true, name: true },
      }),
    (row) => row.name,
  );
  add(
    'brand',
    (ids) =>
      db.brand.findMany({
        where: { id: { in: ids }, organizationId: org },
        select: { id: true, name: true },
      }),
    (row) => row.name,
  );
  add(
    'warehouse',
    (ids) =>
      db.warehouse.findMany({
        where: { id: { in: ids }, storeId: store },
        select: { id: true, name: true },
      }),
    (row) => row.name,
  );
  add(
    'sub_warehouse',
    (ids) =>
      db.subWarehouse.findMany({
        where: { id: { in: ids }, warehouse: { storeId: store } },
        select: { id: true, name: true, warehouse: { select: { name: true } } },
      }),
    (row) => `${row.warehouse.name} / ${row.name}`,
  );
  add(
    'purchase',
    (ids) =>
      db.purchase.findMany({
        where: { id: { in: ids }, storeId: store },
        select: { id: true, number: true },
      }),
    (row) => row.number,
  );
  add(
    'sale',
    (ids) =>
      db.sale.findMany({
        where: { id: { in: ids }, storeId: store },
        select: { id: true, number: true },
      }),
    (row) => row.number,
  );
  add(
    'stock_count',
    (ids) =>
      db.stockCount.findMany({
        where: { id: { in: ids }, storeId: store },
        select: { id: true, number: true },
      }),
    (row) => row.number,
  );
  add(
    'cashbox',
    (ids) =>
      db.cashbox.findMany({
        where: { id: { in: ids }, storeId: store },
        select: { id: true, name: true },
      }),
    (row) => row.name,
  );

  const found = (await Promise.all(lookups)).flat();
  return Object.fromEntries(found.map(({ id, label }) => [id, label]));
}

/**
 * Newest first, AUDIT_PAGE_SIZE per page. Filters: user (or "system"), entity
 * type, action, exact entity id, store-zone day range of created_at.
 */
async function list(ctx: ServiceContext, query: AuditListQuery = {}): Promise<AuditPage> {
  assertCan(ctx.user, 'audit.read');
  const parsed = auditListQuerySchema.safeParse(query);
  if (!parsed.success) throw validationError(parsed.error);
  const { user, entityType, action, entityId, from, to, page = 1 } = parsed.data;

  const { prisma } = await import('@drinks/db');
  const createdAt = dayRange(from, to);
  const where: Prisma.AuditLogWhereInput = {
    // Only the current store's rows (OQ-26: store-less LOGIN_FAILED rows are not shown).
    storeId: ctx.storeId,
    ...(user && { userId: user === AUDIT_SYSTEM_USER ? null : user }),
    ...(entityType && { entityType }),
    ...(action && { action }),
    ...(entityId && { entityId }),
    ...(createdAt && { createdAt }),
  };
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      select: ROW_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
    }),
  ]);

  const items = rows.map(toEntry);
  const refs = new Map<string, string>();
  for (const item of items) {
    refs.set(item.entityId, item.entityType);
    collectAuditRefs(item.before, refs);
    collectAuditRefs(item.after, refs);
  }

  return {
    items,
    total,
    page,
    pageSize: AUDIT_PAGE_SIZE,
    refs: await resolveRefs(prisma, ctx, refs),
  };
}

/** Choices for the user filter: all accounts of the organization, active first. */
async function userOptions(ctx: ServiceContext): Promise<AuditUserOption[]> {
  assertCan(ctx.user, 'audit.read');
  const { prisma } = await import('@drinks/db');
  return prisma.user.findMany({
    where: { organizationId: ctx.organizationId },
    select: { id: true, fullName: true, username: true, isActive: true },
    orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
  });
}

export const auditLog = { list, userOptions };
