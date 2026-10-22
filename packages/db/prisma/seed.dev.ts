// Sample data for local development only (database.md §8): runs the base seed,
// then adds warehouses, sub-warehouses, categories, brands, products and two
// STAFF users. Idempotent via natural unique keys. No stock or purchases:
// those must go through the inventory/purchase services (T-4xx).
// Run: `pnpm db:seed:dev`.
import { UserRole, type PrismaClient } from '../src/generated/prisma/client';
import { hashPassword, ownerFromEnv, runSeedScript, seed } from './seed';

export const DEV_STAFF_PASSWORD = 'staff1234';

const WAREHOUSES: Record<string, string[]> = {
  'Asosiy ombor': ['A qator', 'B qator', 'Sovutgich'],
  "Do'kon zali": ['Peshtaxta', 'Vitrina'],
};

const STAFF = [
  { username: 'staff1', fullName: 'Aliyev Vali' },
  { username: 'staff2', fullName: 'Karimova Nodira' },
];

// sku, name, category, brand, units per block, sale price (so'm), min stock
const PRODUCTS: [string, string, string, string, number, bigint, number][] = [
  ['CC-05', 'Coca-Cola 0.5 L', 'Gazli ichimliklar', 'Coca-Cola', 12, 7000n, 24],
  ['CC-15', 'Coca-Cola 1.5 L', 'Gazli ichimliklar', 'Coca-Cola', 6, 14000n, 12],
  ['FA-15', 'Fanta 1.5 L', 'Gazli ichimliklar', 'Coca-Cola', 6, 13000n, 12],
  ['PE-05', 'Pepsi 0.5 L', 'Gazli ichimliklar', 'Pepsi', 12, 6500n, 24],
  ['PE-20', 'Pepsi 2 L', 'Gazli ichimliklar', 'Pepsi', 6, 16000n, 6],
  ['NS-05', 'Nestle Pure Life 0.5 L', 'Suv', 'Nestle', 12, 3000n, 48],
  ['NS-15', 'Nestle Pure Life 1.5 L', 'Suv', 'Nestle', 6, 5000n, 24],
  ['HY-10', 'Hydrolife 1 L', 'Suv', 'Hydrolife', 12, 4000n, 24],
  ['RB-025', 'Red Bull 0.25 L', 'Energetik', 'Red Bull', 24, 18000n, 24],
  ['FL-045', 'Flash Up 0.45 L', 'Energetik', 'Flash Up', 12, 9000n, 12],
  ['RC-10', 'Rich apelsin sharbati 1 L', 'Sharbat', 'Rich', 12, 19000n, 6],
  ['RC-10A', 'Rich olma sharbati 1 L', 'Sharbat', 'Rich', 12, 19000n, 6],
  ['LP-05', 'Lipton muzli choy 0.5 L', 'Muzli choy', 'Lipton', 12, 8000n, 12],
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

    const organizationId = organization.id;
    const categoryIds = new Map<string, string>();
    for (const name of new Set(PRODUCTS.map((p) => p[2]))) {
      const { id } = await tx.category.upsert({
        where: { organizationId_name: { organizationId, name } },
        create: { organizationId, name },
        update: {},
      });
      categoryIds.set(name, id);
    }
    const brandIds = new Map<string, string>();
    for (const name of new Set(PRODUCTS.map((p) => p[3]))) {
      const { id } = await tx.brand.upsert({
        where: { organizationId_name: { organizationId, name } },
        create: { organizationId, name },
        update: {},
      });
      brandIds.set(name, id);
    }

    for (const [sku, name, category, brand, unitsPerBlock, salePrice, minStock] of PRODUCTS) {
      await tx.product.upsert({
        where: { organizationId_sku: { organizationId, sku } },
        create: {
          organizationId,
          sku,
          name,
          categoryId: categoryIds.get(category)!,
          brandId: brandIds.get(brand)!,
          unitsPerBlock,
          salePrice,
          minStock,
        },
        update: {},
      });
    }

    const owner = await tx.user.findFirstOrThrow({
      where: { organizationId, role: UserRole.OWNER },
    });
    for (const staff of STAFF) {
      await tx.user.upsert({
        where: { username: staff.username },
        create: {
          ...staff,
          organizationId,
          passwordHash: staffPasswordHash,
          role: UserRole.STAFF,
          createdById: owner.id,
        },
        update: {},
      });
    }
  });
}

await runSeedScript(import.meta.url, async (prisma) => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed.dev.ts is for local development only');
  }
  await seedDev(prisma);
  console.log('Dev seed done');
});
