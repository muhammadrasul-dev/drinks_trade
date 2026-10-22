// Sample data for local development only (database.md §8): runs the base seed,
// then adds warehouses, sub-warehouses, categories, brands, products and two
// STAFF users. Idempotent via natural unique keys. No stock or purchases:
// those must go through the inventory/purchase services (T-4xx).
// Run: `pnpm db:seed:dev`.
import { fileURLToPath } from 'node:url';

import { UserRole, type PrismaClient } from '../src/generated/prisma/client';
import { createClient, hashPassword, loadEnv, ownerFromEnv, seed } from './seed';

export const DEV_STAFF_PASSWORD = 'staff1234';

const WAREHOUSES: Record<string, string[]> = {
  'Asosiy ombor': ['A qator', 'B qator', 'Sovutgich'],
  "Do'kon zali": ['Peshtaxta', 'Vitrina'],
};

const STAFF = [
  { username: 'staff1', fullName: 'Aliyev Vali' },
  { username: 'staff2', fullName: 'Karimova Nodira' },
];

interface SampleProduct {
  sku: string;
  name: string;
  category: string;
  brand: string;
  unitsPerBlock: number;
  salePrice: bigint;
  minStock: number;
}

const PRODUCTS: SampleProduct[] = [
  {
    sku: 'CC-05',
    name: 'Coca-Cola 0.5 L',
    category: 'Gazli ichimliklar',
    brand: 'Coca-Cola',
    unitsPerBlock: 12,
    salePrice: 7000n,
    minStock: 24,
  },
  {
    sku: 'CC-15',
    name: 'Coca-Cola 1.5 L',
    category: 'Gazli ichimliklar',
    brand: 'Coca-Cola',
    unitsPerBlock: 6,
    salePrice: 14000n,
    minStock: 12,
  },
  {
    sku: 'FA-15',
    name: 'Fanta 1.5 L',
    category: 'Gazli ichimliklar',
    brand: 'Coca-Cola',
    unitsPerBlock: 6,
    salePrice: 13000n,
    minStock: 12,
  },
  {
    sku: 'PE-05',
    name: 'Pepsi 0.5 L',
    category: 'Gazli ichimliklar',
    brand: 'Pepsi',
    unitsPerBlock: 12,
    salePrice: 6500n,
    minStock: 24,
  },
  {
    sku: 'PE-20',
    name: 'Pepsi 2 L',
    category: 'Gazli ichimliklar',
    brand: 'Pepsi',
    unitsPerBlock: 6,
    salePrice: 16000n,
    minStock: 6,
  },
  {
    sku: 'NS-05',
    name: 'Nestle Pure Life 0.5 L',
    category: 'Suv',
    brand: 'Nestle',
    unitsPerBlock: 12,
    salePrice: 3000n,
    minStock: 48,
  },
  {
    sku: 'NS-15',
    name: 'Nestle Pure Life 1.5 L',
    category: 'Suv',
    brand: 'Nestle',
    unitsPerBlock: 6,
    salePrice: 5000n,
    minStock: 24,
  },
  {
    sku: 'HY-10',
    name: 'Hydrolife 1 L',
    category: 'Suv',
    brand: 'Hydrolife',
    unitsPerBlock: 12,
    salePrice: 4000n,
    minStock: 24,
  },
  {
    sku: 'RB-025',
    name: 'Red Bull 0.25 L',
    category: 'Energetik',
    brand: 'Red Bull',
    unitsPerBlock: 24,
    salePrice: 18000n,
    minStock: 24,
  },
  {
    sku: 'FL-045',
    name: 'Flash Up 0.45 L',
    category: 'Energetik',
    brand: 'Flash Up',
    unitsPerBlock: 12,
    salePrice: 9000n,
    minStock: 12,
  },
  {
    sku: 'RC-10',
    name: 'Rich apelsin sharbati 1 L',
    category: 'Sharbat',
    brand: 'Rich',
    unitsPerBlock: 12,
    salePrice: 19000n,
    minStock: 6,
  },
  {
    sku: 'RC-10A',
    name: 'Rich olma sharbati 1 L',
    category: 'Sharbat',
    brand: 'Rich',
    unitsPerBlock: 12,
    salePrice: 19000n,
    minStock: 6,
  },
  {
    sku: 'LP-05',
    name: 'Lipton muzli choy 0.5 L',
    category: 'Muzli choy',
    brand: 'Lipton',
    unitsPerBlock: 12,
    salePrice: 8000n,
    minStock: 12,
  },
];

export async function seedDev(prisma: PrismaClient, owner = ownerFromEnv()): Promise<void> {
  const { organization, store } = await seed(prisma, owner);
  const staffPasswordHash = await hashPassword(DEV_STAFF_PASSWORD);

  await prisma.$transaction(async (tx) => {
    for (const [warehouseName, subNames] of Object.entries(WAREHOUSES)) {
      const warehouse = await tx.warehouse.upsert({
        where: { storeId_name: { storeId: store.id, name: warehouseName } },
        create: { storeId: store.id, name: warehouseName },
        update: {},
      });
      for (const name of subNames) {
        await tx.subWarehouse.upsert({
          where: { warehouseId_name: { warehouseId: warehouse.id, name } },
          create: { warehouseId: warehouse.id, name },
          update: {},
        });
      }
    }

    const categoryIds = new Map<string, string>();
    const brandIds = new Map<string, string>();
    for (const product of PRODUCTS) {
      const key = { organizationId: organization.id };
      if (!categoryIds.has(product.category)) {
        const category = await tx.category.upsert({
          where: { organizationId_name: { ...key, name: product.category } },
          create: { ...key, name: product.category },
          update: {},
        });
        categoryIds.set(product.category, category.id);
      }
      if (!brandIds.has(product.brand)) {
        const brand = await tx.brand.upsert({
          where: { organizationId_name: { ...key, name: product.brand } },
          create: { ...key, name: product.brand },
          update: {},
        });
        brandIds.set(product.brand, brand.id);
      }
    }

    for (const { category, brand, ...product } of PRODUCTS) {
      await tx.product.upsert({
        where: { organizationId_sku: { organizationId: organization.id, sku: product.sku } },
        create: {
          ...product,
          organizationId: organization.id,
          categoryId: categoryIds.get(category)!,
          brandId: brandIds.get(brand)!,
        },
        update: {},
      });
    }

    const owner = await tx.user.findFirstOrThrow({
      where: { organizationId: organization.id, role: UserRole.OWNER },
    });
    for (const staff of STAFF) {
      await tx.user.upsert({
        where: { username: staff.username },
        create: {
          ...staff,
          organizationId: organization.id,
          passwordHash: staffPasswordHash,
          role: UserRole.STAFF,
          createdById: owner.id,
        },
        update: {},
      });
    }
  });
}

async function main(): Promise<void> {
  loadEnv();
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed.dev.ts is for local development only');
  }
  const prisma = createClient();
  try {
    await seedDev(prisma);
    console.log('Dev seed done');
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
