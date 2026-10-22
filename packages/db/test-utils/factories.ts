// Test data factories. Each takes a client (`prisma`, a test client or a
// transaction) and optional overrides; a missing parent (organization, store,
// warehouse, user) is created on the fly, so `makeProduct(db)` just works.
// Names are unique per call, so factories can be called repeatedly.
import { randomUUID } from 'node:crypto';

import type {
  Brand,
  Cashbox,
  Category,
  Organization,
  Prisma,
  Product,
  Store,
  SubWarehouse,
  User,
  Warehouse,
} from '../src/generated/prisma/client';
import type { DbClient } from './client';

let counter = 0;
/** `<prefix><n>-<random>`: unique across calls and test files. */
const unique = (prefix: string): string => `${prefix}${++counter}-${randomUUID().slice(0, 6)}`;

export function makeOrganization(
  db: DbClient,
  data: Partial<Prisma.OrganizationUncheckedCreateInput> = {},
): Promise<Organization> {
  return db.organization.create({ data: { name: unique('Org '), ...data } });
}

export async function makeStore(
  db: DbClient,
  data: Partial<Prisma.StoreUncheckedCreateInput> = {},
): Promise<Store> {
  const organizationId = data.organizationId ?? (await makeOrganization(db)).id;
  return db.store.create({ data: { name: unique('Store '), ...data, organizationId } });
}

/**
 * A STAFF user by default. `passwordHash` is a placeholder; pass a real
 * argon2id hash when the test logs in.
 */
export async function makeUser(
  db: DbClient,
  data: Partial<Prisma.UserUncheckedCreateInput> = {},
): Promise<User> {
  const organizationId = data.organizationId ?? (await makeOrganization(db)).id;
  return db.user.create({
    data: {
      username: unique('user').toLowerCase(),
      passwordHash: 'not-a-hash',
      fullName: 'Test User',
      role: 'STAFF',
      ...data,
      organizationId,
    },
  });
}

export async function makeCategory(
  db: DbClient,
  data: Partial<Prisma.CategoryUncheckedCreateInput> = {},
): Promise<Category> {
  const organizationId = data.organizationId ?? (await makeOrganization(db)).id;
  return db.category.create({ data: { name: unique('Category '), ...data, organizationId } });
}

export async function makeBrand(
  db: DbClient,
  data: Partial<Prisma.BrandUncheckedCreateInput> = {},
): Promise<Brand> {
  const organizationId = data.organizationId ?? (await makeOrganization(db)).id;
  return db.brand.create({ data: { name: unique('Brand '), ...data, organizationId } });
}

/** 6 pieces per block, 12 000 so'm per piece by default. */
export async function makeProduct(
  db: DbClient,
  data: Partial<Prisma.ProductUncheckedCreateInput> = {},
): Promise<Product> {
  const organizationId = data.organizationId ?? (await makeOrganization(db)).id;
  return db.product.create({
    data: {
      name: unique('Product '),
      unitsPerBlock: 6,
      salePrice: 12_000n,
      ...data,
      organizationId,
    },
  });
}

export type WarehouseWithSubs = Warehouse & { subWarehouses: SubWarehouse[] };

/**
 * A warehouse with sub-warehouses (one "Shelf" by default; pass
 * `subWarehouses: ['A', 'B']` for more, `[]` for none), ordered by name.
 */
export async function makeWarehouse(
  db: DbClient,
  {
    subWarehouses = ['Shelf'],
    ...data
  }: Partial<Omit<Prisma.WarehouseUncheckedCreateInput, 'subWarehouses'>> & {
    subWarehouses?: string[];
  } = {},
): Promise<WarehouseWithSubs> {
  const storeId = data.storeId ?? (await makeStore(db)).id;
  return db.warehouse.create({
    data: {
      name: unique('Warehouse '),
      ...data,
      storeId,
      subWarehouses: { create: subWarehouses.map((name) => ({ name })) },
    },
    include: { subWarehouses: { orderBy: { name: 'asc' } } },
  });
}

export async function makeSubWarehouse(
  db: DbClient,
  data: Partial<Prisma.SubWarehouseUncheckedCreateInput> = {},
): Promise<SubWarehouse> {
  const warehouseId = data.warehouseId ?? (await makeWarehouse(db, { subWarehouses: [] })).id;
  return db.subWarehouse.create({ data: { name: unique('Sub '), ...data, warehouseId } });
}

/**
 * A CASH cashbox by default (one per type per store). A positive `balance`
 * is booked as an IN cash_transaction (DEBT_TAKEN, note "test opening
 * balance") by `createdById` (a new user if omitted), so the cash invariant
 * holds without going through the cash service.
 */
export async function makeCashbox(
  db: DbClient,
  {
    balance = 0n,
    createdById,
    ...data
  }: Partial<Omit<Prisma.CashboxUncheckedCreateInput, 'balance'>> & {
    balance?: bigint;
    createdById?: string;
  } = {},
): Promise<Cashbox> {
  const store = data.storeId
    ? await db.store.findUniqueOrThrow({ where: { id: data.storeId } })
    : await makeStore(db);
  const type = data.type ?? 'CASH';
  const cashbox = await db.cashbox.create({
    data: { name: type === 'CASH' ? 'Naqd' : 'Karta', type, ...data, storeId: store.id, balance },
  });
  if (balance > 0n) {
    const authorId =
      createdById ?? (await makeUser(db, { organizationId: store.organizationId })).id;
    await db.cashTransaction.create({
      data: {
        storeId: store.id,
        cashboxId: cashbox.id,
        direction: 'IN',
        type: 'DEBT_TAKEN',
        amount: balance,
        balanceAfter: balance,
        txDate: new Date(),
        note: 'test opening balance',
        createdById: authorId,
      },
    });
  }
  return cashbox;
}

export interface StoreFixture {
  organization: Organization;
  store: Store;
  owner: User;
  staff: User;
  warehouse: WarehouseWithSubs;
  subWarehouse: SubWarehouse;
  cashboxes: { cash: Cashbox; card: Cashbox };
}

/**
 * The usual starting point of a service test: an organization with one
 * store, an OWNER and a STAFF user, a warehouse with one sub-warehouse and
 * both cashboxes (empty unless `cashBalance` is given).
 */
export async function makeStoreFixture(
  db: DbClient,
  { cashBalance = 0n }: { cashBalance?: bigint } = {},
): Promise<StoreFixture> {
  const organization = await makeOrganization(db);
  const store = await makeStore(db, { organizationId: organization.id });
  const owner = await makeUser(db, { organizationId: organization.id, role: 'OWNER' });
  const staff = await makeUser(db, { organizationId: organization.id });
  const warehouse = await makeWarehouse(db, { storeId: store.id });
  const storeId = store.id;
  const cash = await makeCashbox(db, {
    storeId,
    type: 'CASH',
    balance: cashBalance,
    createdById: owner.id,
  });
  const card = await makeCashbox(db, { storeId, type: 'CARD' });
  return {
    organization,
    store,
    owner,
    staff,
    warehouse,
    subWarehouse: warehouse.subWarehouses[0]!,
    cashboxes: { cash, card },
  };
}
