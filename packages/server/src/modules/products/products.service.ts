// Products (T-303, FR-1.1–1.3). Organization-level catalog: OWNER and STAFF
// both create and edit (product.write), units per block included (OQ-06).
// Nothing is deleted — a product is archived (FR-1.2). SKU and barcode are
// unique per organization. Stock comes from the inventory module (read-only).
import { randomUUID } from 'node:crypto';

import type { Prisma } from '@drinks/db';
import {
  blockPrice,
  DomainError,
  ErrorCode,
  isLowStock,
  type Product,
  type ProductOption,
  type ProductPage,
  type ProductRef,
  parseInput,
} from '@drinks/shared';
import {
  PRODUCT_PAGE_SIZE,
  type ProductCreateInput,
  productCreateInputSchema,
  type ProductIdInput,
  productIdInputSchema,
  type ProductListQuery,
  productListQuerySchema,
  type ProductUpdateInput,
  productUpdateInputSchema,
} from '@drinks/shared/schemas';
import type { z } from 'zod';

import type { ServiceContext } from '../../core/context';
import { moneyToBigInt, moneyToNumber } from '../../core/money';
import { assertCan } from '../../core/rbac';
import { getStorage } from '../../core/storage';
import { isUniqueViolation, type Tx, withTransaction } from '../../core/tx';
import { audit } from '../audit';
import { getProductTotals } from '../inventory/inventory.service';
import {
  PRODUCT_IMAGE_CONTENT_TYPE,
  PRODUCT_IMAGE_EXTENSION,
  processProductImage,
} from './product-image';

const REF_SELECT = { id: true, name: true, archivedAt: true } as const;

const PRODUCT_SELECT = {
  id: true,
  name: true,
  sku: true,
  barcode: true,
  categoryId: true,
  brandId: true,
  unitsPerBlock: true,
  salePrice: true,
  minStock: true,
  expiryDate: true,
  imagePath: true,
  archivedAt: true,
  category: { select: REF_SELECT },
  brand: { select: REF_SELECT },
} as const satisfies Prisma.ProductSelect;

type Row = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

/** Read-only queries run on the client or inside a transaction. */
type Db = Tx;

type CodeField = 'sku' | 'barcode';
type RefKind = 'category' | 'brand';

/** The editable fields in audit form (money as number, date as YYYY-MM-DD). */
interface Snapshot {
  name: string;
  sku: string | null;
  barcode: string | null;
  categoryId: string | null;
  brandId: string | null;
  unitsPerBlock: number;
  salePrice: number;
  minStock: number;
  expiryDate: string | null;
}

/** `@db.Date` comes back as UTC midnight. */
function dateToIso(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function isoToDate(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function toRef(
  ref: { id: string; name: string; archivedAt: Date | null } | null,
): ProductRef | null {
  return ref && { id: ref.id, name: ref.name, archived: ref.archivedAt !== null };
}

/** `products/<id>/<version>.webp` → `<version>`. */
function imageVersion(imagePath: string | null): string | null {
  if (!imagePath) return null;
  const file = imagePath.slice(imagePath.lastIndexOf('/') + 1);
  return file.slice(0, file.indexOf('.'));
}

function snapshot(row: Row): Snapshot {
  return {
    name: row.name,
    sku: row.sku,
    barcode: row.barcode,
    categoryId: row.categoryId,
    brandId: row.brandId,
    unitsPerBlock: row.unitsPerBlock,
    salePrice: moneyToNumber(row.salePrice),
    minStock: row.minStock,
    expiryDate: dateToIso(row.expiryDate),
  };
}

function toProduct(row: Row, stockQty: number): Product {
  const salePrice = moneyToNumber(row.salePrice);
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    barcode: row.barcode,
    category: toRef(row.category),
    brand: toRef(row.brand),
    unitsPerBlock: row.unitsPerBlock,
    salePrice,
    blockPrice: blockPrice(salePrice, row.unitsPerBlock),
    minStock: row.minStock,
    expiryDate: dateToIso(row.expiryDate),
    imageVersion: imageVersion(row.imagePath),
    archived: row.archivedAt !== null,
    stockQty,
    lowStock: isLowStock(stockQty, row.minStock),
  };
}

/** Rows → DTOs with store-wide stock (no cost: Product carries no confidential field). */
async function withStock(db: Db, ctx: ServiceContext, rows: readonly Row[]): Promise<Product[]> {
  const totals = await getProductTotals(
    db,
    ctx,
    rows.map((row) => row.id),
  );
  return rows.map((row, i) => toProduct(row, totals[i]?.totalQty ?? 0));
}

async function findOwn(db: Db, ctx: ServiceContext, id: string): Promise<Row> {
  const row = await db.product.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: PRODUCT_SELECT,
  });
  if (!row) throw new DomainError(ErrorCode.NOT_FOUND, { entity: 'product' });
  return row;
}

/**
 * SKU / barcode must be free in the organization, archived products included
 * (the DB unique index covers them too). Compared case-insensitively, like
 * category names (`cc-15` clashes with `CC-15`); `archived` lets the UI say
 * the clash is with an archived product.
 */
async function assertCodesFree(
  tx: Tx,
  ctx: ServiceContext,
  codes: Record<CodeField, string | null>,
  exceptId?: string,
): Promise<void> {
  for (const field of ['sku', 'barcode'] as const) {
    const value = codes[field];
    if (value === null) continue;
    const clash = await tx.product.findFirst({
      where: {
        organizationId: ctx.organizationId,
        [field]: { equals: value, mode: 'insensitive' },
        ...(exceptId && { id: { not: exceptId } }),
      },
      select: { archivedAt: true },
    });
    if (clash) {
      throw new DomainError(ErrorCode.DUPLICATE_VALUE, {
        entity: 'product',
        field,
        archived: clash.archivedAt !== null,
      });
    }
  }
}

/**
 * A new category / brand choice must be the organization's and active. A value
 * the product already has stays valid even after it was archived (T-302).
 */
async function assertRefSelectable(
  tx: Tx,
  ctx: ServiceContext,
  kind: RefKind,
  id: string | null,
  currentId: string | null = null,
): Promise<void> {
  if (id === null || id === currentId) return;
  const where = { id, organizationId: ctx.organizationId };
  const ref =
    kind === 'category'
      ? await tx.category.findFirst({ where, select: { archivedAt: true } })
      : await tx.brand.findFirst({ where, select: { archivedAt: true } });
  if (!ref) throw new DomainError(ErrorCode.NOT_FOUND, { entity: kind });
  if (ref.archivedAt) throw new DomainError(ErrorCode.ENTITY_ARCHIVED, { entity: kind });
}

/** P2002 from a concurrent write → DUPLICATE_VALUE on the field the index names. */
function uniqueViolationField(error: unknown): CodeField | null {
  if (!isUniqueViolation(error)) return null;
  const text = JSON.stringify((error as { meta?: unknown }).meta ?? {});
  return text.includes('barcode') ? 'barcode' : 'sku';
}

async function write<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await withTransaction(fn);
  } catch (error) {
    const field = uniqueViolationField(error);
    if (field) throw new DomainError(ErrorCode.DUPLICATE_VALUE, { entity: 'product', field });
    throw error;
  }
}

/** Only the fields that differ, for the UPDATE audit row. */
function diff(
  before: Snapshot,
  after: Snapshot,
): { before: Partial<Snapshot>; after: Partial<Snapshot> } {
  const changed: { before: Partial<Snapshot>; after: Partial<Snapshot> } = {
    before: {},
    after: {},
  };
  for (const key of Object.keys(after) as (keyof Snapshot)[]) {
    if (before[key] !== after[key]) {
      (changed.before as Record<string, unknown>)[key] = before[key];
      (changed.after as Record<string, unknown>)[key] = after[key];
    }
  }
  return changed;
}

function toData(input: z.output<typeof productCreateInputSchema>) {
  return {
    name: input.name,
    sku: input.sku,
    barcode: input.barcode,
    categoryId: input.categoryId,
    brandId: input.brandId,
    unitsPerBlock: input.unitsPerBlock,
    salePrice: moneyToBigInt(input.salePrice),
    minStock: input.minStock,
    expiryDate: isoToDate(input.expiryDate),
  };
}

/** Best effort: a leftover file is harmless, a failed request because of one is not. */
async function deleteQuietly(key: string | null): Promise<void> {
  if (!key) return;
  try {
    await getStorage().delete(key);
  } catch {
    // The orphan stays on disk; nothing references it.
  }
}

/**
 * Active (default) or archived products matching the search and filters,
 * sorted by name, PRODUCT_PAGE_SIZE per page, with store-wide stock.
 */
async function list(ctx: ServiceContext, query: ProductListQuery = {}): Promise<ProductPage> {
  assertCan(ctx.user, 'product.read');
  const { q, categoryId, brandId, archived, page = 1 } = parseInput(productListQuerySchema, query);
  const { prisma } = await import('@drinks/db');
  const where: Prisma.ProductWhereInput = {
    organizationId: ctx.organizationId,
    archivedAt: archived ? { not: null } : null,
    ...(categoryId && { categoryId }),
    ...(brandId && { brandId }),
    ...(q && {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } },
        { barcode: { contains: q, mode: 'insensitive' } },
      ],
    }),
  };
  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      select: PRODUCT_SELECT,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * PRODUCT_PAGE_SIZE,
      take: PRODUCT_PAGE_SIZE,
    }),
  ]);
  return { items: await withStock(prisma, ctx, rows), total, page, pageSize: PRODUCT_PAGE_SIZE };
}

/** One product of the organization (archived too); NOT_FOUND otherwise. */
async function get(ctx: ServiceContext, input: ProductIdInput): Promise<Product> {
  assertCan(ctx.user, 'product.read');
  const { id } = parseInput(productIdInputSchema, input);
  const { prisma } = await import('@drinks/db');
  const [product] = await withStock(prisma, ctx, [await findOwn(prisma, ctx, id)]);
  return product as Product;
}

async function create(ctx: ServiceContext, input: ProductCreateInput): Promise<Product> {
  assertCan(ctx.user, 'product.write');
  const data = parseInput(productCreateInputSchema, input);
  return write(async (tx) => {
    await assertCodesFree(tx, ctx, data);
    await assertRefSelectable(tx, ctx, 'category', data.categoryId);
    await assertRefSelectable(tx, ctx, 'brand', data.brandId);
    const row = await tx.product.create({
      data: { organizationId: ctx.organizationId, ...toData(data) },
      select: PRODUCT_SELECT,
    });
    await audit.log(tx, ctx, {
      action: 'CREATE',
      entityType: 'product',
      entityId: row.id,
      after: snapshot(row),
    });
    return toProduct(row, 0);
  });
}

/**
 * Replaces the editable fields. Changing units per block is allowed for both
 * roles (OQ-06): stock is kept in pieces, so only its block view changes; the
 * UI warns first and the audit row keeps the old value. Archived products can
 * be edited too. No change → no write, no audit row.
 */
async function update(ctx: ServiceContext, input: ProductUpdateInput): Promise<Product> {
  assertCan(ctx.user, 'product.write');
  const { id, ...data } = parseInput(productUpdateInputSchema, input);
  return write(async (tx) => {
    const current = await findOwn(tx, ctx, id);
    const changes = diff(snapshot(current), { ...data });
    if (Object.keys(changes.after).length === 0) {
      const [product] = await withStock(tx, ctx, [current]);
      return product as Product;
    }
    if (data.sku !== current.sku || data.barcode !== current.barcode) {
      await assertCodesFree(
        tx,
        ctx,
        {
          sku: data.sku !== current.sku ? data.sku : null,
          barcode: data.barcode !== current.barcode ? data.barcode : null,
        },
        id,
      );
    }
    await assertRefSelectable(tx, ctx, 'category', data.categoryId, current.categoryId);
    await assertRefSelectable(tx, ctx, 'brand', data.brandId, current.brandId);
    const row = await tx.product.update({
      where: { id },
      data: toData(data),
      select: PRODUCT_SELECT,
    });
    await audit.log(tx, ctx, {
      action: 'UPDATE',
      entityType: 'product',
      entityId: id,
      ...changes,
    });
    const [product] = await withStock(tx, ctx, [row]);
    return product as Product;
  });
}

async function setArchived(
  ctx: ServiceContext,
  input: ProductIdInput,
  archived: boolean,
): Promise<Product> {
  assertCan(ctx.user, 'product.write');
  const { id } = parseInput(productIdInputSchema, input);
  return write(async (tx) => {
    const current = await findOwn(tx, ctx, id);
    let row = current;
    if ((current.archivedAt !== null) !== archived) {
      row = await tx.product.update({
        where: { id },
        data: { archivedAt: archived ? new Date() : null },
        select: PRODUCT_SELECT,
      });
      await audit.log(tx, ctx, {
        action: archived ? 'ARCHIVE' : 'RESTORE',
        entityType: 'product',
        entityId: id,
        before: { archivedAt: current.archivedAt },
        after: { archivedAt: row.archivedAt },
      });
    }
    const [product] = await withStock(tx, ctx, [row]);
    return product as Product;
  });
}

/**
 * Hides the product from new documents (FR-1.2); old documents and reports
 * keep showing it. Allowed with stock on hand too (OQ-20) — the UI warns.
 * Archiving an archived product is a no-op.
 */
function archive(ctx: ServiceContext, input: ProductIdInput): Promise<Product> {
  return setArchived(ctx, input, true);
}

/** Makes an archived product selectable again; no-op for an active one. */
function restore(ctx: ServiceContext, input: ProductIdInput): Promise<Product> {
  return setArchived(ctx, input, false);
}

/**
 * Sets (or replaces) the product image: ≤ 2 MB jpg/png/webp, stored as WebP
 * within 512×512 (architecture §9). The file is written first and removed
 * again if the transaction fails; the replaced file is removed after commit.
 */
async function setImage(
  ctx: ServiceContext,
  input: { id: string; data: Uint8Array },
): Promise<Product> {
  assertCan(ctx.user, 'product.write');
  const { id } = parseInput(productIdInputSchema, { id: input.id });
  const image = await processProductImage(input.data);
  const key = `products/${id}/${randomUUID()}.${PRODUCT_IMAGE_EXTENSION}`;
  const storage = getStorage();
  await storage.put(key, image);

  let previous: string | null = null;
  try {
    const product = await write(async (tx) => {
      const current = await findOwn(tx, ctx, id);
      previous = current.imagePath;
      const row = await tx.product.update({
        where: { id },
        data: { imagePath: key },
        select: PRODUCT_SELECT,
      });
      await audit.log(tx, ctx, {
        action: 'UPDATE',
        entityType: 'product',
        entityId: id,
        before: { imagePath: current.imagePath },
        after: { imagePath: key },
      });
      const [result] = await withStock(tx, ctx, [row]);
      return result as Product;
    });
    await deleteQuietly(previous);
    return product;
  } catch (error) {
    await deleteQuietly(key);
    throw error;
  }
}

/** Removes the image; no-op when there is none. */
async function removeImage(ctx: ServiceContext, input: ProductIdInput): Promise<Product> {
  assertCan(ctx.user, 'product.write');
  const { id } = parseInput(productIdInputSchema, input);
  let previous: string | null = null;
  const product = await write(async (tx) => {
    const current = await findOwn(tx, ctx, id);
    let row = current;
    if (current.imagePath) {
      previous = current.imagePath;
      row = await tx.product.update({
        where: { id },
        data: { imagePath: null },
        select: PRODUCT_SELECT,
      });
      await audit.log(tx, ctx, {
        action: 'UPDATE',
        entityType: 'product',
        entityId: id,
        before: { imagePath: current.imagePath },
        after: { imagePath: null },
      });
    }
    const [result] = await withStock(tx, ctx, [row]);
    return result as Product;
  });
  await deleteQuietly(previous);
  return product;
}

export interface ProductImage {
  data: Uint8Array;
  contentType: string;
  /** Same token as Product.imageVersion. */
  version: string;
}

/** The stored image bytes; NOT_FOUND when the product or its image is missing. */
async function readImage(ctx: ServiceContext, input: ProductIdInput): Promise<ProductImage> {
  assertCan(ctx.user, 'product.read');
  const { id } = parseInput(productIdInputSchema, input);
  const { prisma } = await import('@drinks/db');
  const row = await prisma.product.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { imagePath: true },
  });
  const data = row?.imagePath ? await getStorage().get(row.imagePath) : null;
  if (!row?.imagePath || !data) {
    throw new DomainError(ErrorCode.NOT_FOUND, { entity: 'productImage' });
  }
  return {
    data,
    contentType: PRODUCT_IMAGE_CONTENT_TYPE,
    version: imageVersion(row.imagePath) as string,
  };
}

/** The product picker of document forms (purchase, sale, stock count): active products by name. */
async function options(ctx: ServiceContext): Promise<ProductOption[]> {
  assertCan(ctx.user, 'product.read');
  const { prisma } = await import('@drinks/db');
  return prisma.product.findMany({
    where: { organizationId: ctx.organizationId, archivedAt: null },
    select: { id: true, name: true, sku: true, barcode: true, unitsPerBlock: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
}

export const products = {
  list,
  get,
  options,
  create,
  update,
  archive,
  restore,
  setImage,
  removeImage,
  readImage,
};
