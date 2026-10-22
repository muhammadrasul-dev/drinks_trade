// T-102: every hand-written constraint from database.md §5 rejects a violating
// statement with the expected Postgres error, and accepts a valid row
// (positive control). Each test runs in a transaction that is rolled back.
import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { connectPg, expectPgError, insert, type Row } from '../../test-utils';

const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (days: number): Date => new Date(Date.now() + days * DAY_MS);

let client: pg.Client;

interface Fixtures {
  organizationId: string;
  storeId: string;
  userId: string;
  warehouseId: string;
  subWarehouseId: string;
  productId: string;
  cashboxId: string;
  saleId: string;
  purchaseId: string;
  stockCountId: string;
  debtId: string;
  cashTransactionId: string;
}
let f: Fixtures;

// Row builders: a valid row of each table; tests override one field.
const build = {
  organization: (): Row => ({ id: randomUUID(), name: 'Org' }),
  user: (o: Row = {}): Row => ({
    id: randomUUID(),
    organization_id: f.organizationId,
    username: `user_${randomUUID().slice(0, 8)}`,
    password_hash: 'x',
    full_name: 'Test User',
    role: 'STAFF',
    updated_at: new Date(),
    ...o,
  }),
  warehouse: (o: Row = {}): Row => ({
    id: randomUUID(),
    store_id: f.storeId,
    name: `W-${randomUUID()}`,
    ...o,
  }),
  product: (o: Row = {}): Row => ({
    id: randomUUID(),
    organization_id: f.organizationId,
    name: 'Coca-Cola 1L',
    units_per_block: 6,
    sale_price: 12_000,
    updated_at: new Date(),
    ...o,
  }),
  stockBalance: (o: Row = {}): Row => ({
    sub_warehouse_id: f.subWarehouseId,
    product_id: f.productId,
    qty: 0,
    updated_at: new Date(),
    ...o,
  }),
  productCost: (o: Row = {}): Row => ({
    store_id: f.storeId,
    product_id: f.productId,
    total_qty: 0,
    avg_cost: '0',
    updated_at: new Date(),
    ...o,
  }),
  cashbox: (o: Row = {}): Row => ({
    id: randomUUID(),
    store_id: f.storeId,
    type: 'CARD',
    name: 'Karta',
    balance: 0,
    updated_at: new Date(),
    ...o,
  }),
  sale: (o: Row = {}): Row => ({
    id: randomUUID(),
    store_id: f.storeId,
    number: `S-${randomUUID()}`,
    doc_date: new Date(),
    created_by_id: f.userId,
    updated_at: new Date(),
    ...o,
  }),
  saleLine: (o: Row = {}): Row => ({
    id: randomUUID(),
    sale_id: f.saleId,
    line_no: 1,
    product_id: f.productId,
    sub_warehouse_id: f.subWarehouseId,
    qty: 1,
    input_unit: 'PIECE',
    input_qty: 1,
    unit_price: 12_000,
    line_total: 12_000,
    ...o,
  }),
  purchase: (o: Row = {}): Row => ({
    id: randomUUID(),
    store_id: f.storeId,
    number: `P-${randomUUID()}`,
    doc_date: new Date(),
    created_by_id: f.userId,
    updated_at: new Date(),
    ...o,
  }),
  purchaseLine: (o: Row = {}): Row => ({
    id: randomUUID(),
    purchase_id: f.purchaseId,
    line_no: 1,
    product_id: f.productId,
    sub_warehouse_id: f.subWarehouseId,
    qty: 6,
    input_unit: 'BLOCK',
    input_qty: 1,
    input_price: 60_000,
    line_total: 60_000,
    unit_cost: '10000',
    ...o,
  }),
  stockCount: (o: Row = {}): Row => ({
    id: randomUUID(),
    store_id: f.storeId,
    warehouse_id: f.warehouseId,
    number: `I-${randomUUID()}`,
    doc_date: new Date(),
    created_by_id: f.userId,
    updated_at: new Date(),
    ...o,
  }),
  stockCountLine: (o: Row = {}): Row => ({
    id: randomUUID(),
    stock_count_id: f.stockCountId,
    sub_warehouse_id: f.subWarehouseId,
    product_id: f.productId,
    counted_qty: 0,
    ...o,
  }),
  stockMovement: (o: Row = {}): Row => ({
    store_id: f.storeId,
    product_id: f.productId,
    sub_warehouse_id: f.subWarehouseId,
    type: 'PURCHASE',
    qty_delta: 6,
    unit_cost: '10000',
    cost_amount: 60_000,
    avg_cost_before: '0',
    avg_cost_after: '10000',
    doc_date: new Date(),
    created_by_id: f.userId,
    ...o,
  }),
  cashTransaction: (o: Row = {}): Row => ({
    store_id: f.storeId,
    cashbox_id: f.cashboxId,
    direction: 'IN',
    type: 'SALE_RECEIPT',
    amount: 12_000,
    balance_after: 12_000,
    tx_date: new Date(),
    created_by_id: f.userId,
    ...o,
  }),
  debt: (o: Row = {}): Row => ({
    id: randomUUID(),
    store_id: f.storeId,
    direction: 'RECEIVABLE',
    source: 'MANUAL',
    amount: 50_000,
    note: 'Ali aka',
    debt_date: new Date(),
    created_by_id: f.userId,
    updated_at: new Date(),
    ...o,
  }),
  debtRepayment: (o: Row = {}): Row => ({
    id: randomUUID(),
    debt_id: f.debtId,
    amount: 10_000,
    repaid_at: new Date(),
    cash_transaction_id: f.cashTransactionId,
    created_by_id: f.userId,
    ...o,
  }),
  auditLog: (o: Row = {}): Row => ({
    store_id: f.storeId,
    user_id: f.userId,
    action: 'CREATE',
    entity_type: 'product',
    entity_id: f.productId,
    after: JSON.stringify({ name: 'Coca-Cola 1L' }),
    ...o,
  }),
};

async function createFixtures(): Promise<Fixtures> {
  const org = await insert(client, 'organization', build.organization());
  const store = await insert(client, 'store', {
    id: randomUUID(),
    organization_id: org.id,
    name: 'Store',
  });
  f = { organizationId: org.id, storeId: store.id } as Fixtures;
  f.userId = (await insert(client, 'user', build.user())).id as string;
  f.warehouseId = (await insert(client, 'warehouse', build.warehouse())).id as string;
  f.subWarehouseId = (
    await insert(client, 'sub_warehouse', {
      id: randomUUID(),
      warehouse_id: f.warehouseId,
      name: 'Shelf',
    })
  ).id as string;
  f.productId = (await insert(client, 'product', build.product())).id as string;
  f.cashboxId = (await insert(client, 'cashbox', build.cashbox({ type: 'CASH', name: 'Naqd' })))
    .id as string;
  f.saleId = (await insert(client, 'sale', build.sale())).id as string;
  f.purchaseId = (await insert(client, 'purchase', build.purchase())).id as string;
  // POSTED, so it does not occupy the warehouse's single open-count slot.
  f.stockCountId = (await insert(client, 'stock_count', build.stockCount({ status: 'POSTED' })))
    .id as string;
  f.debtId = (await insert(client, 'debt', build.debt())).id as string;
  f.cashTransactionId = String(
    (
      await insert(
        client,
        'cash_transaction',
        build.cashTransaction({ type: 'DEBT_REPAID_TO_ME', debt_id: f.debtId }),
      )
    ).id,
  );
  return f;
}

beforeAll(async () => {
  client = await connectPg();
});

afterAll(async () => {
  await client.end();
});

beforeEach(async () => {
  await client.query('BEGIN');
  await createFixtures();
});

afterEach(async () => {
  await client.query('ROLLBACK');
});

interface CheckCase {
  constraint: string;
  table: string;
  invalid: () => Row;
  valid: () => Row;
}

const checkViolation = (constraint: string) => ({ code: '23514', constraint });

describe('CHECK constraints (database §5)', () => {
  const cases: CheckCase[] = [
    // Quantity / money / cost invariants
    {
      constraint: 'stock_balance_qty_nonneg',
      table: 'stock_balance',
      invalid: () => build.stockBalance({ qty: -1 }),
      valid: () => build.stockBalance({ qty: 0 }),
    },
    {
      constraint: 'product_cost_qty_nonneg',
      table: 'product_cost',
      invalid: () => build.productCost({ total_qty: -1 }),
      valid: () => build.productCost({ total_qty: 0 }),
    },
    {
      constraint: 'product_cost_avg_nonneg',
      table: 'product_cost',
      invalid: () => build.productCost({ avg_cost: '-0.0001' }),
      valid: () => build.productCost({ avg_cost: '4166.6667' }),
    },
    {
      constraint: 'cashbox_balance_nonneg',
      table: 'cashbox',
      invalid: () => build.cashbox({ balance: -1 }),
      valid: () => build.cashbox({ balance: 0 }),
    },
    {
      constraint: 'product_units_per_block_pos',
      table: 'product',
      invalid: () => build.product({ units_per_block: 0 }),
      valid: () => build.product({ units_per_block: 1 }),
    },
    {
      constraint: 'product_sale_price_nonneg',
      table: 'product',
      invalid: () => build.product({ sale_price: -1 }),
      valid: () => build.product({ sale_price: 0 }),
    },
    {
      constraint: 'product_min_stock_nonneg',
      table: 'product',
      invalid: () => build.product({ min_stock: -1 }),
      valid: () => build.product({ min_stock: 0 }),
    },
    {
      constraint: 'sale_line_qty_pos',
      table: 'sale_line',
      invalid: () => build.saleLine({ qty: 0 }),
      valid: () => build.saleLine({ qty: 1 }),
    },
    {
      constraint: 'purchase_line_qty_pos',
      table: 'purchase_line',
      invalid: () => build.purchaseLine({ qty: 0 }),
      valid: () => build.purchaseLine({ qty: 1 }),
    },
    {
      constraint: 'stock_count_line_qty_nonneg',
      table: 'stock_count_line',
      invalid: () => build.stockCountLine({ counted_qty: -1 }),
      valid: () => build.stockCountLine({ counted_qty: 0 }),
    },
    {
      constraint: 'stock_movement_delta_nonzero',
      table: 'stock_movement',
      invalid: () => build.stockMovement({ qty_delta: 0 }),
      valid: () => build.stockMovement({ qty_delta: -1, type: 'SALE' }),
    },
    {
      constraint: 'cash_tx_amount_pos',
      table: 'cash_transaction',
      invalid: () => build.cashTransaction({ amount: 0 }),
      valid: () => build.cashTransaction({ amount: 1 }),
    },
    {
      constraint: 'debt_amount_pos',
      table: 'debt',
      invalid: () => build.debt({ amount: 0 }),
      valid: () => build.debt({ amount: 1 }),
    },
    {
      constraint: 'debt_repaid_range',
      table: 'debt',
      invalid: () => build.debt({ amount: 100, repaid_amount: 101 }),
      valid: () => build.debt({ amount: 100, repaid_amount: 100 }),
    },
    {
      constraint: 'debt_repaid_range',
      table: 'debt',
      invalid: () => build.debt({ repaid_amount: -1 }),
      valid: () => build.debt({ repaid_amount: 0 }),
    },
    {
      constraint: 'debt_repayment_amount_pos',
      table: 'debt_repayment',
      invalid: () => build.debtRepayment({ amount: 0 }),
      valid: () => build.debtRepayment({ amount: 1 }),
    },
    // BR-9: payment split on posted documents
    {
      constraint: 'sale_payment_split',
      table: 'sale',
      invalid: () => build.sale({ status: 'POSTED', total_amount: 100, paid_cash: 50 }),
      valid: () =>
        build.sale({
          status: 'POSTED',
          total_amount: 100,
          paid_cash: 50,
          paid_card: 30,
          paid_credit: 20,
        }),
    },
    {
      constraint: 'sale_payment_split',
      table: 'sale',
      invalid: () => build.sale({ status: 'REVERSED', total_amount: 100 }),
      valid: () => build.sale({ status: 'DRAFT', total_amount: 100 }), // drafts may be unbalanced
    },
    {
      constraint: 'sale_payment_nonneg',
      table: 'sale',
      invalid: () => build.sale({ paid_card: -1 }),
      valid: () => build.sale({ paid_card: 0 }),
    },
    {
      constraint: 'purchase_payment_split',
      table: 'purchase',
      invalid: () => build.purchase({ status: 'POSTED', total_amount: 100, paid_credit: 99 }),
      valid: () => build.purchase({ status: 'POSTED', total_amount: 100, paid_credit: 100 }),
    },
    {
      constraint: 'purchase_payment_nonneg',
      table: 'purchase',
      invalid: () => build.purchase({ paid_cash: -1 }),
      valid: () => build.purchase({ paid_cash: 0 }),
    },
    // BR-9: "Other expense" requires a note
    {
      constraint: 'cash_tx_other_note',
      table: 'cash_transaction',
      invalid: () => build.cashTransaction({ type: 'OTHER_EXPENSE', direction: 'OUT', note: '  ' }),
      valid: () => build.cashTransaction({ type: 'OTHER_EXPENSE', direction: 'OUT', note: 'Svet' }),
    },
    {
      constraint: 'cash_tx_other_note',
      table: 'cash_transaction',
      invalid: () => build.cashTransaction({ type: 'OTHER_EXPENSE', direction: 'OUT' }),
      valid: () => build.cashTransaction({ type: 'TRAVEL_EXPENSE', direction: 'OUT' }),
    },
    // OQ-10: username format
    {
      constraint: 'user_username_format',
      table: 'user',
      invalid: () => build.user({ username: 'Ali Aka' }),
      valid: () => build.user({ username: 'ali.aka-1' }),
    },
    {
      constraint: 'user_username_format',
      table: 'user',
      invalid: () => build.user({ username: 'ab' }),
      valid: () => build.user({ username: 'abc' }),
    },
    // OQ-07: coarse "no future date" guard (now() + 1 day margin)
    {
      constraint: 'sale_doc_date_not_future',
      table: 'sale',
      invalid: () => build.sale({ doc_date: inDays(2) }),
      valid: () => build.sale({ doc_date: inDays(-30) }), // backdating is allowed (BR-13)
    },
    {
      constraint: 'purchase_doc_date_not_future',
      table: 'purchase',
      invalid: () => build.purchase({ doc_date: inDays(2) }),
      valid: () => build.purchase({ doc_date: new Date() }),
    },
    {
      constraint: 'stock_count_doc_date_not_future',
      table: 'stock_count',
      invalid: () => build.stockCount({ doc_date: inDays(2) }),
      valid: () => build.stockCount({ doc_date: new Date() }),
    },
    {
      constraint: 'cash_tx_tx_date_not_future',
      table: 'cash_transaction',
      invalid: () => build.cashTransaction({ tx_date: inDays(2) }),
      valid: () => build.cashTransaction({ tx_date: new Date() }),
    },
    {
      constraint: 'debt_debt_date_not_future',
      table: 'debt',
      invalid: () => build.debt({ debt_date: inDays(2) }),
      valid: () => build.debt({ debt_date: new Date() }),
    },
    {
      constraint: 'debt_repayment_date_not_future',
      table: 'debt_repayment',
      invalid: () => build.debtRepayment({ repaid_at: inDays(2) }),
      valid: () => build.debtRepayment({ repaid_at: new Date() }),
    },
  ];

  it.each(cases)('$constraint rejects an invalid $table row', async (c) => {
    await expectPgError(
      client,
      () => insert(client, c.table, c.invalid()),
      checkViolation(c.constraint),
    );
    await expect(insert(client, c.table, c.valid())).resolves.toBeDefined();
  });

  it('stock_balance_qty_nonneg rejects an UPDATE below zero', async () => {
    await insert(client, 'stock_balance', build.stockBalance({ qty: 5 }));
    const decrement = (by: number) =>
      client.query(
        'UPDATE stock_balance SET qty = qty - $1 WHERE sub_warehouse_id = $2 AND product_id = $3',
        [by, f.subWarehouseId, f.productId],
      );
    await expectPgError(client, () => decrement(6), checkViolation('stock_balance_qty_nonneg'));
    await expect(decrement(5)).resolves.toMatchObject({ rowCount: 1 });
  });

  it('sale_payment_split rejects posting an unbalanced draft', async () => {
    const sale = await insert(client, 'sale', build.sale({ total_amount: 100, paid_cash: 40 }));
    const post = () => client.query(`UPDATE sale SET status = 'POSTED' WHERE id = $1`, [sale.id]);
    await expectPgError(client, post, checkViolation('sale_payment_split'));
    await client.query('UPDATE sale SET paid_card = 60 WHERE id = $1', [sale.id]);
    await expect(post()).resolves.toMatchObject({ rowCount: 1 });
  });
});

describe('partial unique indexes (database §5)', () => {
  it('stock_count_one_open_per_warehouse allows only one DRAFT count per warehouse', async () => {
    await insert(client, 'stock_count', build.stockCount({ status: 'DRAFT' }));
    await expectPgError(
      client,
      () => insert(client, 'stock_count', build.stockCount({ status: 'DRAFT' })),
      { code: '23505', constraint: 'stock_count_one_open_per_warehouse' },
    );
    // Closed counts in the same warehouse and drafts in another one are fine.
    await insert(client, 'stock_count', build.stockCount({ status: 'POSTED' }));
    await insert(client, 'stock_count', build.stockCount({ status: 'CANCELLED' }));
    const other = await insert(client, 'warehouse', build.warehouse());
    await expect(
      insert(client, 'stock_count', build.stockCount({ status: 'DRAFT', warehouse_id: other.id })),
    ).resolves.toBeDefined();
  });

  it('user_single_owner allows only one OWNER per organization', async () => {
    await insert(client, 'user', build.user({ role: 'OWNER' }));
    await expectPgError(client, () => insert(client, 'user', build.user({ role: 'OWNER' })), {
      code: '23505',
      constraint: 'user_single_owner',
    });
    // Any number of STAFF, and another organization's OWNER, are fine.
    await insert(client, 'user', build.user({ role: 'STAFF' }));
    const org = await insert(client, 'organization', build.organization());
    await expect(
      insert(client, 'user', build.user({ role: 'OWNER', organization_id: org.id })),
    ).resolves.toBeDefined();
  });
});

describe('append-only journals (BR-12)', () => {
  const journals: Array<{ table: string; row: () => Row }> = [
    { table: 'audit_log', row: () => build.auditLog() },
    { table: 'stock_movement', row: () => build.stockMovement() },
    { table: 'cash_transaction', row: () => build.cashTransaction() },
  ];

  it.each(journals)(
    '$table accepts INSERT but rejects UPDATE and DELETE',
    async ({ table, row }) => {
      const inserted = await insert(client, table, row());
      const appendOnly = { code: 'P0001', message: `${table} is append-only` };

      await expectPgError(
        client,
        () => client.query(`UPDATE "${table}" SET created_at = now() WHERE id = $1`, [inserted.id]),
        appendOnly,
      );
      await expectPgError(
        client,
        () => client.query(`DELETE FROM "${table}" WHERE id = $1`, [inserted.id]),
        appendOnly,
      );
      const { rowCount } = await client.query(`SELECT 1 FROM "${table}" WHERE id = $1`, [
        inserted.id,
      ]);
      expect(rowCount).toBe(1);
    },
  );
});

describe('product name search (pg_trgm)', () => {
  it('has the extension and uses product_name_trgm for substring search', async () => {
    const ext = await client.query(`SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'`);
    expect(ext.rowCount).toBe(1);

    await client.query('SET LOCAL enable_seqscan = off');
    const plan = await client.query<{ 'QUERY PLAN': string }>(
      `EXPLAIN SELECT id FROM product WHERE lower(name) LIKE '%cola%'`,
    );
    expect(plan.rows.map((r) => r['QUERY PLAN']).join('\n')).toContain('product_name_trgm');

    const found = await client.query(`SELECT id FROM product WHERE lower(name) LIKE $1`, [
      '%coca%',
    ]);
    expect(found.rows).toEqual([{ id: f.productId }]);
  });
});
