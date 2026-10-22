-- Hand-written constraints that Prisma's schema language cannot express
-- (database.md §5): CHECKs, partial unique indexes, append-only triggers,
-- pg_trgm search index. Prisma ignores these when diffing, so they do not
-- show up as drift.

-- ───────────── Quantity / money / cost invariants ─────────────
ALTER TABLE stock_balance    ADD CONSTRAINT stock_balance_qty_nonneg     CHECK (qty >= 0);
ALTER TABLE product_cost     ADD CONSTRAINT product_cost_qty_nonneg      CHECK (total_qty >= 0);
ALTER TABLE product_cost     ADD CONSTRAINT product_cost_avg_nonneg      CHECK (avg_cost >= 0);
ALTER TABLE cashbox          ADD CONSTRAINT cashbox_balance_nonneg       CHECK (balance >= 0);
ALTER TABLE product          ADD CONSTRAINT product_units_per_block_pos  CHECK (units_per_block > 0);
ALTER TABLE product          ADD CONSTRAINT product_sale_price_nonneg    CHECK (sale_price >= 0);
ALTER TABLE product          ADD CONSTRAINT product_min_stock_nonneg     CHECK (min_stock >= 0);
ALTER TABLE sale_line        ADD CONSTRAINT sale_line_qty_pos            CHECK (qty > 0);
ALTER TABLE purchase_line    ADD CONSTRAINT purchase_line_qty_pos        CHECK (qty > 0);
ALTER TABLE stock_count_line ADD CONSTRAINT stock_count_line_qty_nonneg  CHECK (counted_qty >= 0);
ALTER TABLE stock_movement   ADD CONSTRAINT stock_movement_delta_nonzero CHECK (qty_delta <> 0);
ALTER TABLE cash_transaction ADD CONSTRAINT cash_tx_amount_pos           CHECK (amount > 0);
ALTER TABLE debt             ADD CONSTRAINT debt_amount_pos              CHECK (amount > 0);
ALTER TABLE debt             ADD CONSTRAINT debt_repaid_range            CHECK (repaid_amount BETWEEN 0 AND amount);
ALTER TABLE debt_repayment   ADD CONSTRAINT debt_repayment_amount_pos    CHECK (amount > 0);

-- BR-9: on a posted/reversed document the payment parts add up to the total
ALTER TABLE sale ADD CONSTRAINT sale_payment_split CHECK (
  status = 'DRAFT' OR (paid_cash + paid_card + paid_credit = total_amount)
);
ALTER TABLE sale ADD CONSTRAINT sale_payment_nonneg
  CHECK (paid_cash >= 0 AND paid_card >= 0 AND paid_credit >= 0);
ALTER TABLE purchase ADD CONSTRAINT purchase_payment_split CHECK (
  status = 'DRAFT' OR (paid_cash + paid_card + paid_credit = total_amount)
);
ALTER TABLE purchase ADD CONSTRAINT purchase_payment_nonneg
  CHECK (paid_cash >= 0 AND paid_card >= 0 AND paid_credit >= 0);

-- BR-9: "Other expense" requires a note
ALTER TABLE cash_transaction ADD CONSTRAINT cash_tx_other_note CHECK (
  type <> 'OTHER_EXPENSE' OR (note IS NOT NULL AND length(trim(note)) > 0)
);

-- ───────────── Partial unique indexes ─────────────
-- BR-8: at most one open (DRAFT) stock count per warehouse
CREATE UNIQUE INDEX stock_count_one_open_per_warehouse
  ON stock_count (warehouse_id) WHERE status = 'DRAFT';

-- OQ-10: exactly one OWNER per organization
CREATE UNIQUE INDEX user_single_owner ON "user" (organization_id) WHERE role = 'OWNER';
ALTER TABLE "user" ADD CONSTRAINT user_username_format CHECK (username ~ '^[a-z0-9._-]{3,32}$');

-- ───────────── Append-only journals (BR-12, ADR-013) ─────────────
-- Row-level triggers: TRUNCATE is not blocked (test cleanup relies on it).
CREATE OR REPLACE FUNCTION forbid_modify() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_modify();
CREATE TRIGGER stock_movement_append_only
  BEFORE UPDATE OR DELETE ON stock_movement
  FOR EACH ROW EXECUTE FUNCTION forbid_modify();
CREATE TRIGGER cash_transaction_append_only
  BEFORE UPDATE OR DELETE ON cash_transaction
  FOR EACH ROW EXECUTE FUNCTION forbid_modify();

-- ───────────── No future dates (OQ-07) ─────────────
-- The exact rule (date <= now in Asia/Tashkent) is enforced by the services.
-- The DB only keeps a coarse, timezone-independent guard with a 1-day margin.
ALTER TABLE sale             ADD CONSTRAINT sale_doc_date_not_future        CHECK (doc_date  <= now() + interval '1 day');
ALTER TABLE purchase         ADD CONSTRAINT purchase_doc_date_not_future    CHECK (doc_date  <= now() + interval '1 day');
ALTER TABLE stock_count      ADD CONSTRAINT stock_count_doc_date_not_future CHECK (doc_date  <= now() + interval '1 day');
ALTER TABLE cash_transaction ADD CONSTRAINT cash_tx_tx_date_not_future      CHECK (tx_date   <= now() + interval '1 day');
ALTER TABLE debt             ADD CONSTRAINT debt_debt_date_not_future       CHECK (debt_date <= now() + interval '1 day');
ALTER TABLE debt_repayment   ADD CONSTRAINT debt_repayment_date_not_future  CHECK (repaid_at <= now() + interval '1 day');

-- ───────────── Product search (case-insensitive name) ─────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX product_name_trgm ON product USING gin (lower(name) gin_trgm_ops);
