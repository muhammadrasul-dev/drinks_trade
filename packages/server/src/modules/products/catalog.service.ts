// Categories and brands (T-302, FR-1.1): organization-level named lists that
// group products. Both tables have the same shape, so one implementation
// serves both through a small per-kind table adapter. Nothing is deleted —
// an item is archived (database.md §1 rule 5) and hidden from new choices.
import { type CatalogItem, DomainError, ErrorCode, parseInput } from '@drinks/shared';
import {
  type CatalogCreateInput,
  type CatalogIdInput,
  type CatalogKind,
  catalogCreateInputSchema,
  catalogIdInputSchema,
  type CatalogRenameInput,
  catalogRenameInputSchema,
} from '@drinks/shared/schemas';

import type { ServiceContext } from '../../core/context';
import { assertCan } from '../../core/rbac';
import { type Tx, withTransaction } from '../../core/tx';
import { audit } from '../audit';

export interface CatalogListOptions {
  /** false (default): active items only — what product forms offer; true: archived only. */
  archived?: boolean;
}

const ROW_SELECT = {
  id: true,
  name: true,
  archivedAt: true,
  _count: { select: { products: true } },
} as const;

interface Row {
  id: string;
  name: string;
  archivedAt: Date | null;
  _count: { products: number };
}

interface RowWhere {
  organizationId: string;
  id?: string | { not: string };
  archivedAt?: null | { not: null };
  name?: { equals: string; mode: 'insensitive' };
}

/** The part of the Prisma category / brand delegates this module uses. */
interface CatalogTable {
  findMany(args: {
    where: RowWhere;
    select: typeof ROW_SELECT;
    orderBy: { name: 'asc' };
  }): Promise<Row[]>;
  findFirst(args: { where: RowWhere; select: typeof ROW_SELECT }): Promise<Row | null>;
  create(args: {
    data: { organizationId: string; name: string };
    select: typeof ROW_SELECT;
  }): Promise<Row>;
  update(args: {
    where: { id: string };
    data: { name?: string; archivedAt?: Date | null };
    select: typeof ROW_SELECT;
  }): Promise<Row>;
}

type Db = Pick<Tx, 'category' | 'brand'>;

function table(db: Db, kind: CatalogKind): CatalogTable {
  return kind === 'category' ? db.category : db.brand;
}

function toItem(row: Row): CatalogItem {
  return {
    id: row.id,
    name: row.name,
    archived: row.archivedAt !== null,
    productCount: row._count.products,
  };
}

/** Unique-constraint violation (P2002) — a concurrent create/rename won the same name. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

/**
 * The (organization_id, name) unique index covers archived rows too, and names
 * are compared case-insensitively here, so "coca-cola" clashes with an archived
 * "Coca-Cola" — `params.archived` lets the UI suggest restoring it instead.
 */
async function assertNameFree(
  tx: Tx,
  ctx: ServiceContext,
  kind: CatalogKind,
  name: string,
  exceptId?: string,
): Promise<void> {
  const clash = await table(tx, kind).findFirst({
    where: {
      organizationId: ctx.organizationId,
      name: { equals: name, mode: 'insensitive' },
      ...(exceptId && { id: { not: exceptId } }),
    },
    select: ROW_SELECT,
  });
  if (clash) {
    throw new DomainError(ErrorCode.DUPLICATE_VALUE, {
      entity: kind,
      field: 'name',
      archived: clash.archivedAt !== null,
    });
  }
}

async function findOwn(tx: Tx, ctx: ServiceContext, kind: CatalogKind, id: string): Promise<Row> {
  const row = await table(tx, kind).findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: ROW_SELECT,
  });
  if (!row) throw new DomainError(ErrorCode.NOT_FOUND, { entity: kind });
  return row;
}

/** Runs a write; a unique violation from a concurrent request → DUPLICATE_VALUE. */
async function write<T>(kind: CatalogKind, fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await withTransaction(fn);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError(ErrorCode.DUPLICATE_VALUE, { entity: kind, field: 'name' });
    }
    throw error;
  }
}

function service(kind: CatalogKind) {
  return {
    /** Sorted by name. Product forms use the default (active only). */
    async list(ctx: ServiceContext, options: CatalogListOptions = {}): Promise<CatalogItem[]> {
      assertCan(ctx.user, 'product.read');
      const { prisma } = await import('@drinks/db');
      const rows = await table(prisma, kind).findMany({
        where: {
          organizationId: ctx.organizationId,
          archivedAt: options.archived ? { not: null } : null,
        },
        select: ROW_SELECT,
        orderBy: { name: 'asc' },
      });
      return rows.map(toItem);
    },

    async create(ctx: ServiceContext, input: CatalogCreateInput): Promise<CatalogItem> {
      assertCan(ctx.user, 'product.write');
      const { name } = parseInput(catalogCreateInputSchema, input);
      return write(kind, async (tx) => {
        await assertNameFree(tx, ctx, kind, name);
        const row = await table(tx, kind).create({
          data: { organizationId: ctx.organizationId, name },
          select: ROW_SELECT,
        });
        await audit.log(tx, ctx, {
          action: 'CREATE',
          entityType: kind,
          entityId: row.id,
          after: { name },
        });
        return toItem(row);
      });
    },

    /** Archived items can be renamed too (e.g. before restoring). */
    async rename(ctx: ServiceContext, input: CatalogRenameInput): Promise<CatalogItem> {
      assertCan(ctx.user, 'product.write');
      const { id, name } = parseInput(catalogRenameInputSchema, input);
      return write(kind, async (tx) => {
        const current = await findOwn(tx, ctx, kind, id);
        if (current.name === name) return toItem(current);
        await assertNameFree(tx, ctx, kind, name, id);
        const row = await table(tx, kind).update({
          where: { id },
          data: { name },
          select: ROW_SELECT,
        });
        await audit.log(tx, ctx, {
          action: 'UPDATE',
          entityType: kind,
          entityId: id,
          before: { name: current.name },
          after: { name },
        });
        return toItem(row);
      });
    },

    /**
     * Hides the item from new choices; products keep it (FR-1.2 spirit).
     * Archiving an archived item is a no-op.
     */
    async archive(ctx: ServiceContext, input: CatalogIdInput): Promise<CatalogItem> {
      return setArchived(ctx, input, true);
    },

    /** Makes an archived item selectable again. Restoring an active item is a no-op. */
    async restore(ctx: ServiceContext, input: CatalogIdInput): Promise<CatalogItem> {
      return setArchived(ctx, input, false);
    },
  };

  async function setArchived(
    ctx: ServiceContext,
    input: CatalogIdInput,
    archived: boolean,
  ): Promise<CatalogItem> {
    assertCan(ctx.user, 'product.write');
    const { id } = parseInput(catalogIdInputSchema, input);
    return write(kind, async (tx) => {
      const current = await findOwn(tx, ctx, kind, id);
      if ((current.archivedAt !== null) === archived) return toItem(current);
      const row = await table(tx, kind).update({
        where: { id },
        data: { archivedAt: archived ? new Date() : null },
        select: ROW_SELECT,
      });
      await audit.log(tx, ctx, {
        action: archived ? 'ARCHIVE' : 'RESTORE',
        entityType: kind,
        entityId: id,
        before: { archivedAt: current.archivedAt },
        after: { archivedAt: row.archivedAt },
      });
      return toItem(row);
    });
  }
}

export const categories = service('category');
export const brands = service('brand');
