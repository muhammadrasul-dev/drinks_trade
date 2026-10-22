# Integration-test kit (`@drinks/db/test-utils`)

Shared by every package's `pnpm test:int` (T-105). Tests run against
`DATABASE_URL_TEST` (repo-root `.env`, or the CI env); the name must end in
`_test`, and `truncateAll` refuses any other database.

## Wiring a package

`vitest.int.config.ts`:

```ts
test: {
  include: ['test/int/**/*.int.test.ts'],
  globalSetup: ['test/int/global-setup.ts'], // export { default } from '@drinks/db/test-utils/global-setup';
  setupFiles: ['test/int/setup.ts'],         // import '@drinks/db/test-utils/setup';
  fileParallelism: false,                    // all files share one database
}
```

- **global-setup** — `prisma migrate deploy` into the test DB, once per run (never resets).
- **setup** — in each file's worker: sets `DATABASE_URL` to the test DB (so the
  `prisma` singleton from `@drinks/db` connects there), then `beforeAll` →
  `truncateAll`. Every file starts from an empty database; tests inside a
  file share it (commit fixtures in `beforeAll`, or roll back per test).

The root `pnpm test:int` runs each package's `test:int` one after another
(`pnpm -r --workspace-concurrency=1`), so packages never truncate each other.

## API

| Helper | What it does |
|---|---|
| `truncateAll(db)` | `TRUNCATE … RESTART IDENTITY CASCADE` of every table except `_prisma_migrations`. Works despite the append-only triggers (TRUNCATE fires no row triggers). |
| `assertInvariants(db)` | Throws if `stock_balance.qty ≠ Σ stock_movement.qty_delta`, `product_cost.total_qty ≠ Σ stock_balance.qty` (per store), or `cashbox.balance ≠ Σ IN − Σ OUT`. **Call it at the end of every integration test that touches stock or cash** (e.g. in `afterEach`). |
| `findInvariantViolations(db)` | The offending rows, for asserting on them. |
| `makeOrganization`, `makeStore`, `makeUser`, `makeCategory`, `makeBrand`, `makeProduct`, `makeWarehouse` (with `subWarehouses: string[]`, default `['Shelf']`), `makeSubWarehouse`, `makeCashbox` | `(db, overrides?)` → created row. Missing parents are created; names are unique per call. `makeUser` is STAFF with a placeholder `passwordHash`. `makeCashbox({ balance })` books the balance as an IN `DEBT_TAKEN` transaction so the cash invariant holds. |
| `makeStoreFixture(db, { cashBalance? })` | Organization + store + OWNER + STAFF + warehouse with one sub-warehouse + CASH/CARD cashboxes. |
| `createTestPrisma()` / `connectPg()` | A separate Prisma / raw `pg` client on the test DB (disconnect it in `afterAll`). |
| `insert(pgClient, table, row)`, `expectPgError(pgClient, action, { code, constraint?, message? })` | Raw-SQL helpers for constraint tests (SQLSTATE + constraint name; runs in a savepoint). |
| `testDatabaseUrl()`, `migrateTestDatabase()` | The guarded URL; the migration step. |

`db` is anything with a Prisma API — `prisma`, `createTestPrisma()`, or a
transaction client (`tx` from `withTransaction`). `truncateAll` and the
invariant helpers also accept a raw `pg` client.

## Example

```ts
import { prisma } from '@drinks/db';
import { assertInvariants, makeProduct, makeStoreFixture } from '@drinks/db/test-utils';

let f: StoreFixture;
beforeAll(async () => {
  f = await makeStoreFixture(prisma, { cashBalance: 100_000n });
});
afterEach(() => assertInvariants(prisma));

it('BR-7: …', async () => {
  const product = await makeProduct(prisma, { organizationId: f.organization.id });
  // … call the service …
});
```
