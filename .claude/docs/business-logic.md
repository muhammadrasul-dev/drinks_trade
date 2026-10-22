# Biznes mantiq: algoritmlar

Versiya: 0.1 (qoralama) · Sana: 2026-10-22
SRS qoidalari (BR-xx) qanday qilib kod va DB amallariga aylanishi. Bu hujjat `packages/server` uchun "spetsifikatsiya" — har bir algoritm bo'yicha integratsiya testi yoziladi.
Bog'liq: [database.md](database.md) · [architecture.md](architecture.md) · [open-questions.md](open-questions.md)

---

## 1. Umumiy formulalar (`packages/shared`)

### 1.1 Birliklar (BR-1)
```ts
toPieces(blocks, pieces, unitsPerBlock) = blocks * unitsPerBlock + pieces
splitPieces(qty, unitsPerBlock) = { blocks: Math.floor(qty / unitsPerBlock), pieces: qty % unitsPerBlock }
// 20 dona, blok=6 → { blocks: 3, pieces: 2 } → "3 blok 2 dona"
```
Kiritishda: `inputUnit = BLOCK` → `qty = inputQty × unitsPerBlock`; `PIECE` → `qty = inputQty`.
Inventarizatsiyada blok + dona birga kiritiladi (FR-5.1) → `countedQty = toPieces(...)`.

### 1.2 Pul va yaxlitlash
- Barcha summalar butun so'm (`bigint` DB'da, servisda `number` — `Number.isSafeInteger` tekshiruvi bilan, ADR-008).
- Tannarx summasi: `costAmount = roundHalfUp(qty × unitCost)`. Kasr faqat `unitCost`/`avgCost` da (4 xona).
- Hujjat tannarxi = qatorlar `costAmount` yig'indisi (umumiy summani qayta yaxlitlamaymiz).

### 1.3 O'rtacha tortilgan tannarx (BR-6)
```ts
// Kirim (xarid, savdo storno'si):
newAvg = (Q * avg + inCost) / (Q + q)      // inCost — kirim summasi (so'm), q — dona
// Q = 0 bo'lsa: newAvg = inCost / q
// Chiqim (savdo, xarid storno'si emas): avg o'zgarmaydi
```
- `Q` — `product_cost.total_qty` (do'kon bo'yicha barcha omborlar).
- Hisob **bajarish tartibida** (BR-6): qaysi hujjat avval bajarilsa, o'sha avval ta'sir qiladi; `doc_date` ahamiyatsiz.

### 1.4 Amalga oshirilishi (T-301)
`@drinks/shared` — sof funksiyalar, brauzerda ham ishlaydi (Node API'siz). Noto'g'ri kiritma (kasr dona, manfiy narx, xavfsiz butun sondan katta natija) → `RangeError` (dasturchi xatosi, `DomainError` emas — tekshiruv servisda oldinroq bo'ladi).
- **Tannarx** `Decimal(20,4)` qiymati — satr (`CostString`, ADR-008), natija doim 4 xonali (`"6000.0000"`); ichkarida `bigint × 10⁴` bilan aniq hisoblanadi, float ishlatilmaydi. Har bo'lish 4 xonaga **ROUND HALF UP** (noldan uzoqqa — Postgres `NUMERIC` va Prisma Decimal bilan bir xil). `COST_SCALE = 4`.
- **Pul** — butun so'm `number` (ADR-008); `formatSom` DB'dan kelgan `bigint` ni ham qabul qiladi.
- `units.ts`: `toPieces(blocks, pieces, unitsPerBlock)`, `splitPieces(qty, unitsPerBlock)` (`qty ≥ 0`), `formatQty(qty, unitsPerBlock, labels?)` → `"3 blok 2 dona"`; bo'sh qism tushiriladi (`"3 blok"`, `"2 dona"`, `0` → `"0 dona"`), manfiy (inventarizatsiya farqi) → `"-3 blok 2 dona"`.
- `money.ts`: `formatSom(amount, unit?)` → `"1 250 000 soʻm"` (raqam guruhlari va birlik oldidan **no-break space** U+00A0 — jadvalda qatorga bo'linmaydi); `roundHalfUp(value: string)` → butun so'm, noldan uzoqqa (`"2.5"` → 3, `"-2.5"` → −3).
- Birlik so'zlari (`blok`/`dona`/`soʻm`) — standart o'zbekcha; UI tarjima qilingan so'zlarni parametr sifatida beradi (`enums.InputUnit.*`).
- `costing.ts`: `costAmount(qty, unitCost)` = `roundHalfUp(qty × unitCost)` (§1.2, qty ishorali bo'lishi mumkin); `unitCostOf(lineTotal, qty)` (§5.1); `avgOnReceipt({ totalQty, avgCost, inQty, inCost })` (§1.3 — xarid va savdo storno'si); `avgOnPurchaseReversal({ totalQty, avgCost, outQty, outCost })` (§5.3: `Q − q = 0` → 0, manfiy → 0; `q > Q` → `RangeError`, chunki BR-3 tekshiruvi avval to'xtatishi kerak).

## 2. Qulflash tartibi (deadlock'ning oldini olish)

Har bir bajarish/storno tranzaksiyasi qulflarni **shu tartibda** oladi (kerak bo'lmaganini o'tkazib yuboradi):

1. Hujjat qatori — `SELECT ... FROM sale WHERE id=$1 FOR UPDATE`
2. Omborlar — `SELECT ... FROM warehouse WHERE id = ANY($1) ORDER BY id FOR SHARE` (inventarizatsiya — `FOR UPDATE`)
3. `doc_sequence` (faqat yangi hujjat yaratishda)
4. Kassalar — `ORDER BY type FOR UPDATE` (`CARD`, `CASH`)
5. Qarz qatori — `FOR UPDATE`
6. `product_cost` — `ORDER BY product_id FOR UPDATE`
7. `stock_balance` — `ORDER BY sub_warehouse_id, product_id FOR UPDATE`

Qoida `packages/server/src/core/locks.ts` da funksiyalar sifatida yoziladi; servislar qulfni faqat shu funksiyalar orqali oladi.

Amalga oshirilishi (T-104):
- Funksiyalar: (1) `lockSale` / `lockPurchase` / `lockStockCount`; (2) `lockWarehouses` (`exclusive: true` → `FOR UPDATE`); (3) `nextDocNumber` (`core/numbering.ts`: `INSERT … ON CONFLICT DO UPDATE … RETURNING` — qator qulfi tranzaksiya oxirigacha); (4) `lockCashboxes` (`ORDER BY type::text`, ya'ni `CARD`, `CASH` — enum e'lon tartibi emas); (5) `lockDebt` (`direction`, `source`, `status`, `amount`, `repaidAmount` qaytaradi — T-403); (6) `lockProductCosts`; (7) `lockStockBalances`.
- Har qadam bitta chaqiruvda olinadi (barcha id'lar birga, tartib SQL `ORDER BY` da). `assertLockOrder` shu tranzaksiyada orqaga qaytishni yoki qadamni takrorlashni xato bilan to'xtatadi.
- `lockProductCosts` / `lockStockBalances` yo'q qatorlarni avval bo'sh holatda yaratadi (`total_qty = 0, avg_cost = 0` / `qty = 0`, `ON CONFLICT DO NOTHING`, shu tartibda) — chaqiruvchi har kalit uchun qulflangan qator oladi.
- Topilmagan yoki boshqa do'konga tegishli hujjat/ombor/kassa/qarz → `NOT_FOUND` (`params.entity`).

## 3. Inventarizatsiya bloki (BR-8) — umumiy tekshiruv

Savdo/xarid **bajarish** va **storno** qilishdan oldin:
```
warehouseIds = hujjat qatorlaridagi sub-omborlarning omborlari (distinct)
lock warehouses FOR SHARE (2-qadam)
agar EXISTS stock_count WHERE warehouse_id IN warehouseIds AND status='DRAFT'
  → DomainError(WAREHOUSE_IN_STOCK_COUNT, { warehouseName, stockCountNumber })
```
Inventarizatsiya yaratish omborni `FOR UPDATE` bilan qulflaydi → u bajarilayotgan savdo tugashini kutadi, savdo esa yangi ochilgan inventarizatsiyani ko'radi. Poyga holati yo'q.

Qoralama yaratish/tahrirlash bloklanmaydi (BR-8).

## 4. Savdo

### 4.1 Qoralama (create/update)
1. `assertCan(sale.write)`.
2. Zod: kamida 1 qator; `qty > 0`; mahsulot va sub-ombor arxivlanmagan; to'lov qismlari ≥ 0.
3. `docDate ≤ hozir` (Toshkent), aks holda `DOC_DATE_IN_FUTURE` (OQ-07).
4. Har qatorga `unitPrice = product.salePrice` (1 dona narxi, nusxa), `lineTotal = qty × unitPrice` (OQ-05: narx qatorda tahrirlanmaydi; OQ-15: narx dona uchun).
5. `totalAmount = Σ lineTotal`.
6. **Ogohlantiruvchi** qoldiq tekshiruvi (FR-3.3): qator bo'yicha mavjud qoldiq qaytariladi, yetmasa qator `stockError` bilan belgilanadi — saqlash **mumkin**, bajarish tugmasi o'chiq.
7. Update: `WHERE id=$1 AND status='DRAFT' AND version=$v` → `version+1`; 0 qator yangilansa → `DOCUMENT_CHANGED`.
8. Istalgan foydalanuvchi istalgan qoralamani tahrirlay oladi (OQ-14); audit kim tahrirlaganini yozadi.
9. Audit `CREATE`/`UPDATE` (+ `backdated` agar `docDate < bugun`).

### 4.2 Bajarish (BR-5, BR-7, BR-9)
```
BEGIN
 1. lock sale FOR UPDATE; status = DRAFT bo'lishi shart, aks holda DOCUMENT_NOT_DRAFT
 2. lock warehouses FOR SHARE; inventarizatsiya bloki (§3)
 3. paidCash + paidCard + paidCredit = totalAmount, aks holda PAYMENT_SPLIT_MISMATCH
    docDate ≤ hozir, aks holda DOC_DATE_IN_FUTURE
    BLOCK qatorlar: qty = inputQty × product.unitsPerBlock (joriy) bo'lishi shart, aks holda
    UNITS_PER_BLOCK_CHANGED { lines } — foydalanuvchi qoralamani qayta saqlaydi (OQ-06)
 4. lock cashboxes (agar paidCash/paidCard > 0)
 5. lock product_cost (mahsulotlar bo'yicha)
 6. lock stock_balance (sub-ombor, mahsulot)
 7. har (sub-ombor, mahsulot) bo'yicha jami kerakli qty ≤ balance.qty
    aks holda INSUFFICIENT_STOCK { lines: [{ lineNo, product, available, required }] }
 8. har qator:
      unitCost   = product_cost.avgCost
      costAmount = roundHalfUp(qty × unitCost)
      stock_balance.qty -= qty
      product_cost.totalQty -= qty           (avgCost o'zgarmaydi)
      INSERT stock_movement(SALE, -qty, unitCost, -costAmount, avgBefore=avgAfter=avgCost)
      UPDATE sale_line SET unit_cost, cost_amount
 9. paidCash > 0 → cash_transaction(CASH, IN, SALE_RECEIPT, paidCash); cashbox.balance += 
    paidCard > 0 → cash_transaction(CARD, IN, SALE_RECEIPT, paidCard)
10. paidCredit > 0 → debt(RECEIVABLE, SALE, amount=paidCredit, note = "Savdo S-000123" + sale.note)
11. sale: status=POSTED, costTotal=Σ costAmount, postedAt=now(), postedById
12. audit POST
COMMIT
```
DB `CHECK (qty >= 0)` — 7-qadam xato qilsa ham manfiy qoldiq yozilmaydi (tranzaksiya rollback).

### 4.3 Storno (BR-3)
```
BEGIN
 1. lock sale FOR UPDATE; status = POSTED, aks holda DOCUMENT_NOT_POSTED
 2. assertCan(document.reverse)  — faqat OWNER (OQ-03)
 3. inventarizatsiya bloki (§3)
 4. nasiya bo'lsa: lock debt; repaidAmount > 0 → DEBT_HAS_REPAYMENTS (OQ-04)
 5. lock cashboxes; paidCash ≤ CASH.balance va paidCard ≤ CARD.balance,
    aks holda CASHBOX_INSUFFICIENT { cashbox }  (BR-9: kassa manfiy bo'lmaydi)
 6. lock product_cost, stock_balance
 7. har qator (tovar QAYTADI, savdodagi tannarx bilan):
      inCost = line.costAmount
      newAvg = (Q × avg + inCost) / (Q + qty)
      stock_balance.qty += qty; product_cost: totalQty += qty, avgCost = newAvg
      INSERT stock_movement(SALE_REVERSAL, +qty, line.unitCost, +inCost, avgBefore, avgAfter)
 8. cash_transaction(SALE_REFUND, OUT) — naqd va karta qismlari uchun
 9. debt.status = CANCELLED
10. sale: status=REVERSED, reversedAt, reversedById, reverseReason
11. audit REVERSE
COMMIT
```

## 5. Xarid

### 5.1 Qoralama
- Qator: `inputUnit`, `inputQty`, `inputPrice` → `qty = toPieces`, `lineTotal = inputQty × inputPrice`, `unitCost = lineTotal / qty` (4 xona).
- Qoldiq tekshiruvi yo'q.
- Sana (OQ-07), qoralamani istalgan foydalanuvchi tahrirlashi (OQ-14) va bajarishda blok tekshiruvi (OQ-06) — savdodagi kabi.

### 5.2 Bajarish (BR-4)
```
BEGIN
 1. lock purchase; DRAFT
 2. inventarizatsiya bloki (§3)
 3. to'lov yig'indisi = totalAmount
 4. lock cashboxes; paidCash ≤ CASH.balance, paidCard ≤ CARD.balance → aks holda CASHBOX_INSUFFICIENT
 5. lock product_cost (yo'q bo'lsa yaratiladi), stock_balance (yo'q bo'lsa yaratiladi)
 6. mahsulot bo'yicha guruhlab:
      q = Σ qty; inCost = Σ lineTotal
      newAvg = Q=0 ? inCost/q : (Q × avg + inCost)/(Q + q)
    har qator: stock_balance.qty += qty;
      INSERT stock_movement(PURCHASE, +qty, unitCost, lineTotal, avgBefore, avgAfter)
    product_cost: totalQty += q, avgCost = newAvg
 7. cash_transaction(PURCHASE_PAYMENT, OUT) — naqd/karta
 8. paidCredit > 0 → debt(PAYABLE, PURCHASE)
 9. status=POSTED; audit POST
COMMIT
```

### 5.3 Storno (BR-3)
```
BEGIN
 1. lock purchase; POSTED
 2. inventarizatsiya bloki
 3. nasiya: lock debt; repaidAmount > 0 → DEBT_HAS_REPAYMENTS (OQ-04)
 4. lock cashboxes (pul qaytib KELADI — kirim, balans tekshiruvi kerak emas)
 5. lock product_cost, stock_balance
 6. har (sub-ombor, mahsulot): balance.qty ≥ qatordagi qty, aks holda
    PURCHASE_REVERSAL_INSUFFICIENT_STOCK { product, subWarehouse, available, required }
    ("avval tegishli savdoni storno qiling" — BR-3)
 7. mahsulot bo'yicha: q = Σ qty, outCost = Σ lineTotal
      Q − q = 0  → avgCost = 0
      aks holda  → newAvg = (Q × avg − outCost)/(Q − q); agar newAvg < 0 → 0  (OQ-09: qayta hisoblash tasdiqlangan)
    stock_balance.qty -= qty; INSERT stock_movement(PURCHASE_REVERSAL, −qty, ...)
 8. cash_transaction(PURCHASE_REFUND, IN); debt → CANCELLED
 9. status=REVERSED; audit REVERSE
COMMIT
```

## 6. Inventarizatsiya (BR-8)

### 6.1 Ochish
```
BEGIN
 lock warehouse FOR UPDATE
 agar DRAFT mavjud → STOCK_COUNT_ALREADY_OPEN (partial unique index ham himoya qiladi)
 INSERT stock_count(DRAFT); audit CREATE
COMMIT
```
UI forma: ombordagi barcha sub-omborlar × `qty > 0` bo'lgan mahsulotlar ro'yxati, "tizim qoldig'i" ustuni bilan (jonli qiymat; ombor bloklangani uchun o'zgarmaydi). Foydalanuvchi haqiqiy sonni (blok + dona) kiritadi; boshqa mahsulot qo'shishi mumkin (ortiqcha topilgan tovar).

**Kiritilmagan qator** = tizim qoldig'i o'zgarishsiz qoladi (OQ-13). Ya'ni faqat sanalgan qatorlar saqlanadi; "0" — aniq kiritilgan nol.

### 6.2 Bajarish
```
BEGIN
 1. lock stock_count; DRAFT
 2. lock warehouse FOR UPDATE
 3. lock product_cost (qatordagi mahsulotlar), stock_balance (ombordagi barcha tegishli qatorlar)
 4. har qator: systemQty = balance.qty (snapshot qatorga yoziladi)
               delta = countedQty − systemQty
               delta ≠ 0 → balance.qty = countedQty;
                            INSERT stock_movement(COUNT_ADJUSTMENT, delta, unitCost=avg, round(delta×avg))
 5. mahsulot bo'yicha OMBOR JAMI:
      diffTotal = Σ delta (shu mahsulot, shu ombor)
      amount    = roundHalfUp(diffTotal × avgCost)       (− kamomad, + ortiqcha)
      product_cost.totalQty += diffTotal                 (avgCost o'zgarmaydi)
      INSERT stock_count_result(...)
    → sub-omborlar orasidagi farq (Σ = 0) P&L ga ta'sir qilmaydi, faqat joy tuzatiladi
 6. shortageAmount = Σ |amount| (amount<0), surplusAmount = Σ amount (amount>0)
 7. status=POSTED; audit POST  → blok avtomatik yechiladi
COMMIT
```

### 6.3 Bekor qilish
`DRAFT → CANCELLED` (qoldiq o'zgarmaydi), blok yechiladi. Audit `CANCEL`.

### 6.4 Eslatma: tannarx 0 bo'lgan mahsulot
Hech qachon xarid qilinmagan mahsulot ortiqcha chiqsa, `avgCost = 0` → ortiqcha summasi 0 so'm. Tovar qoldiqqa qo'shiladi, keyingi xarid o'rtachani to'g'ri hisoblaydi.

## 7. Kassa (BR-9)

| Amal | Yozuvlar | Tekshiruv |
|---|---|---|
| Yo'l kira | `TRAVEL_EXPENSE` OUT | balans ≥ summa |
| Boshqa chiqim | `OTHER_EXPENSE` OUT, izoh majburiy | balans ≥ summa |
| Qarz berish | `DEBT_GIVEN` OUT + `debt(RECEIVABLE, MANUAL)` | balans ≥ summa; izoh majburiy |
| Qarz olish | `DEBT_TAKEN` IN + `debt(PAYABLE, MANUAL)` | izoh majburiy |
| Qarz qaytarish (menga) | `DEBT_REPAID_TO_ME` IN + `debt_repayment` | summa ≤ qarz qoldig'i |
| Qarz qaytarish (men) | `DEBT_REPAID_BY_ME` OUT + `debt_repayment` | summa ≤ qarz qoldig'i; balans ≥ summa |
| O'tkazma | `TRANSFER_OUT` + `TRANSFER_IN`, bitta `transfer_group_id` | manba balansi ≥ summa; manba ≠ maqsad |

Har yozuvda: lock cashbox → balansni yangilash → `balance_after` → audit.

Amalga oshirilishi (T-402, `packages/server/src/modules/cash`): yagona yozish nuqtasi — `cash.record(tx, ctx, cashbox, input)`.
- Chaqiruvchi avval `lockCashboxes` (§2, 4-qadam) bilan kerakli kassalarni bitta chaqiruvda qulflaydi va qaytgan `LockedCashbox` ni uzatadi; `record` o'zi qulf olmaydi (savdoda u 9-qadamda, ya'ni `stock_balance` dan keyin chaqiriladi).
- Balans bitta `UPDATE … SET balance = balance + delta WHERE … AND balance + delta >= 0 RETURNING balance` bilan o'zgaradi; qaytgan qiymat — `balance_after`. Qator qaytmasa → `CASHBOX_INSUFFICIENT { cashbox: CASH | CARD }` — **params'da summa yo'q** (rolga qaramay; OQ-02, CLAUDE.md 6-qoida). Xato chaqiruvchi tranzaksiyasini butunlay rollback qiladi. Bajarishdagi oldindan tekshiruv (§4.3 5-qadam, §5.2 4-qadam) ixtiyoriy — yakuniy kafolat `record` va DB `CHECK`.
- Yo'nalish turdan olinadi (`CASH_TX_DIRECTION`); `MANUAL_REVERSAL` da `direction` va `reversalOfId` aniq beriladi. `OTHER_EXPENSE` izohsiz → `NOTE_REQUIRED`. Har yozuvga audit `CREATE` / `cash_transaction`.
- Ruxsat (`assertCan`), kiritma validatsiyasi, sana (OQ-07) va qarzdagi izoh — chaqiruvchida (savdo/xarid bajarish, T-403 qarzlar, T-702 kassa amallari).

Qarz qaytarish: `debt.repaidAmount += amount`; teng bo'lsa `status = CLOSED`. Qarz qaysi kassaga qaytishini foydalanuvchi tanlaydi (FR-7.2). Nasiya savdo/xarid qarzi ham shu usulda qaytariladi.

Qo'lda kiritilgan yozuvni bekor qilish (OQ-08): faqat OWNER, teskari `MANUAL_REVERSAL` yozuvi bilan (`reversal_of_id` → asl yozuv); asl yozuv o'chirilmaydi. Teskari yozuv kassa yo'nalishini teskari qiladi (chiqim bekor → kirim), shuning uchun kirimni bekor qilishda balans tekshiriladi. Qarz berish/olish storno'si qarzni `CANCELLED` qiladi (qaytarishlari bo'lsa — bloklanadi). P&L o'qishda storno qilingan yo'l kira hisobga olinmaydi.

Amalga oshirilishi (T-403, `packages/server/src/modules/debts`): yagona yozish nuqtasi `debt` qatorlarini ochish va bekor qilish uchun. Ichki servis — ruxsat, kiritma va sana (OQ-07) chaqiruvchida, qulflarni (§2) ham chaqiruvchi oladi.
- `debts.open(tx, ctx, input)` → `{ id, direction, cashTransactionId }`. `MANUAL`: `direction` va `lockCashboxes` bilan qulflangan `cashbox` beriladi; izohsiz → `NOTE_REQUIRED`; `RECEIVABLE` → `cash.record(DEBT_GIVEN, OUT)` (yetmasa `CASHBOX_INSUFFICIENT`, butun tranzaksiya rollback), `PAYABLE` → `cash.record(DEBT_TAKEN, IN)`; kassa yozuvi `debt_id` bilan, `tx_date = debt_date`. `SALE` (`saleId`) → `RECEIVABLE`, `PURCHASE` (`purchaseId`) → `PAYABLE`, kassa harakatisiz (to'langan qismlarni bajarish o'zi yozadi); izoh ixtiyoriy (OQ-18). Summa ≤ 0 yoki kasr → `RangeError`. Audit `CREATE debt`.
- `debts.cancel(tx, ctx, debt, { cashbox? })` — `debt` = `lockDebt` (5-qadam) natijasi (`direction`, `source`, `status`, `amount`, `repaidAmount`). `CANCELLED` → `DEBT_CANCELLED`; `repaidAmount > 0` (shu jumladan `CLOSED`) → `DEBT_HAS_REPAYMENTS` (OQ-04; params'da summa yo'q). `MANUAL`: asl `DEBT_GIVEN`/`DEBT_TAKEN` yozuvi teskari `MANUAL_REVERSAL` bilan qaytariladi (OQ-08; `reversal_of_id`, `debt_id`) — shu yozuvning kassasi 4-qadamda qulflangan va `cashbox` sifatida berilgan bo'lishi shart; olingan qarzni bekor qilish — chiqim, balans yetmasa `CASHBOX_INSUFFICIENT`. `SALE`/`PURCHASE`: kassa harakatisiz (§5.3 8-qadam). `status = CANCELLED`, audit `CANCEL debt`.
- Qaytarish (`debt_repayment`, `repaidAmount`, `CLOSED`) — T-704 da (shu bo'limdagi jadval qoidalari bo'yicha).

## 8. P&L (BR-11)

```
Tushum            = Σ sale.totalAmount         (POSTED, doc_date davrda)
Tannarx (COGS)    = Σ sale.costTotal            (POSTED, doc_date davrda)
Yalpi foyda       = Tushum − COGS
Yo'l kira         = Σ TRAVEL_EXPENSE            (tx_date davrda, storno qilinmagan)
Inventarizatsiya  = Σ stock_count_result.amount (POSTED, doc_date davrda; − kamomad, + ortiqcha)
SOF FOYDA         = Yalpi foyda − Yo'l kira + Inventarizatsiya
```
P&L ekranida inventarizatsiya ikki qator: "Kamomad" (Σ manfiy) va "Ortiqcha" (Σ musbat).
Kirmaydi: xarid summasi, qarz amallari, `OTHER_EXPENSE`, o'tkazmalar.
Filtr: kun / oy / yil / ixtiyoriy oraliq (Toshkent vaqti).

## 9. Kam qoldiq ogohlantirishi (FR-1.3)
`Σ stock_balance.qty (do'kon bo'yicha) < product.minStock` (va `minStock > 0`) → mahsulotlar ro'yxatida belgi + dashboard'da "Kam qolgan mahsulotlar" bloki. Push/SMS yo'q.

## 10. Xato kodlari (`shared/errors.ts`)

| Kod | Qachon |
|---|---|
| `UNAUTHORIZED` / `FORBIDDEN` | sessiya yo'q / ruxsat yo'q |
| `VALIDATION_FAILED` | zod xatosi (`fieldErrors` bilan) |
| `NOT_FOUND` | obyekt topilmadi yoki boshqa do'konniki |
| `DOCUMENT_CHANGED` | optimistik qulf (version) |
| `DOCUMENT_NOT_DRAFT` / `DOCUMENT_NOT_POSTED` | noto'g'ri holatda amal |
| `INSUFFICIENT_STOCK` | BR-7 |
| `PURCHASE_REVERSAL_INSUFFICIENT_STOCK` | BR-3 |
| `WAREHOUSE_IN_STOCK_COUNT` | BR-8 |
| `STOCK_COUNT_ALREADY_OPEN` | BR-8 |
| `PAYMENT_SPLIT_MISMATCH` | BR-9 |
| `CASHBOX_INSUFFICIENT` | BR-9 (STAFF uchun xabarda balans summasi ko'rsatilmaydi) |
| `DEBT_HAS_REPAYMENTS` | OQ-04 |
| `DEBT_CANCELLED` | qarz allaqachon bekor qilingan (masalan, ikki marta storno) |
| `DEBT_OVERPAYMENT` | qaytarish > qarz qoldig'i |
| `NOTE_REQUIRED` | boshqa chiqim / qarz izohsiz |
| `ENTITY_NOT_EMPTY` | bo'sh bo'lmagan ombor/sub-omborni arxivlash (FR-2.2) |
| `ENTITY_ARCHIVED` | arxivlangan mahsulot/omborni hujjatda tanlash |
| `DUPLICATE_VALUE` | SKU / shtrix-kod / nom / login takrorlangan |
| `DOC_DATE_IN_FUTURE` | hujjat yoki kassa sanasi kelajakda (OQ-07) |
| `UNITS_PER_BLOCK_CHANGED` | qoralama saqlangandan keyin blokdagi dona soni o'zgargan (OQ-06) |
| `INVALID_CREDENTIALS` | login yoki parol noto'g'ri (qaysi biri xato ekani aytilmaydi) |
| `USER_INACTIVE` | faolsizlantirilgan akkaunt |
| `TOO_MANY_ATTEMPTS` | 5 ta xato urinish, 15 daqiqa blok |
| `CURRENT_PASSWORD_INVALID` | Egasi o'z parolini o'zgartirayotganda joriy parol noto'g'ri |

## 11. Foydalanuvchilarni boshqarish (OQ-10)

| Amal | Kim | Qoidalar |
|---|---|---|
| Xodim yaratish | OWNER | F.I.O, login (yagona, `a-z0-9._-`, 3–32), parol (≥ 8), til. Rol doim `STAFF` |
| Xodimni tahrirlash | OWNER | F.I.O, login, til. Login o'zgarsa, xodimning sessiyalari o'chiriladi |
| Xodim parolini o'rnatish | OWNER | Yangi parol kiritiladi, xodimning barcha sessiyalari o'chiriladi |
| Faolsizlantirish / faollashtirish | OWNER | O'zini faolsizlantira olmaydi. Faolsizlantirilganda sessiyalar o'chiriladi |
| O'z login/parolini o'zgartirish | OWNER | Joriy parol talab qilinadi |
| Parolni tiklash (Egasi unutsa) | Server admini | `pnpm user:reset-password <login>` (CLI) |
| Akkauntni o'chirish | — | Yo'q, faqat faolsizlantirish |

Login oqimi: `username` kichik harfga o'giriladi. Foydalanuvchi topilmasa yoki faol bo'lmasa ham, argon2 tekshiruvi baribir bajariladi, shunda javob vaqtidan login mavjudligini bilib bo'lmaydi. Xato bo'lsa `INVALID_CREDENTIALS` (yoki `USER_INACTIVE`) qaytadi. Muvaffaqiyatli bo'lsa — yangi sessiya, `last_login_at` yangilanadi, audit'ga `LOGIN` yoziladi.

Amalda (T-201, `packages/server/src/modules/auth`):
1. Kiritma `loginInputSchema` (`@drinks/shared/schemas`) bilan tekshiriladi → `VALIDATION_FAILED`.
2. (login, IP) bloklangan bo'lsa → `TOO_MANY_ATTEMPTS` (parol tekshirilmaydi), audit `LOGIN_FAILED`.
3. argon2 tekshiruvi (login yo'q bo'lsa — soxta hash bilan). Parol noto'g'ri yoki login yo'q → hisoblagich +1 (5-xatoda 15 daqiqa blok), audit `LOGIN_FAILED`, `INVALID_CREDENTIALS`.
4. Parol to'g'ri, lekin akkaunt faolsiz → `USER_INACTIVE` (hisoblagichga qo'shilmaydi), audit `LOGIN_FAILED`. Faolsizlik faqat to'g'ri parol bilan oshkor bo'ladi.
5. Muvaffaqiyat: hisoblagich o'chiriladi, sessiya, `last_login_at`, audit `LOGIN` — bitta tranzaksiyada.

Parolni tiklash CLI (T-205): `pnpm user:reset-password <login>` → `packages/server/scripts/reset-password.ts` (faqat I/O: parol ikki marta, ekranga chiqmaydi; TTY bo'lmasa stdin'ning dastlabki ikki qatori) → `users.resetPassword` (`packages/server/src/modules/users`). Bitta tranzaksiyada: kiritma `resetPasswordInputSchema` (login kichik harfga, parol 8–128) → `VALIDATION_FAILED`; login topilmasa → `NOT_FOUND` (`params.entity = 'user'`); yangi argon2id hash va `password_changed_at`, foydalanuvchining **barcha** sessiyalari va uning loginidagi barcha `login_attempt` qatorlari (blok ham) o'chiriladi, audit `PASSWORD_RESET` (`user_id = null`, `meta = { username, source: 'cli', sessionsRevoked, attemptsCleared }`). Har qanday rolga ishlaydi; faolsiz akkaunt faolsizligicha qoladi (OQ-17, yopilgan — A).

Audit: `LOGIN_FAILED` — `user_id = null`, `entity_id` = foydalanuvchi id yoki (mavjud bo'lmasa) kiritilgan login, `meta = { username, ip, userAgent, reason, failedCount?, lockedUntil? }`; `LOGIN` — `meta = { ip, userAgent }`. Parol, hash va token hech qachon yozilmaydi. Chiqish (`logout`) sessiya qatorini o'chiradi, auditga yozilmaydi.
