# Ma'lumotlar bazasi

Versiya: 0.1 (qoralama) · Sana: 2026-10-22 · DB: PostgreSQL 17 · ORM: Prisma
Bog'liq: [architecture.md](architecture.md) · [business-logic.md](business-logic.md) · [decisions.md](decisions.md)

---

## 1. Asosiy tamoyillar

| # | Tamoyil | Sabab |
|---|---|---|
| 1 | **Miqdor doim donada**, `INTEGER` | BR-1. Blok faqat ko'rinish |
| 2 | **Pul — `BIGINT`, butun so'm** | NFR "Pul". `INT` (2,1 mlrd) yirik davr summalariga yetmasligi mumkin |
| 3 | **O'rtacha tannarx — `NUMERIC(20,4)`** | Blok narxi / blokdagi dona kasr chiqaradi (60 000 / 12 = 5 000; 50 000 / 12 = 4 166,6667). Summaga aylanganda butun so'mga yaxlitlanadi (ROUND HALF UP) |
| 4 | **Joriy holat + jurnal** | `stock_balance` (joriy qoldiq) + `stock_movement` (o'zgarmas tarix). `cashbox.balance` + `cash_transaction`. Joriy holat jurnal bilan bitta tranzaksiyada yangilanadi |
| 5 | **Hech narsa o'chirilmaydi** (qoralamalardan tashqari) | Ma'lumotnomalar `archived_at` bilan arxivlanadi (FR-1.2, FR-2.2); hujjatlar storno qilinadi (BR-3) |
| 6 | **Invariantlar DB'da ham** | `CHECK (qty >= 0)`, `CHECK (balance >= 0)`, to'lov yig'indisi, bitta ochiq inventarizatsiya — kod xato qilsa ham DB ruxsat bermaydi |
| 7 | **Filialga tayyor** | `organization → store`; operatsion jadvallarda `store_id` |
| 8 | **ID** | Asosiy obyektlar — UUID v7 (vaqt bo'yicha tartiblangan, URL'da xavfsiz). Jurnallar (`stock_movement`, `cash_transaction`, `audit_log`) — `BIGINT` autoincrement |
| 9 | **Nomlash** | Jadval/ustun — `snake_case` (Prisma'da `@@map`/`@map`), kodda — `camelCase` |
| 10 | **Vaqt** | `timestamptz`, UTC saqlanadi; hisobot chegaralari `Asia/Tashkent` bo'yicha hisoblanadi |

## 2. Domenlar va jadvallar ro'yxati

| Domen | Jadvallar |
|---|---|
| Tashkilot | `organization`, `store` |
| Foydalanuvchi | `user`, `session` |
| Katalog | `category`, `brand`, `product` |
| Joylashuv | `warehouse`, `sub_warehouse` |
| Zaxira | `stock_balance`, `product_cost`, `stock_movement` |
| Savdo | `sale`, `sale_line` |
| Xarid | `purchase`, `purchase_line` |
| Inventarizatsiya | `stock_count`, `stock_count_line`, `stock_count_result` |
| Pul | `cashbox`, `cash_transaction` |
| Qarz | `debt`, `debt_repayment` |
| Tizim | `audit_log`, `doc_sequence` |

**Filial darajalari:**
- `organization` darajasi (umumiy): `user`, `category`, `brand`, `product`.
- `store` darajasi (filialga xos): qolgan hammasi (`warehouse`, hujjatlar, kassa, qarz, tannarx, audit).

## 3. ER diagramma

```mermaid
erDiagram
  organization ||--o{ store : has
  organization ||--o{ user : has
  organization ||--o{ product : has
  organization ||--o{ category : has
  organization ||--o{ brand : has
  category ||--o{ product : groups
  brand ||--o{ product : groups

  store ||--o{ warehouse : has
  warehouse ||--o{ sub_warehouse : has
  sub_warehouse ||--o{ stock_balance : holds
  product ||--o{ stock_balance : in
  store ||--o{ product_cost : has
  product ||--o{ product_cost : costed
  product ||--o{ stock_movement : moves
  sub_warehouse ||--o{ stock_movement : at

  store ||--o{ sale : has
  sale ||--|{ sale_line : contains
  sale_line }o--|| product : of
  sale_line }o--|| sub_warehouse : from

  store ||--o{ purchase : has
  purchase ||--|{ purchase_line : contains
  purchase_line }o--|| product : of
  purchase_line }o--|| sub_warehouse : to

  warehouse ||--o{ stock_count : counted
  stock_count ||--o{ stock_count_line : contains
  stock_count ||--o{ stock_count_result : summarizes

  store ||--|{ cashbox : has
  cashbox ||--o{ cash_transaction : records
  sale |o--o{ cash_transaction : pays
  purchase |o--o{ cash_transaction : pays

  store ||--o{ debt : has
  sale |o--o| debt : credit
  purchase |o--o| debt : credit
  debt ||--o{ debt_repayment : repaid
  debt_repayment ||--|| cash_transaction : via

  user ||--o{ session : has
  user ||--o{ audit_log : did
```

## 4. Prisma sxemasi (qoralama)

> Bu fayl `packages/db/prisma/schema.prisma` ning birinchi varianti. Prisma bilan ifodalab bo'lmaydigan cheklovlar (CHECK, partial unique index, trigger) §5 dagi qo'lda yoziladigan SQL migratsiyada.

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ───────────────────────── Enums ─────────────────────────

enum UserRole {
  OWNER // Egasi
  STAFF // Xodim
}

enum Locale {
  uz
  ru
}

enum DocStatus {
  DRAFT    // Qoralama
  POSTED   // Bajarilgan
  REVERSED // Storno qilingan
}

enum StockCountStatus {
  DRAFT     // Ochiq (omborni bloklaydi)
  POSTED    // Bajarilgan
  CANCELLED // Qoralama bekor qilingan
}

enum QtyUnit {
  PIECE // dona
  BLOCK // blok
}

enum MovementType {
  PURCHASE
  PURCHASE_REVERSAL
  SALE
  SALE_REVERSAL
  COUNT_ADJUSTMENT
}

enum CashboxType {
  CASH // Naqd
  CARD // Karta
}

enum CashDirection {
  IN
  OUT
}

enum CashTxType {
  SALE_RECEIPT        // Savdodan tushum (avto)          IN
  SALE_REFUND         // Savdo storno'si                 OUT
  PURCHASE_PAYMENT    // Xariddan to'lov (avto)          OUT
  PURCHASE_REFUND     // Xarid storno'si                 IN
  DEBT_TAKEN          // Qarz olish                      IN
  DEBT_GIVEN          // Qarz berish                     OUT
  DEBT_REPAID_BY_ME   // Olingan qarzni qaytarish        OUT
  DEBT_REPAID_TO_ME   // Berilgan qarz qaytdi            IN
  TRAVEL_EXPENSE      // Yo'l kira (P&L xarajat)         OUT
  OTHER_EXPENSE       // Boshqa chiqim (izoh majburiy)   OUT
  TRANSFER_OUT        // Kassalar orasida o'tkazma       OUT
  TRANSFER_IN         // Kassalar orasida o'tkazma       IN
  MANUAL_REVERSAL     // Qo'lda kiritilgan yozuv storno'si (OQ-08)
}

enum DebtDirection {
  RECEIVABLE // Menga qarz (debitor)
  PAYABLE    // Mendan qarz (kreditor)
}

enum DebtSource {
  MANUAL   // Kassa orqali qarz berish/olish
  SALE     // Nasiya savdo
  PURCHASE // Nasiya xarid
}

enum DebtStatus {
  OPEN
  CLOSED    // To'liq qaytarilgan
  CANCELLED // Manba hujjat storno qilingan
}

enum DocType {
  SALE
  PURCHASE
  STOCK_COUNT
}

// ───────────────────────── Tashkilot ─────────────────────────

model Organization {
  id        String   @id @default(uuid(7)) @db.Uuid
  name      String
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz

  stores     Store[]
  users      User[]
  products   Product[]
  categories Category[]
  brands     Brand[]

  @@map("organization")
}

model Store {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  name           String
  timezone       String   @default("Asia/Tashkent")
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz

  organization Organization @relation(fields: [organizationId], references: [id])
  warehouses   Warehouse[]
  cashboxes    Cashbox[]

  @@map("store")
}

// ───────────────────────── Foydalanuvchi ─────────────────────────

model User {
  id             String    @id @default(uuid(7)) @db.Uuid
  organizationId String    @map("organization_id") @db.Uuid
  username       String    @unique                      // kichik harfda, 3–32 belgi (OQ-10)
  passwordHash   String    @map("password_hash")
  fullName       String    @map("full_name")
  role           UserRole
  locale         Locale    @default(uz)
  isActive       Boolean   @default(true) @map("is_active")   // o'chirish o'rniga faolsizlantirish
  passwordChangedAt DateTime? @map("password_changed_at") @db.Timestamptz
  createdById    String?   @map("created_by_id") @db.Uuid    // xodimni qaysi Egasi yaratgan (seed uchun null)
  lastLoginAt    DateTime? @map("last_login_at") @db.Timestamptz
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  organization Organization @relation(fields: [organizationId], references: [id])
  sessions     Session[]

  @@map("user")
}

model Session {
  id        String   @id // token'ning SHA-256 hashi (tokenning o'zi faqat cookie'da)
  userId    String   @map("user_id") @db.Uuid
  expiresAt DateTime @map("expires_at") @db.Timestamptz
  ip        String?
  userAgent String?  @map("user_agent")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("session")
}

// ───────────────────────── Katalog ─────────────────────────

model Category {
  id             String    @id @default(uuid(7)) @db.Uuid
  organizationId String    @map("organization_id") @db.Uuid
  name           String
  archivedAt     DateTime? @map("archived_at") @db.Timestamptz

  organization Organization @relation(fields: [organizationId], references: [id])
  products     Product[]

  @@unique([organizationId, name])
  @@map("category")
}

model Brand {
  id             String    @id @default(uuid(7)) @db.Uuid
  organizationId String    @map("organization_id") @db.Uuid
  name           String
  archivedAt     DateTime? @map("archived_at") @db.Timestamptz

  organization Organization @relation(fields: [organizationId], references: [id])
  products     Product[]

  @@unique([organizationId, name])
  @@map("brand")
}

model Product {
  id             String    @id @default(uuid(7)) @db.Uuid
  organizationId String    @map("organization_id") @db.Uuid
  name           String
  sku            String?
  barcode        String?
  categoryId     String?   @map("category_id") @db.Uuid
  brandId        String?   @map("brand_id") @db.Uuid
  unitsPerBlock  Int       @map("units_per_block")          // blokdagi dona soni, > 0
  salePrice      BigInt    @map("sale_price")               // 1 dona sotuv narxi, so'm (OQ-05)
  minStock       Int       @default(0) @map("min_stock")    // donada, do'kon bo'yicha jami
  expiryDate     DateTime? @map("expiry_date") @db.Date     // faqat ma'lumot (FR-1.1)
  imagePath      String?   @map("image_path")
  archivedAt     DateTime? @map("archived_at") @db.Timestamptz
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  organization Organization @relation(fields: [organizationId], references: [id])
  category     Category?    @relation(fields: [categoryId], references: [id])
  brand        Brand?       @relation(fields: [brandId], references: [id])

  balances      StockBalance[]
  costs         ProductCost[]
  movements     StockMovement[]
  saleLines     SaleLine[]
  purchaseLines PurchaseLine[]

  @@unique([organizationId, sku])
  @@unique([organizationId, barcode])
  @@index([organizationId, name])
  @@map("product")
}

// ───────────────────────── Joylashuv ─────────────────────────

model Warehouse {
  id         String    @id @default(uuid(7)) @db.Uuid
  storeId    String    @map("store_id") @db.Uuid
  name       String
  archivedAt DateTime? @map("archived_at") @db.Timestamptz
  createdAt  DateTime  @default(now()) @map("created_at") @db.Timestamptz

  store         Store          @relation(fields: [storeId], references: [id])
  subWarehouses SubWarehouse[]
  stockCounts   StockCount[]

  @@unique([storeId, name])
  @@map("warehouse")
}

model SubWarehouse {
  id          String    @id @default(uuid(7)) @db.Uuid
  warehouseId String    @map("warehouse_id") @db.Uuid
  name        String
  archivedAt  DateTime? @map("archived_at") @db.Timestamptz
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz

  warehouse Warehouse       @relation(fields: [warehouseId], references: [id])
  balances  StockBalance[]
  movements StockMovement[]

  @@unique([warehouseId, name])
  @@map("sub_warehouse")
}

// ───────────────────────── Zaxira ─────────────────────────

/// Joriy qoldiq: (sub-ombor, mahsulot) → dona. Har doim stock_movement yig'indisiga teng.
model StockBalance {
  subWarehouseId String   @map("sub_warehouse_id") @db.Uuid
  productId      String   @map("product_id") @db.Uuid
  qty            Int      @default(0) // CHECK qty >= 0
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz

  subWarehouse SubWarehouse @relation(fields: [subWarehouseId], references: [id])
  product      Product      @relation(fields: [productId], references: [id])

  @@id([subWarehouseId, productId])
  @@index([productId])
  @@map("stock_balance")
}

/// O'rtacha tortilgan tannarx (BR-6): do'kon bo'yicha, barcha omborlar yig'indisida.
/// total_qty = shu do'kondagi barcha stock_balance.qty yig'indisi (denormalizatsiya, qulflash uchun qulay).
model ProductCost {
  storeId   String   @map("store_id") @db.Uuid
  productId String   @map("product_id") @db.Uuid
  totalQty  Int      @default(0) @map("total_qty")                      // CHECK >= 0
  avgCost   Decimal  @default(0) @map("avg_cost") @db.Decimal(20, 4)   // 1 dona tannarxi
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz

  product Product @relation(fields: [productId], references: [id])

  @@id([storeId, productId])
  @@map("product_cost")
}

/// O'zgarmas zaxira jurnali. Faqat INSERT.
model StockMovement {
  id             BigInt       @id @default(autoincrement())
  storeId        String       @map("store_id") @db.Uuid
  productId      String       @map("product_id") @db.Uuid
  subWarehouseId String       @map("sub_warehouse_id") @db.Uuid
  type           MovementType
  qtyDelta       Int          @map("qty_delta")                          // + kirim, − chiqim, ≠ 0
  unitCost       Decimal      @map("unit_cost") @db.Decimal(20, 4)
  costAmount     BigInt       @map("cost_amount")                        // ishorali, so'm
  avgCostBefore  Decimal      @map("avg_cost_before") @db.Decimal(20, 4)
  avgCostAfter   Decimal      @map("avg_cost_after") @db.Decimal(20, 4)
  docDate        DateTime     @map("doc_date") @db.Timestamptz           // hisobot uchun
  saleLineId     String?      @map("sale_line_id") @db.Uuid
  purchaseLineId String?      @map("purchase_line_id") @db.Uuid
  stockCountId   String?      @map("stock_count_id") @db.Uuid
  createdById    String       @map("created_by_id") @db.Uuid
  createdAt      DateTime     @default(now()) @map("created_at") @db.Timestamptz // bajarilgan vaqt (BR-6 tartibi)

  product      Product      @relation(fields: [productId], references: [id])
  subWarehouse SubWarehouse @relation(fields: [subWarehouseId], references: [id])

  @@index([storeId, productId, createdAt])
  @@index([subWarehouseId, productId])
  @@map("stock_movement")
}

// ───────────────────────── Savdo ─────────────────────────

model Sale {
  id            String    @id @default(uuid(7)) @db.Uuid
  storeId       String    @map("store_id") @db.Uuid
  number        String                                   // "S-000123"
  docDate       DateTime  @map("doc_date") @db.Timestamptz
  status        DocStatus @default(DRAFT)
  note          String?
  totalAmount   BigInt    @default(0) @map("total_amount")
  paidCash      BigInt    @default(0) @map("paid_cash")
  paidCard      BigInt    @default(0) @map("paid_card")
  paidCredit    BigInt    @default(0) @map("paid_credit") // nasiya
  costTotal     BigInt?   @map("cost_total")              // bajarishda to'ldiriladi
  version       Int       @default(0)
  createdById   String    @map("created_by_id") @db.Uuid
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt     DateTime  @updatedAt @map("updated_at") @db.Timestamptz
  postedAt      DateTime? @map("posted_at") @db.Timestamptz
  postedById    String?   @map("posted_by_id") @db.Uuid
  reversedAt    DateTime? @map("reversed_at") @db.Timestamptz
  reversedById  String?   @map("reversed_by_id") @db.Uuid
  reverseReason String?   @map("reverse_reason")

  lines SaleLine[]

  @@unique([storeId, number])
  @@index([storeId, status, docDate])
  @@map("sale")
}

model SaleLine {
  id             String   @id @default(uuid(7)) @db.Uuid
  saleId         String   @map("sale_id") @db.Uuid
  lineNo         Int      @map("line_no")
  productId      String   @map("product_id") @db.Uuid
  subWarehouseId String   @map("sub_warehouse_id") @db.Uuid
  qty            Int                                   // donada, > 0
  inputUnit      QtyUnit  @map("input_unit")           // foydalanuvchi qanday kiritgan
  inputQty       Int      @map("input_qty")
  unitPrice      BigInt   @map("unit_price")           // 1 dona narxi (mahsulotdan nusxa)
  lineTotal      BigInt   @map("line_total")           // qty × unit_price
  unitCost       Decimal? @map("unit_cost") @db.Decimal(20, 4) // bajarishda muzlatiladi (BR-6)
  costAmount     BigInt?  @map("cost_amount")                  // round(qty × unit_cost)

  sale         Sale         @relation(fields: [saleId], references: [id], onDelete: Cascade)
  product      Product      @relation(fields: [productId], references: [id])
  subWarehouse SubWarehouse @relation(fields: [subWarehouseId], references: [id])

  @@unique([saleId, lineNo])
  @@index([productId])
  @@map("sale_line")
}

// ───────────────────────── Xarid ─────────────────────────

model Purchase {
  id            String    @id @default(uuid(7)) @db.Uuid
  storeId       String    @map("store_id") @db.Uuid
  number        String                                   // "P-000045"
  docDate       DateTime  @map("doc_date") @db.Timestamptz
  status        DocStatus @default(DRAFT)
  note          String?
  totalAmount   BigInt    @default(0) @map("total_amount")
  paidCash      BigInt    @default(0) @map("paid_cash")
  paidCard      BigInt    @default(0) @map("paid_card")
  paidCredit    BigInt    @default(0) @map("paid_credit")
  version       Int       @default(0)
  createdById   String    @map("created_by_id") @db.Uuid
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt     DateTime  @updatedAt @map("updated_at") @db.Timestamptz
  postedAt      DateTime? @map("posted_at") @db.Timestamptz
  postedById    String?   @map("posted_by_id") @db.Uuid
  reversedAt    DateTime? @map("reversed_at") @db.Timestamptz
  reversedById  String?   @map("reversed_by_id") @db.Uuid
  reverseReason String?   @map("reverse_reason")

  lines PurchaseLine[]

  @@unique([storeId, number])
  @@index([storeId, status, docDate])
  @@map("purchase")
}

model PurchaseLine {
  id             String  @id @default(uuid(7)) @db.Uuid
  purchaseId     String  @map("purchase_id") @db.Uuid
  lineNo         Int     @map("line_no")
  productId      String  @map("product_id") @db.Uuid
  subWarehouseId String  @map("sub_warehouse_id") @db.Uuid
  qty            Int                                    // donada, > 0
  inputUnit      QtyUnit @map("input_unit")
  inputQty       Int     @map("input_qty")
  inputPrice     BigInt  @map("input_price")            // kiritilgan birlik (dona yoki blok) narxi
  lineTotal      BigInt  @map("line_total")             // input_qty × input_price
  unitCost       Decimal @map("unit_cost") @db.Decimal(20, 4) // line_total / qty

  purchase     Purchase     @relation(fields: [purchaseId], references: [id], onDelete: Cascade)
  product      Product      @relation(fields: [productId], references: [id])
  subWarehouse SubWarehouse @relation(fields: [subWarehouseId], references: [id])

  @@unique([purchaseId, lineNo])
  @@index([productId])
  @@map("purchase_line")
}

// ───────────────────────── Inventarizatsiya ─────────────────────────

model StockCount {
  id             String           @id @default(uuid(7)) @db.Uuid
  storeId        String           @map("store_id") @db.Uuid
  warehouseId    String           @map("warehouse_id") @db.Uuid
  number         String                                    // "I-000007"
  docDate        DateTime         @map("doc_date") @db.Timestamptz
  status         StockCountStatus @default(DRAFT)
  note           String?
  shortageAmount BigInt?          @map("shortage_amount")  // bajarishda: kamomad summasi (musbat)
  surplusAmount  BigInt?          @map("surplus_amount")   // bajarishda: ortiqcha summasi (musbat)
  version        Int              @default(0)
  createdById    String           @map("created_by_id") @db.Uuid
  createdAt      DateTime         @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime         @updatedAt @map("updated_at") @db.Timestamptz
  postedAt       DateTime?        @map("posted_at") @db.Timestamptz
  postedById     String?          @map("posted_by_id") @db.Uuid
  cancelledAt    DateTime?        @map("cancelled_at") @db.Timestamptz
  cancelledById  String?          @map("cancelled_by_id") @db.Uuid

  warehouse Warehouse          @relation(fields: [warehouseId], references: [id])
  lines     StockCountLine[]
  results   StockCountResult[]

  // + partial unique index: bitta omborda faqat bitta DRAFT (SQL, §5)
  @@unique([storeId, number])
  @@index([storeId, status, docDate])
  @@map("stock_count")
}

/// Sanoq qatori: (sub-ombor, mahsulot) bo'yicha haqiqiy qoldiq.
model StockCountLine {
  id             String @id @default(uuid(7)) @db.Uuid
  stockCountId   String @map("stock_count_id") @db.Uuid
  subWarehouseId String @map("sub_warehouse_id") @db.Uuid
  productId      String @map("product_id") @db.Uuid
  countedQty     Int    @map("counted_qty")            // donada, >= 0
  systemQty      Int?   @map("system_qty")             // bajarish paytidagi tizim qoldig'i (snapshot)

  stockCount StockCount @relation(fields: [stockCountId], references: [id], onDelete: Cascade)

  @@unique([stockCountId, subWarehouseId, productId])
  @@map("stock_count_line")
}

/// Bajarish natijasi: mahsulot bo'yicha OMBOR JAMI farqi (BR-8). P&L shu jadvaldan o'qiydi.
model StockCountResult {
  id           String  @id @default(uuid(7)) @db.Uuid
  stockCountId String  @map("stock_count_id") @db.Uuid
  productId    String  @map("product_id") @db.Uuid
  systemQty    Int     @map("system_qty")
  countedQty   Int     @map("counted_qty")
  diffQty      Int     @map("diff_qty")                      // counted − system
  avgCost      Decimal @map("avg_cost") @db.Decimal(20, 4)
  amount       BigInt                                        // round(diff × avg): − kamomad, + ortiqcha

  stockCount StockCount @relation(fields: [stockCountId], references: [id], onDelete: Cascade)

  @@unique([stockCountId, productId])
  @@map("stock_count_result")
}

// ───────────────────────── Kassa ─────────────────────────

model Cashbox {
  id        String      @id @default(uuid(7)) @db.Uuid
  storeId   String      @map("store_id") @db.Uuid
  type      CashboxType
  name      String
  balance   BigInt      @default(0)   // CHECK balance >= 0
  updatedAt DateTime    @updatedAt @map("updated_at") @db.Timestamptz

  store        Store             @relation(fields: [storeId], references: [id])
  transactions CashTransaction[]

  @@unique([storeId, type])
  @@map("cashbox")
}

/// O'zgarmas kassa jurnali. Faqat INSERT.
model CashTransaction {
  id              BigInt        @id @default(autoincrement())
  storeId         String        @map("store_id") @db.Uuid
  cashboxId       String        @map("cashbox_id") @db.Uuid
  direction       CashDirection
  type            CashTxType
  amount          BigInt                                         // > 0
  balanceAfter    BigInt        @map("balance_after")            // audit va tekshiruv uchun
  txDate          DateTime      @map("tx_date") @db.Timestamptz  // hisobot sanasi
  note            String?                                        // OTHER_EXPENSE da majburiy
  saleId          String?       @map("sale_id") @db.Uuid
  purchaseId      String?       @map("purchase_id") @db.Uuid
  debtId          String?       @map("debt_id") @db.Uuid
  transferGroupId String?       @map("transfer_group_id") @db.Uuid // o'tkazmaning ikki tomoni
  reversalOfId    BigInt?       @unique @map("reversal_of_id")     // qo'lda yozuv storno'si (OQ-08)
  createdById     String        @map("created_by_id") @db.Uuid
  createdAt       DateTime      @default(now()) @map("created_at") @db.Timestamptz

  cashbox Cashbox @relation(fields: [cashboxId], references: [id])

  @@index([storeId, type, txDate])
  @@index([cashboxId, createdAt])
  @@map("cash_transaction")
}

// ───────────────────────── Qarz ─────────────────────────

model Debt {
  id           String        @id @default(uuid(7)) @db.Uuid
  storeId      String        @map("store_id") @db.Uuid
  direction    DebtDirection
  source       DebtSource
  amount       BigInt                                   // > 0
  repaidAmount BigInt        @default(0) @map("repaid_amount") // 0..amount
  note         String                                   // BR-10: kontragent o'rniga izoh
  debtDate     DateTime      @map("debt_date") @db.Timestamptz
  status       DebtStatus    @default(OPEN)
  saleId       String?       @unique @map("sale_id") @db.Uuid
  purchaseId   String?       @unique @map("purchase_id") @db.Uuid
  createdById  String        @map("created_by_id") @db.Uuid
  createdAt    DateTime      @default(now()) @map("created_at") @db.Timestamptz
  updatedAt    DateTime      @updatedAt @map("updated_at") @db.Timestamptz

  repayments DebtRepayment[]

  @@index([storeId, direction, status])
  @@map("debt")
}

model DebtRepayment {
  id                String   @id @default(uuid(7)) @db.Uuid
  debtId            String   @map("debt_id") @db.Uuid
  amount            BigInt                                   // > 0
  repaidAt          DateTime @map("repaid_at") @db.Timestamptz
  cashTransactionId BigInt   @unique @map("cash_transaction_id")
  note              String?
  createdById       String   @map("created_by_id") @db.Uuid
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz

  debt Debt @relation(fields: [debtId], references: [id])

  @@map("debt_repayment")
}

// ───────────────────────── Tizim ─────────────────────────

/// BR-12: o'zgarmas. UPDATE/DELETE trigger bilan taqiqlangan.
model AuditLog {
  id         BigInt   @id @default(autoincrement())
  storeId    String?  @map("store_id") @db.Uuid
  userId     String?  @map("user_id") @db.Uuid   // tizim amallari uchun null
  action     String                              // CREATE | UPDATE | DELETE | POST | REVERSE | CANCEL | ARCHIVE | LOGIN | LOGIN_FAILED | ...
  entityType String   @map("entity_type")        // "sale", "product", ...
  entityId   String   @map("entity_id")
  before     Json?
  after      Json?
  meta       Json?                               // { backdated: true, requestId, ip }
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz

  @@index([entityType, entityId])
  @@index([storeId, createdAt])
  @@index([userId, createdAt])
  @@map("audit_log")
}

/// Hujjat raqamlari ketma-ketligi: do'kon + hujjat turi bo'yicha.
model DocSequence {
  storeId    String  @map("store_id") @db.Uuid
  docType    DocType @map("doc_type")
  lastNumber Int     @default(0) @map("last_number")

  @@id([storeId, docType])
  @@map("doc_sequence")
}
```

> Eslatma: aniqlik uchun `createdById`, `postedById` kabi maydonlarda `User` relation'lari qisqartirilgan; haqiqiy sxemada `@relation("SaleCreatedBy", ...)` ko'rinishida qo'shiladi.

## 5. Qo'lda yoziladigan SQL migratsiya

Prisma'da ifodalab bo'lmaydi; birinchi migratsiyadan keyin `migrations/<ts>_constraints/migration.sql` sifatida qo'shiladi.

```sql
-- Miqdor va pul invariantlari
ALTER TABLE stock_balance   ADD CONSTRAINT stock_balance_qty_nonneg   CHECK (qty >= 0);
ALTER TABLE product_cost    ADD CONSTRAINT product_cost_qty_nonneg    CHECK (total_qty >= 0);
ALTER TABLE product_cost    ADD CONSTRAINT product_cost_avg_nonneg    CHECK (avg_cost >= 0);
ALTER TABLE cashbox         ADD CONSTRAINT cashbox_balance_nonneg     CHECK (balance >= 0);
ALTER TABLE product         ADD CONSTRAINT product_units_per_block_pos CHECK (units_per_block > 0);
ALTER TABLE product         ADD CONSTRAINT product_sale_price_nonneg  CHECK (sale_price >= 0);
ALTER TABLE product         ADD CONSTRAINT product_min_stock_nonneg   CHECK (min_stock >= 0);
ALTER TABLE sale_line       ADD CONSTRAINT sale_line_qty_pos          CHECK (qty > 0);
ALTER TABLE purchase_line   ADD CONSTRAINT purchase_line_qty_pos      CHECK (qty > 0);
ALTER TABLE stock_count_line ADD CONSTRAINT stock_count_line_qty_nonneg CHECK (counted_qty >= 0);
ALTER TABLE stock_movement  ADD CONSTRAINT stock_movement_delta_nonzero CHECK (qty_delta <> 0);
ALTER TABLE cash_transaction ADD CONSTRAINT cash_tx_amount_pos        CHECK (amount > 0);
ALTER TABLE debt            ADD CONSTRAINT debt_amount_pos            CHECK (amount > 0);
ALTER TABLE debt            ADD CONSTRAINT debt_repaid_range          CHECK (repaid_amount BETWEEN 0 AND amount);
ALTER TABLE debt_repayment  ADD CONSTRAINT debt_repayment_amount_pos  CHECK (amount > 0);

-- BR-9: bajarilgan hujjatda to'lov qismlari yig'indisi = summa
ALTER TABLE sale ADD CONSTRAINT sale_payment_split CHECK (
  status = 'DRAFT' OR (paid_cash + paid_card + paid_credit = total_amount)
);
ALTER TABLE sale ADD CONSTRAINT sale_payment_nonneg CHECK (paid_cash >= 0 AND paid_card >= 0 AND paid_credit >= 0);
ALTER TABLE purchase ADD CONSTRAINT purchase_payment_split CHECK (
  status = 'DRAFT' OR (paid_cash + paid_card + paid_credit = total_amount)
);
ALTER TABLE purchase ADD CONSTRAINT purchase_payment_nonneg CHECK (paid_cash >= 0 AND paid_card >= 0 AND paid_credit >= 0);

-- BR-9: "Boshqa chiqim"da izoh majburiy
ALTER TABLE cash_transaction ADD CONSTRAINT cash_tx_other_note CHECK (
  type <> 'OTHER_EXPENSE' OR (note IS NOT NULL AND length(trim(note)) > 0)
);

-- BR-8: bir omborda bir vaqtda faqat bitta ochiq inventarizatsiya
CREATE UNIQUE INDEX stock_count_one_open_per_warehouse
  ON stock_count (warehouse_id) WHERE status = 'DRAFT';

-- BR-12: audit log o'zgartirilmaydi va o'chirilmaydi
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

-- OQ-10: tizimda bitta OWNER
CREATE UNIQUE INDEX user_single_owner ON "user" (organization_id) WHERE role = 'OWNER';
ALTER TABLE "user" ADD CONSTRAINT user_username_format CHECK (username ~ '^[a-z0-9._-]{3,32}$');

-- OQ-07: kelajak sana taqiqi asosan servisda tekshiriladi (vaqt zonasi tufayli),
-- DB'da faqat qo'pol himoya (1 kun zaxira bilan):
ALTER TABLE sale     ADD CONSTRAINT sale_doc_date_not_future     CHECK (doc_date <= now() + interval '1 day');
ALTER TABLE purchase ADD CONSTRAINT purchase_doc_date_not_future CHECK (doc_date <= now() + interval '1 day');

-- Mahsulot qidiruvi (nom bo'yicha, katta-kichik harfsiz)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX product_name_trgm ON product USING gin (lower(name) gin_trgm_ops);
```

## 6. Jadvallar bo'yicha izohlar

### 6.1 `product`
- `sale_price` — **1 dona** narxi. Blok narxi = `sale_price × units_per_block` (optom farqi yo'q, BR-2).
- `units_per_block` ni Egasi ham, Xodim ham o'zgartira oladi (OQ-06). UI ogohlantirish oynasi chiqaradi, o'zgarish audit'ga yoziladi. Qoldiq donada saqlangani uchun tarix buzilmaydi, faqat blok ko'rinishi qayta hisoblanadi. Bajarilgan hujjat qatorlari (`qty` donada) o'zgarmaydi. Blokda kiritilgan **qoralama** qatorlari bajarishda tekshiriladi ([business-logic.md §4.2](business-logic.md)).
- `sku`, `barcode` ixtiyoriy, lekin to'ldirilsa — tashkilot bo'yicha yagona.
- Arxivlangan mahsulot yangi hujjatlarda tanlanmaydi, eski hujjat/hisobotlarda ko'rinadi.

### 6.2 `stock_balance` va `product_cost`
- Mahsulot birinchi marta sub-omborga kirganda qator yaratiladi (`INSERT ... ON CONFLICT DO NOTHING`, keyin `FOR UPDATE`).
- Invariant (test bilan tekshiriladi): `stock_balance.qty = Σ stock_movement.qty_delta` va `product_cost.total_qty = Σ stock_balance.qty (do'kon bo'yicha)`.
- Sub-ombor arxivlash: faqat undagi barcha `qty = 0` bo'lsa (FR-2.2). Ombor — barcha sub-omborlari bo'sh bo'lsa.

### 6.3 Hujjatlar (`sale`, `purchase`, `stock_count`)
- `number` — `doc_sequence` dan, qoralama **yaratilganda** beriladi (qoralama o'chirilsa raqam bo'sh qoladi — bu normal).
- `doc_date` — foydalanuvchi tanlaydi (default: hozir). O'tgan sana mumkin (BR-13). **Kelajak sana taqiqlanadi** (OQ-07): `doc_date ≤ hozir` (Toshkent vaqti). Bu servisda tekshiriladi va UI'dagi sana tanlagichda kelajak kunlar o'chiq bo'ladi. Shu qoida kassa yozuvlari (`tx_date`), qarz (`debt_date`) va qaytarish (`repaid_at`) sanalariga ham tegishli.
- Qoralama qatorlari erkin tahrirlanadi va o'chiriladi (`DELETE` faqat `status = 'DRAFT'` bo'lsa — servis tekshiradi).
- `POSTED` dan keyin hujjat va qatorlari o'zgarmaydi (faqat `status`, `reversed_*` maydonlari).

### 6.4 `cash_transaction`
- Har bir yozuv `balance_after` ni saqlaydi — kassa tarixini qayta tekshirish oson.
- O'tkazma: ikki yozuv (`TRANSFER_OUT` + `TRANSFER_IN`), umumiy `transfer_group_id`.
- Savdo/xarid bilan bog'liq yozuvlar `sale_id` / `purchase_id` orqali.

### 6.5 `debt`
- `source = SALE/PURCHASE` — nasiya qismidan avtomatik; `MANUAL` — kassa orqali qarz berish/olish (bunda bitta `cash_transaction` ham yaratiladi, `debt_id` bilan).
- Qoldiq = `amount − repaid_amount` (hisoblanadi, saqlanmaydi).
- `status` → `CLOSED` qachonki `repaid_amount = amount`.

### 6.6 `user`
- Bitta `OWNER` (seed), `STAFF` — cheklanmagan son. Egasi xodimlarni yaratadi va tahrirlaydi (OQ-10).
- Bitta OWNER bo'lishi DB'da partial unique index bilan kafolatlanadi (§5).
- Faolsizlantirilgan foydalanuvchi tizimga kira olmaydi, lekin uning hujjatlari va audit yozuvlari saqlanib qoladi.
- Parol yoki login o'zgarsa — `session` jadvalidan shu foydalanuvchining barcha qatorlari o'chiriladi.

### 6.7 `audit_log`
- `before`/`after` — o'zgargan obyektning JSON ko'rinishi (pul `string` sifatida, BigInt muammosiz).
- Parol hashi, session tokeni hech qachon yozilmaydi.

## 7. Hisobot so'rovlari (namuna)

Davr chegaralari: `from`/`to` — Toshkent vaqti bo'yicha kun boshi/oxiri, UTC'ga o'girilib beriladi.

### 7.1 Mahsulotlar qoldig'i
```sql
SELECT p.id, p.name, p.units_per_block, w.name AS warehouse, sw.name AS sub_warehouse, sb.qty
FROM stock_balance sb
JOIN sub_warehouse sw ON sw.id = sb.sub_warehouse_id
JOIN warehouse w      ON w.id  = sw.warehouse_id
JOIN product p        ON p.id  = sb.product_id
WHERE w.store_id = $1 AND sb.qty > 0
ORDER BY p.name, w.name, sw.name;
```

### 7.2 Savdo hisoboti (mahsulot kesimida)
```sql
SELECT sl.product_id,
       SUM(sl.qty)          AS qty,
       SUM(sl.line_total)   AS revenue,
       SUM(sl.cost_amount)  AS cogs,          -- faqat OWNER
       SUM(sl.line_total) - SUM(sl.cost_amount) AS gross_profit -- faqat OWNER
FROM sale s JOIN sale_line sl ON sl.sale_id = s.id
WHERE s.store_id = $1 AND s.status = 'POSTED'
  AND s.doc_date >= $2 AND s.doc_date < $3
GROUP BY sl.product_id;
```

### 7.3 P&L (BR-11)
```sql
WITH s AS (
  SELECT COALESCE(SUM(total_amount),0) AS revenue, COALESCE(SUM(cost_total),0) AS cogs
  FROM sale WHERE store_id=$1 AND status='POSTED' AND doc_date >= $2 AND doc_date < $3
), t AS (
  SELECT COALESCE(SUM(ct.amount),0) AS travel
  FROM cash_transaction ct
  WHERE ct.store_id=$1 AND ct.type='TRAVEL_EXPENSE' AND ct.tx_date >= $2 AND ct.tx_date < $3
    AND NOT EXISTS (SELECT 1 FROM cash_transaction r WHERE r.reversal_of_id = ct.id)
), i AS (
  SELECT COALESCE(SUM(r.amount),0) AS inventory_diff   -- manfiy = kamomad
  FROM stock_count sc JOIN stock_count_result r ON r.stock_count_id = sc.id
  WHERE sc.store_id=$1 AND sc.status='POSTED' AND sc.doc_date >= $2 AND sc.doc_date < $3
)
SELECT revenue, cogs, revenue - cogs AS gross_profit, travel, inventory_diff,
       revenue - cogs - travel + inventory_diff AS net_profit
FROM s, t, i;
```

> Storno qilingan savdo (`REVERSED`) yuqoridagi so'rovda **asl sanasidan** chiqib ketadi. Bu OQ-01 qaroriga mos (storno qilingan hujjat asl davri hisobidan butunlay chiqadi).

## 8. Seed (boshlang'ich ma'lumot)
SRS bo'yicha boshlang'ich import yo'q. `seed.ts` faqat tizim ishlashi uchun minimal narsani yaratadi:
1. `organization` (1 ta), `store` (1 ta, `Asia/Tashkent`).
2. `cashbox`: `CASH` ("Naqd"), `CARD` ("Karta"), balans 0.
3. `user`: OWNER (`SEED_OWNER_USERNAME` / `SEED_OWNER_PASSWORD` env'dan).
4. `doc_sequence`: SALE, PURCHASE, STOCK_COUNT → 0.

Dev uchun alohida `seed.dev.ts` — namunaviy mahsulotlar, omborlar, xaridlar (faqat lokalda).

## 9. Migratsiya qoidalari
- Har bir sxema o'zgarishi — `prisma migrate dev --name <ma'noli_nom>`; migratsiya fayli kod bilan birga commit qilinadi.
- Yuborilgan (prod'ga chiqqan) migratsiya **tahrirlanmaydi** — faqat yangi migratsiya.
- Ma'lumotni buzadigan o'zgarish (ustun o'chirish, tur o'zgartirish) — ikki bosqichda (expand → contract).
- Sxema o'zgarsa shu hujjat (§4) ham yangilanadi.
