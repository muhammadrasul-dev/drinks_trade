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
- `dates.ts` (T-204): `formatDateTime(date, timeZone = STORE_TIME_ZONE)` → `"23.10.2026 14:05"` (`DD.MM.YYYY HH:mm`, `Asia/Tashkent`) — UI'da sana-vaqt shu bilan chiqadi (locale'li `Intl` formati Node va brauzerda farq qiladi).
- Birlik so'zlari (`blok`/`dona`/`soʻm`) — standart o'zbekcha; UI tarjima qilingan so'zlarni parametr sifatida beradi (`enums.QtyUnit.*`, `common.som`; `MoneyText` / `QtyText` — T-203).
- `costing.ts`: `costAmount(qty, unitCost)` = `roundHalfUp(qty × unitCost)` (§1.2, qty ishorali bo'lishi mumkin); `unitCostOf(lineTotal, qty)` (§5.1); `avgOnReceipt({ totalQty, avgCost, inQty, inCost })` (§1.3 — xarid va savdo storno'si); `avgOnPurchaseReversal({ totalQty, avgCost, outQty, outCost })` (§5.3: `Q − q = 0` → 0, manfiy → 0; `q > Q` → `RangeError`, chunki BR-3 tekshiruvi avval to'xtatishi kerak).

### 1.5 Zaxira servisi (T-401)
`packages/server/src/modules/inventory` — `stock_balance`, `product_cost`, `stock_movement` uchun **yagona yozish nuqtasi** (ADR-007). Ichki servis: ruxsat (`assertCan`), hujjat holati, sana (OQ-07), inventarizatsiya bloki (§3) va 1–5-qulflar — chaqiruvchida. `receive` / `issue` / `adjust` 6–7-qulflarni (`lockProductCosts`, `lockStockBalances`) **o'zi** oladi, shuning uchun chaqiruvchi ularni olmaydi (aks holda `assertLockOrder` xatosi); bitta tranzaksiyada faqat bitta chaqiruv.
- Har chaqiruvdan oldin: sub-omborlar `ctx.storeId` ga, mahsulotlar `ctx.organizationId` ga tegishli, aks holda `NOT_FOUND { entity }`. Noto'g'ri qator (bo'sh ro'yxat, `qty ≤ 0`, kasr, noto'g'ri `unitCost`, takroriy sanoq kaliti) → `RangeError`.
- `receive(tx, ctx, { type: PURCHASE | SALE_REVERSAL, docDate, lines: [{ subWarehouseId, productId, qty, unitCost, costAmount, purchaseLineId? | saleLineId? }] })` — mahsulot bo'yicha guruhlab `avgOnReceipt(Q, avg, Σ qty, Σ costAmount)`, har qatorga `stock_movement(+qty, unitCost, +costAmount, avgBefore, avgAfter)`. Savdo storno'si ham mahsulot bo'yicha guruhlanadi (OQ-18). `costAmount` — xaridda `lineTotal`, storno'da `sale_line.cost_amount`.
- `issue(tx, ctx, { type: SALE, docDate, lines: [{ …, qty, lineNo?, saleLineId? }] })` — har (sub-ombor, mahsulot) bo'yicha `Σ qty ≤ balance`, aks holda `INSUFFICIENT_STOCK { lines: [{ lineNo, productId, product, subWarehouseId, available, required }] }` (kalit bo'yicha jami; yetmagan kalitning har qatori uchun). `unitCost = avg`, `costAmount(qty, avg)` qatorma-qator; avg o'zgarmaydi. Natijadagi `-movement.costAmount` / `movement.unitCost` → `sale_line`.
- `issue(tx, ctx, { type: PURCHASE_REVERSAL, docDate, lines: [{ …, qty, unitCost, costAmount, purchaseLineId? }] })` — yetmasa `PURCHASE_REVERSAL_INSUFFICIENT_STOCK { productId, product, subWarehouseId, subWarehouse, available, required }` (qulf tartibidagi birinchi yetmagan kalit); mahsulot bo'yicha `avgOnPurchaseReversal(Q, avg, Σ qty, Σ costAmount)`.
- `adjust(tx, ctx, { docDate, stockCountId?, lines: [{ subWarehouseId, productId, countedQty }] })` — `systemQty` qulf ostida o'qiladi; `delta ≠ 0` → `balance = countedQty`, `stock_movement(COUNT_ADJUSTMENT, delta, avg, costAmount(delta, avg))`; natija `products[]` = bitta `stock_count_result` (`systemQty`, `countedQty`, `qtyDelta`, `avgCost`, `amount = costAmount(Σ delta, avg)`), `product_cost.total_qty += Σ delta`, avg o'zgarmaydi.
- Natija — har qator uchun yozilgan `stock_movement` (ishorali: `qtyDelta`, `costAmount`; tannarxlar 4 xonali satr). Xatolarda qoldiq miqdorlari bor (maxfiy emas), summa yo'q. Xato chaqiruvchi tranzaksiyasini rollback qiladi.
- Audit yo'q: `stock_movement` o'zi jurnal (`created_by_id`), hujjat `POST` / `REVERSE` auditini chaqiruvchi yozadi.
- So'rovlar (qulfsiz): `getAvailable(db, ctx, keys)` — kalitlar tartibida qoldiq (yo'q yoki boshqa do'kon → 0; qoralama ogohlantirishi FR-3.3, inventarizatsiya formasi); `getProductTotals(db, ctx, productIds)` — do'kon bo'yicha `totalQty`, `avgCost` faqat `report.sales.cost` egasiga (CLAUDE.md 6-qoida); `getStockedSubWarehouses(db, ctx, subWarehouseIds?)` — qoldig'i bor (`qty > 0`) sub-omborlar to'plami (T-304: omborlar sahifasidagi belgi va arxivlash tekshiruvi — u 2-qadam qulfi ostida chaqiriladi, §9c).

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

Shu qulfdan keyin arxiv tekshiruvi ham bajariladi: `warehouses.resolveActive(tx, ctx, subWarehouseIds)` → ombor yoki sub-ombor arxivda bo'lsa `ENTITY_ARCHIVED` (§9c). Ombor/sub-omborni arxivlash shu ombor qatorini `FOR UPDATE` qiladi, shuning uchun arxivlangan joyga tovar kira olmaydi va qoldiqli joy arxivlanmaydi. Inventarizatsiya ochishda (T-601) ham arxivdagi ombor rad etiladi.

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
    paidCredit > 0 va sale.note bo'sh → NOTE_REQUIRED (OQ-19: izoh kontragent o'rnida)
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
10. paidCredit > 0 → debt(RECEIVABLE, SALE, amount=paidCredit, note = sale.note)  (OQ-19)
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
 7. mahsulot bo'yicha guruhlab (tovar QAYTADI, savdodagi tannarx bilan; OQ-18):
      q = Σ qty; inCost = Σ line.costAmount
      newAvg = avgOnReceipt(Q, avg, q, inCost)
    har qator: stock_balance.qty += qty;
      INSERT stock_movement(SALE_REVERSAL, +qty, line.unitCost, +line.costAmount, avgBefore, avgAfter)
    product_cost: totalQty += q, avgCost = newAvg
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

**Amalda (T-404)** — `packages/server/src/modules/purchases/purchases.service.ts` (`purchases.list/get/create/update/remove`, ruxsat `purchase.write`; `create`/`update` — `document.paymentSplit.write` ham):
- Kiritma — `@drinks/shared/schemas` `purchaseDraftInputSchema` (forma ham shu): 1–200 qator, `inputQty` 1…1 000 000, `inputPrice` 0…1 000 000 000 (0 — bonus tovar, OQ-23), to'lov qismlari ≥ 0, izoh ≤ 500 (bo'sh → `null`), hujjat jami xavfsiz butun son.
- **Sana:** forma kunni (`YYYY-MM-DD`, Toshkent) yuboradi. Bugundan keyin → `DOC_DATE_IN_FUTURE`; bugun → `now()`; o'tgan kun → o'sha kun 12:00 (UTC+5) — kun har qanday vaqt zonasi o'girishida saqlanadi. Tahrirlashda kun o'zgarmasa saqlangan vaqt qoladi. O'tgan sana → audit `backdated`.
- Mahsulot tashkilotniki va faol bo'lishi shart (yo'q → `NOT_FOUND { entity: 'product' }`, arxivda → `ENTITY_ARCHIVED { entity: 'product', name }`); sub-ombor — `warehouses.resolveActive` (§9c). Qoralama saqlanayotganda ham tekshiriladi.
- `BLOCK` qator `qty` si mahsulotning **joriy** blokdagi dona soni bilan hisoblanadi; bajarishda qayta tekshiriladi (`UNITS_PER_BLOCK_CHANGED`, OQ-06 — T-405).
- To'lov qismlari qoralamada jami summaga teng bo'lishi shart emas (DB `purchase_payment_split` ham faqat `DRAFT` dan boshqasini tekshiradi) — forma farqni ko'rsatadi, bajarish `PAYMENT_SPLIT_MISMATCH` beradi. Nasiya + bo'sh izoh — formada ogohlantirish, bajarishda `NOTE_REQUIRED` (OQ-19).
- **Yaratish:** qatorlar tekshiriladi → `nextDocNumber(PURCHASE)` (§2 3-qadam) → `P-000001`; xato bo'lsa raqam bo'sh qoladi (database §6.3).
- **Tahrirlash / o'chirish:** `lockPurchase` (§2 1-qadam) → `DRAFT` emas → `DOCUMENT_NOT_DRAFT`; `version` forma yuklagandagidan farq qilsa → `DOCUMENT_CHANGED` (optimistik qulf; qulf ostida taqqoslanadi, shuning uchun bir vaqtdagi ikki saqlashdan faqat bittasi o'tadi). Tahrir — sarlavha + qatorlar to'liq almashtiriladi, `version + 1`. O'chirish — qoralama va qatorlari butunlay o'chiriladi.
- Audit (`entityType: 'purchase'`): `CREATE` (`after`), `UPDATE` (`before`/`after`), `DELETE` (`before`) — raqam, sana, izoh, summalar va qatorlar (pul `number`).
- Ro'yxat: holat, sana oralig'i (Toshkent kunlari, ikkala chet kiradi), raqam qismi (`45` → `P-000045`); yangilari birinchi (`docDate`, `number` kamayish), 50 tadan. Formadagi mahsulot tanlovi — `products.options(ctx)` (faqat faol), sub-omborlar — `warehouses.options(ctx)`.

### 5.2 Bajarish (BR-4)
```
BEGIN
 1. lock purchase; DRAFT
 2. inventarizatsiya bloki (§3)
 3. to'lov yig'indisi = totalAmount; paidCredit > 0 va izoh bo'sh → NOTE_REQUIRED (OQ-19)
 4. lock cashboxes; paidCash ≤ CASH.balance, paidCard ≤ CARD.balance → aks holda CASHBOX_INSUFFICIENT
 5. lock product_cost (yo'q bo'lsa yaratiladi), stock_balance (yo'q bo'lsa yaratiladi)
 6. mahsulot bo'yicha guruhlab:
      q = Σ qty; inCost = Σ lineTotal
      newAvg = Q=0 ? inCost/q : (Q × avg + inCost)/(Q + q)
    har qator: stock_balance.qty += qty;
      INSERT stock_movement(PURCHASE, +qty, unitCost, lineTotal, avgBefore, avgAfter)
    product_cost: totalQty += q, avgCost = newAvg
 7. cash_transaction(PURCHASE_PAYMENT, OUT) — naqd/karta
 8. paidCredit > 0 → debt(PAYABLE, PURCHASE, note = purchase.note)
 9. status=POSTED; audit POST
COMMIT
```

Amalga oshirilishi (T-405, `purchases.post`): ikkala rol (OQ-02). Hujjat qulfi va `version` dan keyin sarlavha qoidalari (yig'indi → `PAYMENT_SPLIT_MISMATCH`, OQ-19, kelajak sana) qo'shimcha qulfsiz birinchi tekshiriladi; so'ng `lockWarehouses` (FOR SHARE) → `warehouses.assertNoOpenStockCount(ids)` → sub-ombor/mahsulot arxivi (`ENTITY_ARCHIVED`) → `BLOCK` qatorda `qty ≠ inputQty × joriy unitsPerBlock` → `UNITS_PER_BLOCK_CHANGED { lines: [{ lineNo, productId, product, qty, unitsPerBlock }] }`. 4-qadam oldindan tekshiruvi `CASHBOX_INSUFFICIENT { cashbox }` (summasiz); 5–6 — `inventory.receive(PURCHASE)` (`costAmount = lineTotal`); 7 — `cash.record` har to'langan qism uchun (`tx_date = doc_date`); 8 — `debts.open(PURCHASE)`. Audit `POST`: `before { status, version }`, `after` — summalar, harakatlar (avg oldin/keyin), kassa yozuvlari id'lari, `debtId`.

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

Amalga oshirilishi (T-406, `purchases.reverse`): faqat OWNER (`document.reverse`, OQ-03) — STAFF → `FORBIDDEN`; kiritma `{ id, reason }`, sabab majburiy (trim, 1–500 belgi, `REVERSE_REASON_MAX`). `POSTED` emas → `DOCUMENT_NOT_POSTED` (ikkinchi storno ham). Qulflar §2 tartibida — yuqoridagi 3- va 4-qadam qulf bo'yicha **teskari**: avval kassalar (§2, 4), keyin qarz (§2, 5); xatolar tartibi o'zgarmaydi, chunki `debts.cancel` qarz qulfidan so'ng darhol chaqiriladi (`DEBT_HAS_REPAYMENTS` tovar harakatidan oldin). 2-qadam: `lockWarehouses` (FOR SHARE) → `assertNoOpenStockCount`; arxivlangan sub-ombor/mahsulot xato emas (tovari bor sub-ombor arxivlanmaydi — FR-2.2, demak 6-qadam yetmaslikni ko'rsatadi). 5–7 — `inventory.issue(PURCHASE_REVERSAL)` (`costAmount = lineTotal`, `PURCHASE_REVERSAL_INSUFFICIENT_STOCK { productId, product, subWarehouseId, subWarehouse, available, required }`); 8 — `cash.record(PURCHASE_REFUND)` har to'langan qism uchun (izoh = sabab), `debts.cancel` (kassa harakatisiz). Harakatlar va kassa yozuvlari **asl `doc_date`** bilan (OQ-26). `purchase`: `reversedAt`, `reversedById`, `reverseReason`, `version + 1`. Audit `REVERSE`: `before { status, version }`, `after` — sabab, harakatlar (avg oldin/keyin), kassa yozuvlari id'lari, `cancelledDebtId`; `meta.reason`, o'tgan sanali hujjatda `meta.backdated`. UI: bajarilgan xarid sahifasida "Storno" tugmasi (faqat OWNER) va sabab maydonli `ConfirmDialog`; bloklangan storno xabari oynada qoladi.

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
- `debts.open(tx, ctx, input)` → `{ id, direction, cashTransactionId }`. `MANUAL`: `direction` va `lockCashboxes` bilan qulflangan `cashbox` beriladi; izohsiz → `NOTE_REQUIRED`; `RECEIVABLE` → `cash.record(DEBT_GIVEN, OUT)` (yetmasa `CASHBOX_INSUFFICIENT`, butun tranzaksiya rollback), `PAYABLE` → `cash.record(DEBT_TAKEN, IN)`; kassa yozuvi `debt_id` bilan, `tx_date = debt_date`. `SALE` (`saleId`) → `RECEIVABLE`, `PURCHASE` (`purchaseId`) → `PAYABLE`, kassa harakatisiz (to'langan qismlarni bajarish o'zi yozadi). Izoh barcha manbalarda majburiy — bo'sh/probel → `NOTE_REQUIRED` (OQ-19; bajarish buni qulflardan oldin o'zi ham tekshiradi). Summa ≤ 0 yoki kasr → `RangeError`. Audit `CREATE debt`.
- `debts.cancel(tx, ctx, debt, { cashbox? })` — `debt` = `lockDebt` (5-qadam) natijasi (`direction`, `source`, `status`, `amount`, `repaidAmount`). `CANCELLED` → `DEBT_CANCELLED`; `repaidAmount > 0` (shu jumladan `CLOSED`) → `DEBT_HAS_REPAYMENTS` (OQ-04; params'da summa yo'q). `MANUAL`: asl `DEBT_GIVEN`/`DEBT_TAKEN` yozuvi teskari `MANUAL_REVERSAL` bilan qaytariladi (OQ-08; `reversal_of_id`, `debt_id`) — shu yozuvning kassasi 4-qadamda qulflangan va `cashbox` sifatida berilgan bo'lishi shart; olingan qarzni bekor qilish — chiqim, balans yetmasa `CASHBOX_INSUFFICIENT`. `SALE`/`PURCHASE`: kassa harakatisiz (§5.3 8-qadam). `status = CANCELLED`, audit `CANCEL debt`.
- `debts.repay(tx, ctx, debt, { cashbox, amount, note?, repaidAt? })` (T-704) — `debt` = `lockDebt` natijasi, `cashbox` undan oldin (4-qadam) qulflangan, uni foydalanuvchi tanlaydi (FR-7.2). Har manbadagi `OPEN` qarz uchun (nasiya savdo/xarid qarzi ham): `CANCELLED` → `DEBT_CANCELLED`; `amount > amount − repaidAmount` (shu jumladan `CLOSED` qarz) → `DEBT_OVERPAYMENT` (params'siz). `RECEIVABLE` → `cash.record(DEBT_REPAID_TO_ME, IN)`, `PAYABLE` → `cash.record(DEBT_REPAID_BY_ME, OUT)` — balans yetmasa `CASHBOX_INSUFFICIENT`, butun tranzaksiya rollback. Keyin `debt_repayment` (`cash_transaction_id` — shu yozuv, `repaid_at = tx_date`), `repaidAmount += amount`, teng bo'lsa `CLOSED`. Audit: `CREATE debt_repayment` va `UPDATE debt` (`repaidAmount`, `status`).

Qarzlar sahifasi (T-704, `debts.commands.ts` / `debts.queries.ts`; hammasi `debt.read` / `debt.write` — faqat OWNER, STAFF `FORBIDDEN`):
- `debtCommands.open(ctx, { direction, cashbox, amount, note, date })` — qo'lda qarz berish/olish: `resolveStoreDate` (`core/dates.ts`, OQ-07: bugun → hozir, o'tgan kun → 12:00, kelajak → `DOC_DATE_IN_FUTURE`), `lockCashboxes` → `debts.open(MANUAL)`. Bo'sh izoh → `NOTE_REQUIRED` (sxema emas, servis — barcha manbalarda bir xil kod).
- `debtCommands.repay(ctx, { debtId, cashbox, amount, note?, date })` — `lockCashboxes` → `lockDebt` (§2: 4 → 5) → qaytarish kuni < qarz kuni → `VALIDATION_FAILED { reason: BEFORE_DEBT_DATE }` (OQ-27) → `debts.repay`. Ikki parallel qaytarish qarz qatori qulfida navbatlashadi — ikkinchisi yangilangan qoldiqni ko'radi.
- `debtQueries.list(ctx, query)` — yo'nalish, holat, manba, `debt_date` oralig'i (Toshkent kuni, `storeDayRange`), izoh bo'yicha qidiruv (katta-kichik harfga sezgirsiz); tartib `debt_date` ↓, `id` ↓; 50 tadan; har qatorda `remaining = amount − repaidAmount` va qaytarishlar (eskisi birinchi, kassasi bilan). `debtQueries.totals(ctx)` — filtrlarsiz, `OPEN` qarzlar qoldig'i yo'nalish bo'yicha.

O'qish (T-701, `cash.queries.ts`): `cashQueries.balances(ctx)` — do'konning ikki kassasi (CASH, keyin CARD) joriy balansi bilan; `cashQueries.journal(ctx, query)` — `cash_transaction` jurnali: `from`/`to` (Toshkent kuni, `tx_date`), `cashbox`, `type`, `direction`, `page` (50 tadan); tartib — `tx_date` ↓, `id` ↓ (OQ-24); `totals` — barcha filtrlangan yozuvlar bo'yicha Σ kirim / Σ chiqim. Ikkalasi `cash.read` (faqat OWNER) — STAFF `FORBIDDEN` (CLAUDE.md 6-qoida).

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
Amalda (T-303): `isLowStock(stockQty, minStock)` (`@drinks/shared`); `stockQty` = `product_cost.total_qty` (invariant bo'yicha `Σ stock_balance.qty` ga teng) — `inventory.getProductTotals` orqali; DTO'da `stockQty`, `lowStock`.

## 9a. Toifa va brend (T-302, FR-1.1)
`packages/server/src/modules/products/catalog.service.ts` — `categories` va `brands` (bir xil API, jadval adapteri orqali):
- `list(ctx, { archived? })` — `product.read`; default faqat faol (mahsulot formasidagi tanlov uchun), `archived: true` — faqat arxiv; nom bo'yicha saralangan, har qatorda `productCount` (arxivlangan mahsulotlar ham). DTO — `CatalogItem` (`@drinks/shared`).
- `create(ctx, { name })`, `rename(ctx, { id, name })`, `archive(ctx, { id })`, `restore(ctx, { id })` — `product.write` (Egasi ham, Xodim ham), kiritma `@drinks/shared/schemas` (`catalog*InputSchema`: nom trim, 1–100) bilan qayta tekshiriladi.
- Nom takrori (katta-kichik harfga sezgirsiz, arxivdagilar ham) → `DUPLICATE_VALUE { entity, field: 'name', archived }`; parallel so'rovda DB unique xatosi (P2002) ham `DUPLICATE_VALUE` ga aylanadi.
- Boshqa tashkilotniki → `NOT_FOUND { entity }`. O'zgarishsiz nom / qayta arxivlash / qayta tiklash — no-op (yozuv va audit yo'q).
- Audit: `CREATE` (`after.name`), `UPDATE` (`before/after.name`), `ARCHIVE` / `RESTORE` (`archivedAt`); `entityType` = `category` | `brand`.

## 9b. Mahsulotlar (T-303, FR-1.1–1.3)
`packages/server/src/modules/products/products.service.ts` — `products`:
- `list(ctx, { q?, categoryId?, brandId?, archived?, page? })` — `product.read`; `q` nom, SKU yoki shtrix-kod ichida (katta-kichik harfga sezgirsiz) qidiradi; default faqat faol, `archived: true` — faqat arxiv; nom bo'yicha, `PRODUCT_PAGE_SIZE` (50) tadan → `ProductPage { items, total, page, pageSize }`. `get(ctx, { id })` — arxivlangan ham.
- DTO `Product` (`@drinks/shared`): kartochka maydonlari, `blockPrice = salePrice × unitsPerBlock` (OQ-15, `blockPrice()`), `category`/`brand` (`{ id, name, archived }` — arxivlangani ham ko'rinadi), `imageVersion`, `stockQty`, `lowStock` (§9). **Maxfiy maydon yo'q** (tannarx/foyda) — bir xil DTO Egasi va Xodimga; tannarx kerak bo'lsa `getProductTotals` qoidasi (faqat `report.sales.cost`) qo'llanadi.
- `create(ctx, input)`, `update(ctx, { id, ...input })` — `product.write` (Egasi ham, Xodim ham); kiritma `productCreateInputSchema` / `productUpdateInputSchema` (`@drinks/shared/schemas`): nom 1–200, `unitsPerBlock` 1–10 000, `salePrice` 0–10¹¹ butun so'm (1 dona), `minStock` ≥ 0 (dona), SKU/shtrix-kod ≤ 64 belgi bo'sh joysiz (bo'sh → `null`), `expiryDate` `YYYY-MM-DD` yoki bo'sh. `update` — barcha maydonlarni almashtiradi; o'zgarish bo'lmasa yozuv va audit yo'q.
- Takroriy SKU/shtrix-kod → `DUPLICATE_VALUE { entity: 'product', field: 'sku' | 'barcode', archived }` (database §6.1); parallel so'rovda P2002 ham shunga aylanadi (`field` index nomidan).
- Toifa/brend: yangi tanlov tashkilotniki va faol bo'lishi shart — boshqa tashkilotniki → `NOT_FOUND { entity }`, arxivlangan → `ENTITY_ARCHIVED { entity }`; mahsulotda allaqachon turgan (keyin arxivlangan) qiymat o'zgarmasa — qabul qilinadi.
- **Blokdagi dona soni** (OQ-06): ikkala rol o'zgartiradi, servis cheklamaydi — UI avval ogohlantirish oynasi chiqaradi (eski → yangi, joriy qoldiqning blok ko'rinishi oldin/keyin, qoralamalar bajarishda tekshirilishi). Qoldiq donada — o'zgarmaydi. Bajarishdagi `UNITS_PER_BLOCK_CHANGED` tekshiruvi — T-405 / T-502.
- `archive` / `restore` — no-op takrorda; qoldiq bo'lsa ham ruxsat (OQ-20, UI qolgan miqdorni ko'rsatadi). Arxivlangan mahsulotni tahrirlash mumkin.
- Rasm: `setImage(ctx, { id, data })` — ≤ 2 MB (`PRODUCT_IMAGE_MAX_BYTES`), format **baytlardan** (sharp) aniqlanadi: jpeg/png/webp, aks holda `VALIDATION_FAILED { fieldErrors: { image: ['tooBig' | 'invalidType'] } }`; EXIF bo'yicha aylantiriladi, 512×512 ichiga kichraytiriladi (kattalashtirilmaydi), WebP (q=85). Fayl avval yoziladi, tranzaksiya xato bersa o'chiriladi; almashtirilgan eski fayl commit'dan keyin o'chiriladi. `removeImage(ctx, { id })`, `readImage(ctx, { id })` (`product.read`, yo'q bo'lsa `NOT_FOUND { entity: 'productImage' }`).
- Audit (`entityType: 'product'`): `CREATE` (`after` — barcha maydonlar, pul `number`), `UPDATE` (`before`/`after` — **faqat o'zgargan** maydonlar; rasm — `imagePath`), `ARCHIVE` / `RESTORE` (`archivedAt`).

## 9c. Omborlar va sub-omborlar (T-304, FR-2.1–2.2)
`packages/server/src/modules/warehouses/warehouses.service.ts` — do'kon darajasida (`store_id`, katalogdan farqli — ADR-011), daraxt **aniq 2 daraja**: `warehouse` → `sub_warehouse`; sub-omborning bolasi yo'q (sxemada ota ustuni yo'q).
- `warehouses.list(ctx, { archived? })` — `warehouse.read`; default faol omborlar, `archived: true` — arxivdagilar; har omborda **barcha** sub-omborlari (arxivdagilar ham, `archived` belgisi bilan), `hasStock` (biror mahsulot `qty > 0`) belgisi. DTO — `WarehouseItem` / `SubWarehouseItem` (`@drinks/shared`).
- `warehouses.options(ctx)` — hujjat formalari (xarid, savdo, inventarizatsiya) uchun: faqat faol omborlar va ularning faol sub-omborlari; faol sub-ombori yo'q ombor tushiriladi (`WarehouseOption`).
- `warehouses.resolveActive(db, ctx, subWarehouseIds)` — hujjat servislari uchun server himoyasi (T-404+): boshqa do'konniki/yo'q → `NOT_FOUND { entity: 'sub_warehouse' }`; ombori arxivda → `ENTITY_ARCHIVED { entity: 'warehouse', name }`; o'zi arxivda → `ENTITY_ARCHIVED { entity: 'sub_warehouse', name }`. Natija — `sub-ombor id → ombor id` (§2 2-qadamda qulflanadigan omborlar). Qoralama saqlashda bir marta chaqiriladi; **bajarish/storno'da 2-qadamdan keyin yana chaqiriladi** (qulf ostidagi arxiv holati yakuniy).
- Yaratish/tahrirlash/arxivlash/tiklash — `warehouse.write` (Egasi ham, Xodim ham), kiritma `@drinks/shared/schemas` (`warehouse*InputSchema`, `subWarehouseCreateInputSchema`: nom trim, 1–100):
  - `warehouses.create/rename/archive/restore`, `subWarehouses.create/rename/archive/restore`.
  - `subWarehouses.create({ warehouseId })` — `warehouseId` do'kondagi **ombor** bo'lishi shart: sub-ombor id'si berilsa → `NOT_FOUND { entity: 'warehouse' }` (3-daraja yo'q). Ota ombor `FOR SHARE` (2-qadam) qulflanadi; arxivda bo'lsa → `ENTITY_ARCHIVED`.
- **Nom takrori** (katta-kichik harfga sezgirsiz, arxivdagilar ham, T-302 kabi) → `DUPLICATE_VALUE { entity: 'warehouse' | 'sub_warehouse', field: 'name', archived }`: ombor nomi — **do'kon** bo'yicha, sub-ombor nomi — **ombor** bo'yicha (boshqa omborda bir xil nom mumkin). DB unique (`store_id, name` / `warehouse_id, name`) parallel so'rovda P2002 → `DUPLICATE_VALUE`.
- **Arxivlash (FR-2.2):**
  ```
  BEGIN
   1. ombor qatori FOR UPDATE (§2 2-qadam; sub-ombor uchun — uning ombori)
   2. allaqachon arxivda → no-op
   3. omborda DRAFT inventarizatsiya → WAREHOUSE_IN_STOCK_COUNT { warehouseName, stockCountNumber } (OQ-21)
   4. qoldiq (qulf ostida o'qiladi): sub-omborda / ombordagi istalgan sub-omborda qty > 0 →
      ENTITY_NOT_EMPTY { entity, name, subWarehouses? }   (ombor uchun — qoldiqli sub-omborlar nomlari)
   5. archived_at = now(); audit ARCHIVE
  COMMIT
  ```
  **Nega bu yetarli:** har bajarish/storno (savdo, xarid, inventarizatsiya) `stock_balance` ga (7-qadam) tegishidan oldin omborni `FOR SHARE`/`FOR UPDATE` (2-qadam) bilan qulflaydi. Arxivlash `FOR UPDATE` ni olgach: (a) avval boshlangan bajarishlar commit bo'lgan — READ COMMITTED'da keyingi so'rov ularning qoldig'ini ko'radi; (b) keyin boshlanganlari arxivlash commit bo'lguncha kutadi, so'ng `resolveActive` orqali `ENTITY_ARCHIVED` oladi. Shu sababli tekshiruv va arxivlash orasida tovar kira olmaydi. Sub-ombor qatorlari qulf tartibida yo'q — ularning arxivi ham **ota ombor** qatori orqali tartiblanadi. `stock_balance` faqat `inventory.getStockedSubWarehouses` (T-401 moduli) orqali o'qiladi.
- Ombor arxivlanganda sub-omborlari o'z `archived_at` holatini saqlaydi (kaskad yo'q): ombor arxivda ekan ular `options`/`resolveActive` da yo'q; ombor tiklansa, alohida arxivlanmagan sub-omborlar qaytadi. Arxivdagi ombor ichidagi sub-omborni tiklash → `ENTITY_ARCHIVED { entity: 'warehouse' }` (avval omborni tiklang). Tiklash ham ombor qatorini `FOR UPDATE` qiladi.
- Boshqa do'konniki → `NOT_FOUND { entity }`. O'zgarishsiz nom / qayta arxivlash / qayta tiklash — no-op. Arxivdagi tugunni qayta nomlash mumkin.
- Audit: `CREATE` (`after.name`, sub-omborda `after.warehouseId` ham), `UPDATE` (`before/after.name`), `ARCHIVE` / `RESTORE` (`archivedAt`); `entityType` = `warehouse` | `sub_warehouse`.

## 9d. Audit jurnali (T-901, BR-12, BR-13)
- Faqat Egasi (`audit.read`); STAFF — sahifada 403, serverda `FORBIDDEN`. Faqat o'qish: `audit_log` ga yozuvchi yagona — `audit.log` (architecture §5.4).
- Faqat joriy do'kon yozuvlari (`store_id = ctx.storeId`). Do'konsiz yozuvlar (`LOGIN_FAILED`) ko'rsatilmaydi (OQ-25, B).
- Filtrlar: foydalanuvchi yoki "tizim" (`user_id IS NULL`, masalan CLI orqali parol tiklash), obyekt turi, amal, obyekt ID, sana oralig'i — Toshkent kuni bo'yicha `[from 00:00, to+1 00:00)`. 50 tadan, `created_at DESC, id DESC`.
- `before`/`after`/`meta` dan maxfiy kalitlar (`pass…`, `hash`, `token`, `secret`) o'qishda ham olib tashlanadi. `meta.backdated` → "O'tgan sana" belgisi (BR-13).
- Farq: ikkala tomon bo'lsa faqat o'zgargan maydonlar; hujjat qatorlari `lineNo` bo'yicha (qo'shildi / olib tashlandi / o'zgardi).

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
| `WAREHOUSE_IN_STOCK_COUNT` | BR-8; ochiq inventarizatsiyali ombor/sub-omborni arxivlash (OQ-21) |
| `STOCK_COUNT_ALREADY_OPEN` | BR-8 |
| `PAYMENT_SPLIT_MISMATCH` | BR-9 |
| `CASHBOX_INSUFFICIENT` | BR-9 (STAFF uchun xabarda balans summasi ko'rsatilmaydi) |
| `DEBT_HAS_REPAYMENTS` | OQ-04 |
| `DEBT_CANCELLED` | qarz allaqachon bekor qilingan (masalan, ikki marta storno) |
| `DEBT_OVERPAYMENT` | qaytarish > qarz qoldig'i |
| `NOTE_REQUIRED` | boshqa chiqim / qarz izohsiz; nasiya qismli savdo/xarid izohsiz (OQ-19) |
| `ENTITY_NOT_EMPTY` | bo'sh bo'lmagan ombor/sub-omborni arxivlash (FR-2.2; `{ entity, name, subWarehouses? }`, §9c) |
| `ENTITY_ARCHIVED` | arxivlangan mahsulot/omborni hujjatda tanlash; arxivdagi omborga sub-ombor qo'shish yoki uning sub-omborini tiklash (§9c) |
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
| Faolsizlantirish / faollashtirish | OWNER | O'zini faolsizlantira olmaydi (`FORBIDDEN`). Faolsizlantirilganda sessiyalar o'chiriladi |
| O'z login/parolini o'zgartirish | OWNER | Joriy parol talab qilinadi (`CURRENT_PASSWORD_INVALID`). Boshqa sessiyalar o'chiriladi, joriysi qoladi (OQ-22) |
| O'z akkauntini ko'rish | Hamma | "Mening akkauntim": Xodim faqat ko'radi (F.I.O, login, rol) |
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

Foydalanuvchilarni boshqarish (T-204, `packages/server/src/modules/users`, kiritmalar — `@drinks/shared/schemas` `users.ts`):
- Barcha funksiyalar birinchi qatorda `assertCan(ctx.user, 'user.manage')` — Xodim → `FORBIDDEN { permission }`, hech narsa yozilmaydi.
- Login sxemasi `usernameSchema`: trim → kichik harf → `^[a-z0-9._-]{3,32}$` (DB `user_username_format` CHECK bilan bir xil). Login global yagona; kichik harfda saqlangani uchun solishtirish katta-kichik harfga sezgirsiz, faolsiz akkauntlar logini ham band → `DUPLICATE_VALUE { entity: 'user', field: 'username' }`; parallel so'rovdagi P2002 ham shunga aylanadi. F.I.O — trim, 1–100. Parol — `passwordSchema` (8–128).
- `list(ctx)` — tashkilot akkauntlari (`UserAccount` DTO, hashsiz): avval OWNER, keyin faollar, faolsizlar, F.I.O bo'yicha.
- `create(ctx, { fullName, username, password, locale })` — rol doim `STAFF` (kiritmada rol yo'q; yagona OWNER — `user_single_owner`), `created_by_id = ctx.user.id`; shu login bo'yicha `login_attempt` qatorlari tozalanadi. Audit `USER_CREATE` (`after = { username, fullName, role, locale, isActive }`).
- `update(ctx, { id, fullName, username, locale })` — faqat o'zgargan maydonlar yoziladi (o'zgarish yo'q → no-op, auditsiz). Login o'zgarsa — barcha sessiyalar va eski/yangi login bo'yicha `login_attempt` o'chiriladi. Audit `USER_UPDATE` (`before`/`after` — faqat o'zgargan maydonlar; login o'zgarsa `meta = { sessionsRevoked, attemptsCleared }`).
- `setPassword(ctx, { id, password })` — yangi hash + `password_changed_at`, barcha sessiyalar va login bo'yicha `login_attempt` o'chiriladi; faolsiz akkaunt faolsizligicha qoladi. Audit `PASSWORD_RESET` (`meta = { username, source: 'owner', sessionsRevoked, attemptsCleared }`).
- `deactivate` / `activate(ctx, { id })` — `is_active`; faolsizlantirishda barcha sessiyalar o'chiriladi. Qayta bosish — no-op. Audit `USER_DEACTIVATE` (`meta.sessionsRevoked`) / `USER_ACTIVATE`, `before/after.isActive`.
- Nishon tekshiruvi (`update`, `setPassword`, `deactivate`, `activate`): boshqa tashkilotniki → `NOT_FOUND { entity: 'user' }`; o'zi → `FORBIDDEN { reason: 'self' }` (shu jumladan o'zini faolsizlantirish); OWNER akkaunti → `FORBIDDEN { reason: 'owner' }`. Egasi o'zinikini faqat "Mening akkauntim" orqali o'zgartiradi.
- "Mening akkauntim" (OWNER): `updateOwnProfile(ctx, { fullName })` (parolsiz, audit `USER_UPDATE`); `changeOwnUsername(ctx, { currentPassword, username }, currentSessionToken)` va `changeOwnPassword(ctx, { currentPassword, newPassword }, currentSessionToken)` — joriy parol argon2 bilan tekshiriladi (noto'g'ri → `CURRENT_PASSWORD_INVALID`), so'ng bitta tranzaksiyada o'zgartirish, **joriy sessiyadan tashqari** barcha sessiyalar (OQ-22) va login bo'yicha `login_attempt` o'chiriladi. Audit: `USER_UPDATE` (`before/after.username`, `meta = { source: 'self', sessionsRevoked, attemptsCleared }`) / `PASSWORD_RESET` (`meta = { username, source: 'self', … }`). `currentSessionToken` — cookie qiymati (Server Action o'qiydi), servis uning SHA-256 ini saqlab qoladi.
- Xodim o'z login/parolini o'zgartira olmaydi (architecture §11) — `/account` sahifasida unga faqat ma'lumot va "Egasiga murojaat qiling" ko'rsatiladi. Til — header'dagi almashtirgich (`updateOwnLocale`, hamma rol).
- Audit yozuvlarida parol ham, hash ham yo'q (integratsiya testi tekshiradi).

Audit: `LOGIN_FAILED` — `user_id = null`, `entity_id` = foydalanuvchi id yoki (mavjud bo'lmasa) kiritilgan login, `meta = { username, ip, userAgent, reason, failedCount?, lockedUntil? }`; `LOGIN` — `meta = { ip, userAgent }`. Parol, hash va token hech qachon yozilmaydi. Chiqish (`logout`) sessiya qatorini o'chiradi, auditga yozilmaydi.
