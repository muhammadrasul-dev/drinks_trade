import { type Queryable, queryRows } from './client';

// Stock and cash invariants (database.md §6.2, §6.5; business-logic §1.3, §7).
// Sums are compared as text so BIGINT/NUMERIC never pass through JS numbers.

/** stock_balance.qty = Σ stock_movement.qty_delta per (sub-warehouse, product). */
const STOCK_BALANCE_SQL = `
  SELECT sub_warehouse_id::text AS "subWarehouseId", product_id::text AS "productId",
         COALESCE(b.qty, 0)::text AS "balance", COALESCE(m.total, 0)::text AS "movements"
    FROM stock_balance b
    FULL JOIN (SELECT sub_warehouse_id, product_id, SUM(qty_delta) AS total
                 FROM stock_movement GROUP BY sub_warehouse_id, product_id) m
   USING (sub_warehouse_id, product_id)
   WHERE COALESCE(b.qty, 0) <> COALESCE(m.total, 0)
   ORDER BY 1, 2`;

/** product_cost.total_qty = Σ stock_balance.qty over the store's sub-warehouses. */
const PRODUCT_COST_SQL = `
  SELECT store_id::text AS "storeId", product_id::text AS "productId",
         COALESCE(c.total_qty, 0)::text AS "totalQty", COALESCE(b.total, 0)::text AS "balances"
    FROM product_cost c
    FULL JOIN (SELECT w.store_id, sb.product_id, SUM(sb.qty) AS total
                 FROM stock_balance sb
                 JOIN sub_warehouse s ON s.id = sb.sub_warehouse_id
                 JOIN warehouse w ON w.id = s.warehouse_id
                GROUP BY w.store_id, sb.product_id) b
   USING (store_id, product_id)
   WHERE COALESCE(c.total_qty, 0) <> COALESCE(b.total, 0)
   ORDER BY 1, 2`;

/** cashbox.balance = Σ IN − Σ OUT of its cash_transaction rows. */
const CASHBOX_SQL = `
  SELECT c.id::text AS "cashboxId", c.balance::text AS "balance",
         COALESCE(t.total, 0)::text AS "transactions"
    FROM cashbox c
    LEFT JOIN (SELECT cashbox_id,
                      SUM(CASE direction WHEN 'IN' THEN amount ELSE -amount END) AS total
                 FROM cash_transaction GROUP BY cashbox_id) t
      ON t.cashbox_id = c.id
   WHERE c.balance <> COALESCE(t.total, 0)
   ORDER BY 1`;

export interface InvariantViolations {
  stockBalance: { subWarehouseId: string; productId: string; balance: string; movements: string }[];
  productCost: { storeId: string; productId: string; totalQty: string; balances: string }[];
  cashbox: { cashboxId: string; balance: string; transactions: string }[];
}

/** Rows breaking each invariant; all arrays are empty when the data is consistent. */
export async function findInvariantViolations(db: Queryable): Promise<InvariantViolations> {
  return {
    stockBalance: await queryRows(db, STOCK_BALANCE_SQL),
    productCost: await queryRows(db, PRODUCT_COST_SQL),
    cashbox: await queryRows(db, CASHBOX_SQL),
  };
}

/**
 * Throws if any stock or cash invariant is broken anywhere in the database.
 * Call it at the end of every integration test that changes stock or cash
 * (pass the transaction client when the test runs inside one).
 */
export async function assertInvariants(db: Queryable): Promise<void> {
  const violations = await findInvariantViolations(db);
  const broken = Object.entries(violations).filter(([, rows]) => rows.length > 0);
  if (broken.length > 0) {
    throw new Error(
      `Invariant violations: ${broken.map(([name]) => name).join(', ')}\n` +
        JSON.stringify(Object.fromEntries(broken), null, 2),
    );
  }
}
