-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'STAFF');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('uz', 'ru');

-- CreateEnum
CREATE TYPE "DocStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "StockCountStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QtyUnit" AS ENUM ('PIECE', 'BLOCK');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('PURCHASE', 'PURCHASE_REVERSAL', 'SALE', 'SALE_REVERSAL', 'COUNT_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "CashboxType" AS ENUM ('CASH', 'CARD');

-- CreateEnum
CREATE TYPE "CashDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "CashTxType" AS ENUM ('SALE_RECEIPT', 'SALE_REFUND', 'PURCHASE_PAYMENT', 'PURCHASE_REFUND', 'DEBT_TAKEN', 'DEBT_GIVEN', 'DEBT_REPAID_BY_ME', 'DEBT_REPAID_TO_ME', 'TRAVEL_EXPENSE', 'OTHER_EXPENSE', 'TRANSFER_OUT', 'TRANSFER_IN', 'MANUAL_REVERSAL');

-- CreateEnum
CREATE TYPE "DebtDirection" AS ENUM ('RECEIVABLE', 'PAYABLE');

-- CreateEnum
CREATE TYPE "DebtSource" AS ENUM ('MANUAL', 'SALE', 'PURCHASE');

-- CreateEnum
CREATE TYPE "DebtStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('SALE', 'PURCHASE', 'STOCK_COUNT');

-- CreateTable
CREATE TABLE "organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Tashkent',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "locale" "Locale" NOT NULL DEFAULT 'uz',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "password_changed_at" TIMESTAMPTZ,
    "created_by_id" UUID,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "archived_at" TIMESTAMPTZ,

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "archived_at" TIMESTAMPTZ,

    CONSTRAINT "brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "barcode" TEXT,
    "category_id" UUID,
    "brand_id" UUID,
    "units_per_block" INTEGER NOT NULL,
    "sale_price" BIGINT NOT NULL,
    "min_stock" INTEGER NOT NULL DEFAULT 0,
    "expiry_date" DATE,
    "image_path" TEXT,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_warehouse" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sub_warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balance" (
    "sub_warehouse_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "stock_balance_pkey" PRIMARY KEY ("sub_warehouse_id","product_id")
);

-- CreateTable
CREATE TABLE "product_cost" (
    "store_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "total_qty" INTEGER NOT NULL DEFAULT 0,
    "avg_cost" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "product_cost_pkey" PRIMARY KEY ("store_id","product_id")
);

-- CreateTable
CREATE TABLE "stock_movement" (
    "id" BIGSERIAL NOT NULL,
    "store_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sub_warehouse_id" UUID NOT NULL,
    "type" "MovementType" NOT NULL,
    "qty_delta" INTEGER NOT NULL,
    "unit_cost" DECIMAL(20,4) NOT NULL,
    "cost_amount" BIGINT NOT NULL,
    "avg_cost_before" DECIMAL(20,4) NOT NULL,
    "avg_cost_after" DECIMAL(20,4) NOT NULL,
    "doc_date" TIMESTAMPTZ NOT NULL,
    "sale_line_id" UUID,
    "purchase_line_id" UUID,
    "stock_count_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "doc_date" TIMESTAMPTZ NOT NULL,
    "status" "DocStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "total_amount" BIGINT NOT NULL DEFAULT 0,
    "paid_cash" BIGINT NOT NULL DEFAULT 0,
    "paid_card" BIGINT NOT NULL DEFAULT 0,
    "paid_credit" BIGINT NOT NULL DEFAULT 0,
    "cost_total" BIGINT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "posted_at" TIMESTAMPTZ,
    "posted_by_id" UUID,
    "reversed_at" TIMESTAMPTZ,
    "reversed_by_id" UUID,
    "reverse_reason" TEXT,

    CONSTRAINT "sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_line" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "product_id" UUID NOT NULL,
    "sub_warehouse_id" UUID NOT NULL,
    "qty" INTEGER NOT NULL,
    "input_unit" "QtyUnit" NOT NULL,
    "input_qty" INTEGER NOT NULL,
    "unit_price" BIGINT NOT NULL,
    "line_total" BIGINT NOT NULL,
    "unit_cost" DECIMAL(20,4),
    "cost_amount" BIGINT,

    CONSTRAINT "sale_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "doc_date" TIMESTAMPTZ NOT NULL,
    "status" "DocStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "total_amount" BIGINT NOT NULL DEFAULT 0,
    "paid_cash" BIGINT NOT NULL DEFAULT 0,
    "paid_card" BIGINT NOT NULL DEFAULT 0,
    "paid_credit" BIGINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "posted_at" TIMESTAMPTZ,
    "posted_by_id" UUID,
    "reversed_at" TIMESTAMPTZ,
    "reversed_by_id" UUID,
    "reverse_reason" TEXT,

    CONSTRAINT "purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_line" (
    "id" UUID NOT NULL,
    "purchase_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "product_id" UUID NOT NULL,
    "sub_warehouse_id" UUID NOT NULL,
    "qty" INTEGER NOT NULL,
    "input_unit" "QtyUnit" NOT NULL,
    "input_qty" INTEGER NOT NULL,
    "input_price" BIGINT NOT NULL,
    "line_total" BIGINT NOT NULL,
    "unit_cost" DECIMAL(20,4) NOT NULL,

    CONSTRAINT "purchase_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "doc_date" TIMESTAMPTZ NOT NULL,
    "status" "StockCountStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "shortage_amount" BIGINT,
    "surplus_amount" BIGINT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "posted_at" TIMESTAMPTZ,
    "posted_by_id" UUID,
    "cancelled_at" TIMESTAMPTZ,
    "cancelled_by_id" UUID,

    CONSTRAINT "stock_count_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count_line" (
    "id" UUID NOT NULL,
    "stock_count_id" UUID NOT NULL,
    "sub_warehouse_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "counted_qty" INTEGER NOT NULL,
    "system_qty" INTEGER,

    CONSTRAINT "stock_count_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count_result" (
    "id" UUID NOT NULL,
    "stock_count_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "system_qty" INTEGER NOT NULL,
    "counted_qty" INTEGER NOT NULL,
    "diff_qty" INTEGER NOT NULL,
    "avg_cost" DECIMAL(20,4) NOT NULL,
    "amount" BIGINT NOT NULL,

    CONSTRAINT "stock_count_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashbox" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "type" "CashboxType" NOT NULL,
    "name" TEXT NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "cashbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_transaction" (
    "id" BIGSERIAL NOT NULL,
    "store_id" UUID NOT NULL,
    "cashbox_id" UUID NOT NULL,
    "direction" "CashDirection" NOT NULL,
    "type" "CashTxType" NOT NULL,
    "amount" BIGINT NOT NULL,
    "balance_after" BIGINT NOT NULL,
    "tx_date" TIMESTAMPTZ NOT NULL,
    "note" TEXT,
    "sale_id" UUID,
    "purchase_id" UUID,
    "debt_id" UUID,
    "transfer_group_id" UUID,
    "reversal_of_id" BIGINT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debt" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "direction" "DebtDirection" NOT NULL,
    "source" "DebtSource" NOT NULL,
    "amount" BIGINT NOT NULL,
    "repaid_amount" BIGINT NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL,
    "debt_date" TIMESTAMPTZ NOT NULL,
    "status" "DebtStatus" NOT NULL DEFAULT 'OPEN',
    "sale_id" UUID,
    "purchase_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "debt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debt_repayment" (
    "id" UUID NOT NULL,
    "debt_id" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "repaid_at" TIMESTAMPTZ NOT NULL,
    "cash_transaction_id" BIGINT NOT NULL,
    "note" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debt_repayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "store_id" UUID,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "meta" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_sequence" (
    "store_id" UUID NOT NULL,
    "doc_type" "DocType" NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "doc_sequence_pkey" PRIMARY KEY ("store_id","doc_type")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

-- CreateIndex
CREATE INDEX "session_user_id_idx" ON "session"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "category_organization_id_name_key" ON "category"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "brand_organization_id_name_key" ON "brand"("organization_id", "name");

-- CreateIndex
CREATE INDEX "product_organization_id_name_idx" ON "product"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "product_organization_id_sku_key" ON "product"("organization_id", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "product_organization_id_barcode_key" ON "product"("organization_id", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_store_id_name_key" ON "warehouse"("store_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "sub_warehouse_warehouse_id_name_key" ON "sub_warehouse"("warehouse_id", "name");

-- CreateIndex
CREATE INDEX "stock_balance_product_id_idx" ON "stock_balance"("product_id");

-- CreateIndex
CREATE INDEX "stock_movement_store_id_product_id_created_at_idx" ON "stock_movement"("store_id", "product_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movement_sub_warehouse_id_product_id_idx" ON "stock_movement"("sub_warehouse_id", "product_id");

-- CreateIndex
CREATE INDEX "sale_store_id_status_doc_date_idx" ON "sale"("store_id", "status", "doc_date");

-- CreateIndex
CREATE UNIQUE INDEX "sale_store_id_number_key" ON "sale"("store_id", "number");

-- CreateIndex
CREATE INDEX "sale_line_product_id_idx" ON "sale_line"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_line_sale_id_line_no_key" ON "sale_line"("sale_id", "line_no");

-- CreateIndex
CREATE INDEX "purchase_store_id_status_doc_date_idx" ON "purchase"("store_id", "status", "doc_date");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_store_id_number_key" ON "purchase"("store_id", "number");

-- CreateIndex
CREATE INDEX "purchase_line_product_id_idx" ON "purchase_line"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_line_purchase_id_line_no_key" ON "purchase_line"("purchase_id", "line_no");

-- CreateIndex
CREATE INDEX "stock_count_store_id_status_doc_date_idx" ON "stock_count"("store_id", "status", "doc_date");

-- CreateIndex
CREATE UNIQUE INDEX "stock_count_store_id_number_key" ON "stock_count"("store_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "stock_count_line_stock_count_id_sub_warehouse_id_product_id_key" ON "stock_count_line"("stock_count_id", "sub_warehouse_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_count_result_stock_count_id_product_id_key" ON "stock_count_result"("stock_count_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "cashbox_store_id_type_key" ON "cashbox"("store_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "cash_transaction_reversal_of_id_key" ON "cash_transaction"("reversal_of_id");

-- CreateIndex
CREATE INDEX "cash_transaction_store_id_type_tx_date_idx" ON "cash_transaction"("store_id", "type", "tx_date");

-- CreateIndex
CREATE INDEX "cash_transaction_cashbox_id_created_at_idx" ON "cash_transaction"("cashbox_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "debt_sale_id_key" ON "debt"("sale_id");

-- CreateIndex
CREATE UNIQUE INDEX "debt_purchase_id_key" ON "debt"("purchase_id");

-- CreateIndex
CREATE INDEX "debt_store_id_direction_status_idx" ON "debt"("store_id", "direction", "status");

-- CreateIndex
CREATE UNIQUE INDEX "debt_repayment_cash_transaction_id_key" ON "debt_repayment"("cash_transaction_id");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_store_id_created_at_idx" ON "audit_log"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_user_id_created_at_idx" ON "audit_log"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "store" ADD CONSTRAINT "store_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand" ADD CONSTRAINT "brand_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse" ADD CONSTRAINT "warehouse_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_warehouse" ADD CONSTRAINT "sub_warehouse_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balance" ADD CONSTRAINT "stock_balance_sub_warehouse_id_fkey" FOREIGN KEY ("sub_warehouse_id") REFERENCES "sub_warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balance" ADD CONSTRAINT "stock_balance_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_cost" ADD CONSTRAINT "product_cost_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_cost" ADD CONSTRAINT "product_cost_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_sub_warehouse_id_fkey" FOREIGN KEY ("sub_warehouse_id") REFERENCES "sub_warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_sale_line_id_fkey" FOREIGN KEY ("sale_line_id") REFERENCES "sale_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_purchase_line_id_fkey" FOREIGN KEY ("purchase_line_id") REFERENCES "purchase_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_stock_count_id_fkey" FOREIGN KEY ("stock_count_id") REFERENCES "stock_count"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale" ADD CONSTRAINT "sale_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale" ADD CONSTRAINT "sale_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale" ADD CONSTRAINT "sale_posted_by_id_fkey" FOREIGN KEY ("posted_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale" ADD CONSTRAINT "sale_reversed_by_id_fkey" FOREIGN KEY ("reversed_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_line" ADD CONSTRAINT "sale_line_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_line" ADD CONSTRAINT "sale_line_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_line" ADD CONSTRAINT "sale_line_sub_warehouse_id_fkey" FOREIGN KEY ("sub_warehouse_id") REFERENCES "sub_warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase" ADD CONSTRAINT "purchase_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase" ADD CONSTRAINT "purchase_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase" ADD CONSTRAINT "purchase_posted_by_id_fkey" FOREIGN KEY ("posted_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase" ADD CONSTRAINT "purchase_reversed_by_id_fkey" FOREIGN KEY ("reversed_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_line" ADD CONSTRAINT "purchase_line_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_line" ADD CONSTRAINT "purchase_line_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_line" ADD CONSTRAINT "purchase_line_sub_warehouse_id_fkey" FOREIGN KEY ("sub_warehouse_id") REFERENCES "sub_warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count" ADD CONSTRAINT "stock_count_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count" ADD CONSTRAINT "stock_count_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count" ADD CONSTRAINT "stock_count_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count" ADD CONSTRAINT "stock_count_posted_by_id_fkey" FOREIGN KEY ("posted_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count" ADD CONSTRAINT "stock_count_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_line" ADD CONSTRAINT "stock_count_line_stock_count_id_fkey" FOREIGN KEY ("stock_count_id") REFERENCES "stock_count"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_line" ADD CONSTRAINT "stock_count_line_sub_warehouse_id_fkey" FOREIGN KEY ("sub_warehouse_id") REFERENCES "sub_warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_line" ADD CONSTRAINT "stock_count_line_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_result" ADD CONSTRAINT "stock_count_result_stock_count_id_fkey" FOREIGN KEY ("stock_count_id") REFERENCES "stock_count"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_result" ADD CONSTRAINT "stock_count_result_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashbox" ADD CONSTRAINT "cashbox_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transaction" ADD CONSTRAINT "cash_transaction_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transaction" ADD CONSTRAINT "cash_transaction_cashbox_id_fkey" FOREIGN KEY ("cashbox_id") REFERENCES "cashbox"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transaction" ADD CONSTRAINT "cash_transaction_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transaction" ADD CONSTRAINT "cash_transaction_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transaction" ADD CONSTRAINT "cash_transaction_debt_id_fkey" FOREIGN KEY ("debt_id") REFERENCES "debt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transaction" ADD CONSTRAINT "cash_transaction_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "cash_transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transaction" ADD CONSTRAINT "cash_transaction_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt" ADD CONSTRAINT "debt_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt" ADD CONSTRAINT "debt_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt" ADD CONSTRAINT "debt_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt" ADD CONSTRAINT "debt_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_repayment" ADD CONSTRAINT "debt_repayment_debt_id_fkey" FOREIGN KEY ("debt_id") REFERENCES "debt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_repayment" ADD CONSTRAINT "debt_repayment_cash_transaction_id_fkey" FOREIGN KEY ("cash_transaction_id") REFERENCES "cash_transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_repayment" ADD CONSTRAINT "debt_repayment_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_sequence" ADD CONSTRAINT "doc_sequence_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
