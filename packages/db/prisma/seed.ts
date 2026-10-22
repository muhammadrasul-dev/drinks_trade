// Minimal production seed (database.md §8): organization, store, two cashboxes,
// the single OWNER and document sequences. Idempotent: existing rows are kept
// as they are (the OWNER's password and doc counters are never reset).
// Run: `pnpm db:seed` (prisma.config.ts → migrations.seed).
import { fileURLToPath } from 'node:url';

import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';

import {
  CashboxType,
  DocType,
  PrismaClient,
  UserRole,
  type Organization,
  type Store,
} from '../src/generated/prisma/client';

const ORGANIZATION_NAME = 'Drinks Trade';
const STORE_NAME = "Asosiy do'kon";
const STORE_TIMEZONE = 'Asia/Tashkent';
const OWNER_FULL_NAME = 'Egasi';

const CASHBOXES = [
  { type: CashboxType.CASH, name: 'Naqd' },
  { type: CashboxType.CARD, name: 'Karta' },
] as const;

// Same rules as the `user_username_format` CHECK and business-logic §11.
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
const MIN_PASSWORD_LENGTH = 8;

export interface OwnerCredentials {
  username: string;
  password: string;
}

export interface SeedResult {
  organization: Organization;
  store: Store;
}

/**
 * argon2id (ADR-006) — the library default (its `Algorithm` is a const enum,
 * unusable under verbatimModuleSyntax). The PHC string carries its own
 * parameters, so T-201 can verify it with any argon2 implementation.
 */
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export function ownerFromEnv(env: NodeJS.ProcessEnv = process.env): OwnerCredentials {
  const username = env.SEED_OWNER_USERNAME?.trim().toLowerCase() ?? '';
  const password = env.SEED_OWNER_PASSWORD ?? '';
  if (!USERNAME_RE.test(username)) {
    throw new Error('SEED_OWNER_USERNAME must be 3–32 characters of a-z 0-9 . _ -');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`SEED_OWNER_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  return { username, password };
}

export async function seed(prisma: PrismaClient, owner: OwnerCredentials): Promise<SeedResult> {
  return prisma.$transaction(async (tx) => {
    // v1 has one organization and one store (ADR-011); neither has a natural
    // unique key, so "already seeded" means "the first one exists".
    const organization =
      (await tx.organization.findFirst({ orderBy: { createdAt: 'asc' } })) ??
      (await tx.organization.create({ data: { name: ORGANIZATION_NAME } }));

    const store =
      (await tx.store.findFirst({
        where: { organizationId: organization.id },
        orderBy: { createdAt: 'asc' },
      })) ??
      (await tx.store.create({
        data: { organizationId: organization.id, name: STORE_NAME, timezone: STORE_TIMEZONE },
      }));

    for (const cashbox of CASHBOXES) {
      await tx.cashbox.upsert({
        where: { storeId_type: { storeId: store.id, type: cashbox.type } },
        create: { storeId: store.id, ...cashbox },
        update: {},
      });
    }

    for (const docType of Object.values(DocType)) {
      await tx.docSequence.upsert({
        where: { storeId_docType: { storeId: store.id, docType } },
        create: { storeId: store.id, docType, lastNumber: 0 },
        update: {},
      });
    }

    // Exactly one OWNER per organization (`user_single_owner`). Once it exists
    // the seed leaves it alone: the owner may have changed login or password.
    const existingOwner = await tx.user.findFirst({
      where: { organizationId: organization.id, role: UserRole.OWNER },
    });
    if (!existingOwner) {
      const taken = await tx.user.findUnique({ where: { username: owner.username } });
      if (taken) {
        throw new Error(`Username "${owner.username}" already belongs to a non-owner user`);
      }
      await tx.user.create({
        data: {
          organizationId: organization.id,
          username: owner.username,
          passwordHash: await hashPassword(owner.password),
          fullName: OWNER_FULL_NAME,
          role: UserRole.OWNER,
        },
      });
    }

    return { organization, store };
  });
}

export function createClient(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/**
 * Entry point shared by seed.ts and seed.dev.ts: runs `run` against
 * DATABASE_URL from the repo-root .env, only when `moduleUrl` is the script
 * being executed (not when a test imports it).
 */
export async function runSeedScript(
  moduleUrl: string,
  run: (prisma: PrismaClient) => Promise<void>,
): Promise<void> {
  if (process.argv[1] !== fileURLToPath(moduleUrl)) {
    return;
  }
  config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
  const prisma = createClient();
  try {
    await run(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

await runSeedScript(import.meta.url, async (prisma) => {
  const { store } = await seed(prisma, ownerFromEnv());
  console.log(`Seed done: store "${store.name}" (${store.id})`);
});
