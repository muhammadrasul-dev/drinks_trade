// T-303: products against a real Postgres. Each test builds its own
// organization; images go to a temporary UPLOAD_DIR removed after the file.
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { prisma } from '@drinks/db';
import {
  assertInvariants,
  makeBrand,
  makeCategory,
  makeProduct,
  makeStoreFixture,
  type StoreFixture,
} from '@drinks/db/test-utils';
import { ErrorCode } from '@drinks/shared';
import { PRODUCT_IMAGE_MAX_BYTES } from '@drinks/shared/schemas';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  categories,
  inventory,
  products,
  type ServiceContext,
  withTransaction,
} from '../../src/index';

let f: StoreFixture;
let owner: ServiceContext;
let staff: ServiceContext;
let uploadDir: string;

beforeAll(async () => {
  uploadDir = await mkdtemp(path.join(tmpdir(), 'drinks-t303-'));
  process.env.UPLOAD_DIR = uploadDir;
});

beforeEach(async () => {
  f = await makeStoreFixture(prisma);
  owner = {
    user: { id: f.owner.id, role: 'OWNER', locale: 'uz' },
    storeId: f.store.id,
    organizationId: f.organization.id,
    requestId: 'req-products',
  };
  staff = { ...owner, user: { id: f.staff.id, role: 'STAFF', locale: 'uz' } };
});

afterEach(async () => {
  await assertInvariants(prisma);
});

afterAll(async () => {
  await rm(uploadDir, { recursive: true, force: true });
  await prisma.$disconnect();
});

const base = { name: 'Coca-Cola 1.5 L', unitsPerBlock: 6, salePrice: 12_000, minStock: 0 };

const auditRows = (entityId: string) =>
  prisma.auditLog.findMany({ where: { entityId }, orderBy: { id: 'asc' } });

/** Stock via the inventory module (the only writer of stock tables). */
function receive(productId: string, qty: number) {
  return withTransaction((tx) =>
    inventory.receive(tx, staff, {
      type: 'PURCHASE',
      docDate: new Date(),
      lines: [
        {
          subWarehouseId: f.subWarehouse.id,
          productId,
          qty,
          unitCost: '5000.0000',
          costAmount: qty * 5000,
        },
      ],
    }),
  );
}

function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } },
  })
    .png()
    .toBuffer();
}

async function storedFiles(productId: string): Promise<string[]> {
  try {
    return await readdir(path.join(uploadDir, 'products', productId));
  } catch {
    return [];
  }
}

describe('create', () => {
  it('STAFF creates a product with every FR-1.1 field and an audit row', async () => {
    const category = await categories.create(owner, { name: 'Gazli' });
    const brand = await makeBrand(prisma, { organizationId: f.organization.id });

    const product = await products.create(staff, {
      ...base,
      name: '  Coca-Cola 1.5 L ',
      categoryId: category.id,
      brandId: brand.id,
      sku: ' CC-15 ',
      barcode: '4780000000017',
      minStock: 12,
      expiryDate: '2027-03-01',
    });

    expect(product).toMatchObject({
      name: 'Coca-Cola 1.5 L',
      sku: 'CC-15',
      barcode: '4780000000017',
      category: { id: category.id, name: 'Gazli', archived: false },
      brand: { id: brand.id, archived: false },
      unitsPerBlock: 6,
      salePrice: 12_000,
      blockPrice: 72_000,
      minStock: 12,
      expiryDate: '2027-03-01',
      imageVersion: null,
      archived: false,
      stockQty: 0,
      lowStock: true,
    });
    const rows = await auditRows(product.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'CREATE',
      entityType: 'product',
      userId: f.staff.id,
      after: { name: 'Coca-Cola 1.5 L', salePrice: 12_000, unitsPerBlock: 6, sku: 'CC-15' },
    });
  });

  it('optional fields may stay empty', async () => {
    const product = await products.create(owner, {
      ...base,
      sku: '',
      barcode: null,
      categoryId: '',
      expiryDate: '',
    });
    expect(product).toMatchObject({
      sku: null,
      barcode: null,
      category: null,
      brand: null,
      expiryDate: null,
      lowStock: false,
    });
  });

  it('T-303: a duplicate SKU or barcode throws DUPLICATE_VALUE, case-insensitively', async () => {
    await products.create(owner, { ...base, sku: 'CC-15', barcode: '4780000000017' });

    await expect(
      products.create(staff, { ...base, name: 'Boshqa', sku: 'cc-15' }),
    ).rejects.toMatchObject({
      code: ErrorCode.DUPLICATE_VALUE,
      params: { entity: 'product', field: 'sku', archived: false },
    });
    await expect(
      products.create(staff, { ...base, name: 'Boshqa', barcode: '4780000000017' }),
    ).rejects.toMatchObject({
      code: ErrorCode.DUPLICATE_VALUE,
      params: { field: 'barcode' },
    });
    // Empty codes never clash; the same name is allowed (no unique index on name).
    await expect(products.create(staff, base)).resolves.toMatchObject({ sku: null });
  });

  it('an archived product keeps its codes taken (archived: true)', async () => {
    const old = await products.create(owner, { ...base, barcode: '111' });
    await products.archive(owner, { id: old.id });

    await expect(products.create(owner, { ...base, barcode: '111' })).rejects.toMatchObject({
      code: ErrorCode.DUPLICATE_VALUE,
      params: { field: 'barcode', archived: true },
    });
  });

  it('codes are unique per organization only', async () => {
    await products.create(owner, { ...base, sku: 'X-1' });
    const other = await makeStoreFixture(prisma);
    const otherCtx = { ...owner, organizationId: other.organization.id, storeId: other.store.id };

    await expect(products.create(otherCtx, { ...base, sku: 'X-1' })).resolves.toMatchObject({
      sku: 'X-1',
    });
  });

  it('two concurrent creates with one barcode: one wins, the other gets DUPLICATE_VALUE', async () => {
    const results = await Promise.allSettled([
      products.create(owner, { ...base, barcode: '999' }),
      products.create(staff, { ...base, barcode: '999' }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const [rejected] = results.filter((r) => r.status === 'rejected');
    expect(rejected?.reason).toMatchObject({
      code: ErrorCode.DUPLICATE_VALUE,
      params: { field: 'barcode' },
    });
  });

  it('an archived or foreign category / brand cannot be chosen', async () => {
    const archived = await categories.create(owner, { name: 'Eski' });
    await categories.archive(owner, { id: archived.id });
    const foreign = await makeBrand(prisma);

    await expect(
      products.create(owner, { ...base, categoryId: archived.id }),
    ).rejects.toMatchObject({ code: ErrorCode.ENTITY_ARCHIVED, params: { entity: 'category' } });
    await expect(products.create(owner, { ...base, brandId: foreign.id })).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
      params: { entity: 'brand' },
    });
  });

  it('rejects invalid input with VALIDATION_FAILED and field errors', async () => {
    await expect(
      products.create(owner, { ...base, name: ' ', unitsPerBlock: 0, salePrice: 1.5 }),
    ).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_FAILED,
      fieldErrors: {
        name: expect.any(Array),
        unitsPerBlock: expect.any(Array),
        salePrice: expect.any(Array),
      },
    });
  });
});

describe('update', () => {
  it('OQ-06: STAFF changes units per block; the audit row keeps only changed fields', async () => {
    const product = await products.create(owner, { ...base, minStock: 6 });
    await receive(product.id, 20);

    const updated = await products.update(staff, {
      id: product.id,
      ...base,
      unitsPerBlock: 12,
      salePrice: 11_500,
      minStock: 6,
    });

    // Stock stays in pieces; only the block view and block price change.
    expect(updated).toMatchObject({
      unitsPerBlock: 12,
      salePrice: 11_500,
      blockPrice: 138_000,
      stockQty: 20,
      lowStock: false,
    });
    const rows = await auditRows(product.id);
    expect(rows.map((r) => r.action)).toEqual(['CREATE', 'UPDATE']);
    expect(rows[1]).toMatchObject({
      userId: f.staff.id,
      before: { unitsPerBlock: 6, salePrice: 12_000 },
      after: { unitsPerBlock: 12, salePrice: 11_500 },
    });
    expect(Object.keys(rows[1]?.after as object).sort()).toEqual(['salePrice', 'unitsPerBlock']);
  });

  it('no change → no write and no audit row; own SKU may change case', async () => {
    const product = await products.create(owner, { ...base, sku: 'ab-1' });

    await products.update(owner, { id: product.id, ...base, sku: 'ab-1' });
    await products.update(owner, { id: product.id, ...base, sku: 'AB-1' });

    const rows = await auditRows(product.id);
    expect(rows.map((r) => r.action)).toEqual(['CREATE', 'UPDATE']);
    expect(rows[1]).toMatchObject({ before: { sku: 'ab-1' }, after: { sku: 'AB-1' } });
  });

  it('rejects a SKU another product has', async () => {
    await products.create(owner, { ...base, sku: 'A' });
    const b = await products.create(owner, { ...base, sku: 'B' });

    await expect(products.update(owner, { id: b.id, ...base, sku: 'a' })).rejects.toMatchObject({
      code: ErrorCode.DUPLICATE_VALUE,
      params: { field: 'sku' },
    });
  });

  it('keeps an archived category already set, but a new archived one is rejected', async () => {
    const category = await categories.create(owner, { name: 'Pivo' });
    const brand = await makeBrand(prisma, {
      organizationId: f.organization.id,
      archivedAt: new Date(),
    });
    const product = await products.create(owner, { ...base, categoryId: category.id });
    await categories.archive(owner, { id: category.id });

    const updated = await products.update(owner, {
      id: product.id,
      ...base,
      name: 'Yangi nom',
      categoryId: category.id,
    });
    expect(updated.category).toEqual({ id: category.id, name: 'Pivo', archived: true });

    await expect(
      products.update(owner, {
        id: product.id,
        ...base,
        categoryId: category.id,
        brandId: brand.id,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.ENTITY_ARCHIVED, params: { entity: 'brand' } });
  });

  it('another organization’s product is NOT_FOUND', async () => {
    const foreign = await makeProduct(prisma);

    await expect(products.update(owner, { id: foreign.id, ...base })).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
      params: { entity: 'product' },
    });
    await expect(products.get(owner, { id: foreign.id })).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
    await expect(products.archive(owner, { id: foreign.id })).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
  });
});

describe('archive', () => {
  it('FR-1.2: archives (with stock too, OQ-20) and restores; repeats are no-ops', async () => {
    const product = await products.create(owner, base);
    await receive(product.id, 3);

    const archived = await products.archive(staff, { id: product.id });
    await products.archive(staff, { id: product.id });
    expect(archived).toMatchObject({ archived: true, stockQty: 3 });
    await products.restore(owner, { id: product.id });
    await products.restore(owner, { id: product.id });

    const rows = await auditRows(product.id);
    expect(rows.map((r) => r.action)).toEqual(['CREATE', 'ARCHIVE', 'RESTORE']);
    expect(rows[2]).toMatchObject({ after: { archivedAt: null } });
    expect(await prisma.product.count({ where: { id: product.id } })).toBe(1);
  });
});

describe('list', () => {
  it('searches name, SKU and barcode; filters category, brand and archive; sorts by name', async () => {
    const water = await makeCategory(prisma, { organizationId: f.organization.id });
    const brand = await makeBrand(prisma, { organizationId: f.organization.id });
    const fanta = await products.create(owner, { ...base, name: 'Fanta', sku: 'FN-1' });
    const cola = await products.create(owner, { ...base, name: 'Coca-Cola', barcode: '4780123' });
    const nestle = await products.create(owner, {
      ...base,
      name: 'Nestle suv',
      categoryId: water.id,
      brandId: brand.id,
    });
    const old = await products.create(owner, { ...base, name: 'Eski cola' });
    await products.archive(owner, { id: old.id });
    await makeProduct(prisma, { name: 'Begona cola' }); // another organization

    const ids = async (query: Parameters<typeof products.list>[1]) =>
      (await products.list(staff, query)).items.map((p) => p.id);

    expect(await ids({})).toEqual([cola.id, fanta.id, nestle.id]);
    expect(await ids({ q: 'COLA' })).toEqual([cola.id]);
    expect(await ids({ q: 'fn-' })).toEqual([fanta.id]);
    expect(await ids({ q: '0123' })).toEqual([cola.id]);
    expect(await ids({ categoryId: water.id })).toEqual([nestle.id]);
    expect(await ids({ brandId: brand.id, q: 'suv' })).toEqual([nestle.id]);
    expect(await ids({ archived: true })).toEqual([old.id]);
    expect(await ids({ archived: true, q: 'cola' })).toEqual([old.id]);
  });

  it('FR-1.3: stock from the inventory module and the low-stock flag', async () => {
    const low = await products.create(owner, { ...base, name: 'A', minStock: 12 });
    const enough = await products.create(owner, { ...base, name: 'B', minStock: 12 });
    const noMin = await products.create(owner, { ...base, name: 'C' });
    await receive(low.id, 11);
    await receive(enough.id, 12);

    const { items } = await products.list(staff);
    expect(items.map((p) => [p.name, p.stockQty, p.lowStock])).toEqual([
      ['A', 11, true],
      ['B', 12, false],
      ['C', 0, false],
    ]);
    expect(noMin.lowStock).toBe(false);
    // No confidential field reaches anyone (CLAUDE.md rule 6).
    expect(Object.keys(items[0] as object)).not.toContain('avgCost');
  });

  it('pages by PRODUCT_PAGE_SIZE with the total count', async () => {
    await prisma.product.createMany({
      data: Array.from({ length: 52 }, (_, i) => ({
        organizationId: f.organization.id,
        name: `Mahsulot ${String(i).padStart(2, '0')}`,
        unitsPerBlock: 1,
        salePrice: 1000n,
      })),
    });

    const first = await products.list(owner);
    const second = await products.list(owner, { page: 2 });
    expect([first.total, first.items.length, first.pageSize]).toEqual([52, 50, 50]);
    expect(second.items.map((p) => p.name)).toEqual(['Mahsulot 50', 'Mahsulot 51']);
  });
});

describe('image', () => {
  it('resizes to fit 512 px, stores WebP, replaces and removes with audit rows', async () => {
    const product = await products.create(staff, base);

    const withImage = await products.setImage(staff, {
      id: product.id,
      data: await png(1600, 800),
    });
    expect(withImage.imageVersion).toEqual(expect.any(String));
    const first = await products.readImage(staff, { id: product.id });
    expect(first.contentType).toBe('image/webp');
    expect(first.version).toBe(withImage.imageVersion);
    const meta = await sharp(first.data).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 512, 256]);

    // A small image is not enlarged; the old file is removed.
    const replaced = await products.setImage(owner, { id: product.id, data: await png(100, 50) });
    expect(replaced.imageVersion).not.toBe(withImage.imageVersion);
    expect(await storedFiles(product.id)).toEqual([`${replaced.imageVersion}.webp`]);
    const second = await products.readImage(owner, { id: product.id });
    expect((await sharp(second.data).metadata()).width).toBe(100);

    await products.removeImage(owner, { id: product.id });
    await products.removeImage(owner, { id: product.id });
    expect(await storedFiles(product.id)).toEqual([]);
    await expect(products.readImage(owner, { id: product.id })).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });

    const rows = await auditRows(product.id);
    expect(rows.map((r) => r.action)).toEqual(['CREATE', 'UPDATE', 'UPDATE', 'UPDATE']);
    expect(rows[1]).toMatchObject({ before: { imagePath: null } });
    expect(rows[3]).toMatchObject({ after: { imagePath: null } });
  });

  it('rejects files over 2 MB and non jpg/png/webp content', async () => {
    const product = await products.create(owner, base);
    const gif = await sharp({
      create: { width: 10, height: 10, channels: 3, background: '#000' },
    })
      .gif()
      .toBuffer();

    for (const [data, reason] of [
      [new Uint8Array(PRODUCT_IMAGE_MAX_BYTES + 1), 'tooBig'],
      [gif, 'invalidType'],
      [new TextEncoder().encode('not an image'), 'invalidType'],
    ] as const) {
      await expect(products.setImage(owner, { id: product.id, data })).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_FAILED,
        fieldErrors: { image: [reason] },
      });
    }
    expect(await storedFiles(product.id)).toEqual([]);
    expect((await products.get(owner, { id: product.id })).imageVersion).toBeNull();
  });

  it('a foreign product gets no image and its written file is cleaned up', async () => {
    const foreign = await makeProduct(prisma);

    await expect(
      products.setImage(owner, { id: foreign.id, data: await png(20, 20) }),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
    expect(await storedFiles(foreign.id)).toEqual([]);
  });
});
