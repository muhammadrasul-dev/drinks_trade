# Ish rejasi (vazifalar)

Versiya: 1.0 · Sana: 2026-10-22
Loyihani bosqichma-bosqich qurish rejasi. Har vazifa — **bitta sessiya / bitta PR** hajmida: kod + migratsiya + test + hujjat birga.
Bog'liq: [01-srs.md](01-srs.md) · [architecture.md](architecture.md) · [database.md](database.md) · [business-logic.md](business-logic.md) · [conventions.md](conventions.md)

---

## Qanday ishlatiladi

**Vazifani boshlash.** AI'ga shunday yozing: `T-101 ni bajar`. AI:
1. Promptni `ai-prompts.md` ga yozadi.
2. Vazifaning "Bog'liq" ustunidagi vazifalar `✅` ekanini tekshiradi. Aks holda to'xtaydi va aytadi.
3. "Manba" ustunidagi hujjat bo'limlarini o'qiydi.
4. Ishni bajaradi, "Tayyor bo'lishi uchun" ro'yxatidagi har bir bandni tekshiradi.
5. `pnpm lint && pnpm typecheck && pnpm test` o'tishi shart.
6. Shu fayldagi vazifa holatini yangilaydi, hujjatlarda o'zgarish bo'lsa ularni ham yangilaydi.
7. Qisqa hisobot beradi (o'zbekcha): nima qilindi, qanday tekshirildi, nima qoldi.

**Holatlar:** `⬜` boshlanmagan · `🟡` jarayonda · `✅` tayyor · `⏸` to'xtatilgan (sababi izohda)

**Qoidalar:**
- Bir vaqtda bitta vazifa `🟡` bo'ladi.
- Vazifa ichida noaniqlik chiqsa — taxmin qilinmaydi: `open-questions.md` ga yoziladi va foydalanuvchidan so'raladi.
- Vazifa juda katta chiqsa — `T-xxxa`, `T-xxxb` ga bo'linadi (shu faylda).
- Reja o'zgarsa (yangi vazifa, tartib) — shu fayl yangilanadi, sababi "O'zgarishlar tarixi"ga yoziladi.

---

## Umumiy holat

| Bosqich | Mazmuni | Vazifalar | Holat |
|---|---|---|---|
| 0 | Repo poydevori | T-001 … T-006 | ✅ |
| 1 | Ma'lumotlar bazasi va backend yadrosi | T-101 … T-105 | 🟡 |
| 2 | Auth, foydalanuvchilar, layout, i18n | T-201 … T-205 | ⬜ |
| 3 | Ma'lumotnomalar: mahsulot, ombor | T-301 … T-304 | ⬜ |
| 4 | Zaxira yadrosi va Xarid | T-401 … T-406 | ⬜ |
| 5 | Savdo | T-501 … T-503 | ⬜ |
| 6 | Inventarizatsiya | T-601 … T-603 | ⬜ |
| 7 | Kassa va qarzlar | T-701 … T-704 | ⬜ |
| 8 | Hisobotlar va eksport | T-801 … T-804 | ⬜ |
| 9 | Audit va bosh sahifa | T-901 … T-902 | ⬜ |
| 10 | Yakuniy sinov va relizga tayyorlash | T-1001 … T-1003 | ⬜ |

**Birinchi ishlaydigan natija (MVP):** 0–5-bosqichlardan keyin — login, mahsulot va ombor, xarid, savdo, qoldiq. Shu yerda foydalanuvchi bilan oraliq ko'rik o'tkaziladi.

---

## Bosqich 0 — Repo poydevori

| ID | Vazifa | Bog'liq | Manba | Holat |
|---|---|---|---|---|
| T-001 | Git va monorepo skeleti | — | architecture §3 | ✅ |
| T-002 | Umumiy config paketi (TS, ESLint, Prettier) | T-001 | architecture §3.1, conventions §2–3 | ✅ |
| T-003 | Docker: lokal PostgreSQL | T-001 | architecture §8 | ✅ |
| T-004 | `apps/web` Next.js + Tailwind + `packages/ui` (shadcn) | T-002 | architecture §2, §6 | ✅ |
| T-005 | `packages/shared` va `packages/server` skeleti + Vitest | T-002 | architecture §3, §10 | ✅ |
| T-006 | CI (GitHub Actions): lint, typecheck, test | T-005 | conventions §5–6 | ✅ |

**T-001 — Git va monorepo skeleti**
- `git init`, `main` branch, `.gitignore` (node_modules, .env, .next, storage/), `.editorconfig`, `.nvmrc` (Node 24).
- Root `package.json` (`packageManager: pnpm@…`), `pnpm-workspace.yaml` (`apps/*`, `packages/*`), `turbo.json` (build, dev, lint, typecheck, test).
- Bo'sh papkalar: `apps/web`, `packages/{shared,server,db,ui,config}`, `docker/`.
- Tayyor bo'lishi uchun: `pnpm install` xatosiz o'tadi; `pnpm turbo run lint` bo'sh bo'lsa ham ishlaydi; birinchi commit qilingan.

**T-002 — Config paketi**
- `packages/config`: `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`), ESLint flat config, Prettier.
- ESLint chegaralari (`no-restricted-imports`): `apps/web` → `@prisma/*` va `packages/db` taqiqlangan; `packages/shared` → Prisma va Node modullari taqiqlangan.
- Tayyor bo'lishi uchun: taqiqlangan import yozilsa lint xato beradi (sinov fayli bilan tekshiriladi va o'chiriladi).

**T-003 — Docker PostgreSQL**
- `docker/compose.dev.yml`: `postgres:17-alpine`, port `5433`, volume `pgdata`, healthcheck; init skript `drinks_trade` va `drinks_trade_test` bazalarini yaratadi; `adminer` (`profiles: [tools]`).
- `.env.example` (architecture §8.2); root skriptlar `db:up`, `db:down`, `db:logs`.
- Tayyor bo'lishi uchun: `pnpm db:up` → konteyner `healthy`; ikkala bazaga `psql` bilan ulanish mumkin.

**T-004 — Next.js ilova**
- `apps/web`: Next.js (App Router, `src/`), TypeScript, Tailwind v4, `output: 'standalone'`.
- `packages/ui`: shadcn/ui init, boshlang'ich komponentlar (button, input, label, card, dialog, dropdown-menu, table, select, sonner/toast, form).
- `/api/health` (hozircha DB'siz, `{ ok: true }`).
- Tayyor bo'lishi uchun: `pnpm dev` → `localhost:3000` ochiladi, `packages/ui` dagi Button ko'rinadi; `pnpm build` o'tadi.

**T-005 — shared va server skeleti**
- `packages/shared`: `errors.ts` (`ErrorCode`, `DomainError`, `ActionResult`), `enums.ts`, `permissions.ts` (architecture §5.5 matritsasi), bo'sh `schemas/`.
- `packages/server`: `import 'server-only'`, `core/` papkasi (bo'sh fayllar bilan), `modules/` papkasi.
- Vitest sozlamasi (root + paketlar); `permissions.ts` uchun birinchi unit test.
- Tayyor bo'lishi uchun: `pnpm test` o'tadi; `apps/web` `@drinks/shared` ni import qila oladi.

**T-006 — CI**
- `.github/workflows/ci.yml`: pnpm kesh, `lint`, `typecheck`, `test` (unit). Integratsiya testlari uchun Postgres service konteyner (T-105 dan keyin yoqiladi).
- Tayyor bo'lishi uchun: PR'da CI yashil. (GitHub repo hali bo'lmasa — `⏸`, faqat fayl tayyorlanadi.)
- `integration` job (Postgres 17 service, `drinks_trade_test`) hozircha o'chiq: `if: vars.RUN_INTEGRATION_TESTS == 'true'` — **T-105 da yoqiladi** (shart olib tashlanadi, migratsiya + integratsiya test buyrug'i qo'shiladi).

---

## Bosqich 1 — Ma'lumotlar bazasi va backend yadrosi

| ID | Vazifa | Bog'liq | Manba | Holat |
|---|---|---|---|---|
| T-101 | Prisma sxemasi va birinchi migratsiya | T-003, T-005 | database §4 | ✅ |
| T-102 | Qo'lda SQL migratsiya: CHECK, indekslar, triggerlar | T-101 | database §5 | ✅ |
| T-103 | Seed (prod minimal + dev namunaviy) | T-102 | database §8 | ⬜ |
| T-104 | Server yadrosi: context, tx, locks, numbering, audit | T-102 | architecture §5, business-logic §2 | ✅ |
| T-105 | Integratsiya test muhiti + invariant testlari | T-104 | architecture §10 | ⬜ |

**T-101 — Prisma sxemasi**
- `packages/db/prisma/schema.prisma` — database §4 bo'yicha, `User` relation'lari to'liq (`createdBy`, `postedBy` …).
- `src/client.ts` — PrismaClient singleton (dev'da hot-reload'ga chidamli).
- Skriptlar: `db:migrate`, `db:studio`, `db:generate`.
- Tayyor bo'lishi uchun: `pnpm db:migrate` toza bazada o'tadi; jadval/ustun nomlari `snake_case`; `shared/enums.ts` Prisma enumlari bilan mos (unit test).

**T-102 — Qo'lda SQL migratsiya**
- database §5 dagi barcha CHECK'lar, partial unique index'lar (bitta ochiq inventarizatsiya, bitta OWNER), append-only triggerlar, `pg_trgm` indeks.
- Tayyor bo'lishi uchun: har bir cheklov uchun integratsiya testi — buzuvchi INSERT/UPDATE xato beradi (`stock_balance.qty = -1`, `audit_log` UPDATE, ikkinchi DRAFT inventarizatsiya, ikkinchi OWNER, kelajak sanali savdo).

**T-103 — Seed**
- `seed.ts`: organization, store, 2 kassa, OWNER (env'dan), `doc_sequence`. Idempotent (qayta ishga tushsa takrorlamaydi).
- `seed.dev.ts`: 2 ombor × 2–3 sub-ombor, 10–15 mahsulot (toifa, brend), 2 ta xodim.
- Tayyor bo'lishi uchun: `pnpm db:reset && pnpm db:seed` ishlaydi; ikki marta ishga tushirish xato bermaydi.

**T-104 — Server yadrosi**
- `core/context.ts` (`ServiceContext`), `core/tx.ts` (`withTransaction`), `core/locks.ts` (business-logic §2 tartibidagi `lockSale`, `lockWarehouses`, `lockCashboxes`, `lockProductCosts`, `lockStockBalances` …), `core/rbac.ts` (`assertCan`), `core/numbering.ts` (`S-000001`, `P-…`, `I-…`).
- `modules/audit`: `audit.log(tx, …)`, `backdated` belgisi.
- Pul/Decimal konvertorlari (ADR-008).
- Tayyor bo'lishi uchun: numbering parallel chaqiruvlarda takror raqam bermaydi (test); `assertCan` STAFF uchun `cash.read` da `FORBIDDEN` beradi.

**T-105 — Test muhiti**
- `drinks_trade_test` bazasi uchun migratsiya + har test faylidan oldin `TRUNCATE` helper; test fabrikalari (`makeProduct`, `makeWarehouse`, `makeUser` …).
- Invariant tekshiruvchi helper: `stock_balance = Σ movements`, `product_cost.total_qty = Σ balances`, `cashbox.balance = Σ transactions` — keyingi barcha integratsiya testlari oxirida chaqiriladi.
- CI'da integratsiya testlari yoqiladi: `.github/workflows/ci.yml` dagi `integration` job'i (T-006 da tayyorlangan) — `if:` sharti olib tashlanadi, migratsiya + `pnpm test:int` qadamlari qo'shiladi.
- Tayyor bo'lishi uchun: `pnpm test:int` lokal va CI'da o'tadi.

---

## Bosqich 2 — Auth, foydalanuvchilar, layout, i18n

| ID | Vazifa | Bog'liq | Manba | Holat |
|---|---|---|---|---|
| T-201 | Auth: login, logout, sessiya, urinishlar cheklovi | T-104 | architecture §11–12, ADR-006, business-logic §11 | ⬜ |
| T-202 | i18n (uz/ru) va til almashtirgich | T-004 | architecture §7, ADR-014 | ⬜ |
| T-203 | Ilova layout'i: sidebar (rolga qarab), header, action wrapper | T-201, T-202 | architecture §4, §6 | ⬜ |
| T-204 | Foydalanuvchilarni boshqarish (OWNER) | T-203 | architecture §11, business-logic §11 | ⬜ |
| T-205 | CLI: Egasi parolini tiklash | T-201 | business-logic §11 | ⬜ |

**T-201 — Auth**
- `modules/auth`: argon2id hash, `login` (kichik harfga o'girish, vaqt bo'yicha teng tekshiruv), `logout`, `getSession`, sirpanuvchi 30 kunlik muddat, 5 xato → 15 daqiqa blok.
- `middleware.ts`: sessiyasiz → `/[locale]/login`. Login sahifasi (UI).
- Audit: `LOGIN`, `LOGIN_FAILED`.
- Tayyor bo'lishi uchun: to'g'ri/noto'g'ri login, faolsiz foydalanuvchi, 6-urinish bloki — integratsiya testlari; cookie `httpOnly`.

**T-202 — i18n**
- next-intl, `/uz` va `/ru` yo'llari, default `uz`; `messages/uz.json`, `ru.json` (modul bo'yicha kalitlar, `errors.*`, `enums.*`).
- Til almashtirgich → `user.locale` saqlanadi.
- Tayyor bo'lishi uchun: login sahifasi ikki tilda; ikki tildagi kalitlar soni bir xil (test).

**T-203 — Layout**
- `(app)` layout: sidebar (`permissions.ts` bo'yicha menyu), header (til, foydalanuvchi menyusi, chiqish), inventarizatsiya banneri uchun joy.
- `lib/action.ts` — Server Action wrapper (sessiya, zod, `DomainError` → `ActionResult`).
- Umumiy UI: `MoneyText`, `QtyText` (blok + dona), `DataTable` (TanStack), `PageHeader`, `ConfirmDialog`.
- Tayyor bo'lishi uchun: STAFF menyusida Kassa, Qarzlar, P&L, Foydalanuvchilar, Audit yo'q; URL orqali kirsa 403 sahifasi chiqadi.

**T-204 — Foydalanuvchilar**
- OWNER: xodimlar ro'yxati, yaratish, tahrirlash (F.I.O, login, til), parol o'rnatish, faolsizlantirish/faollashtirish; "Mening akkauntim" (joriy parol bilan login/parolni o'zgartirish).
- Login/parol o'zgarsa yoki akkaunt faolsizlantirilsa — sessiyalar o'chadi.
- Tayyor bo'lishi uchun: STAFF bu amallarni bajara olmaydi (test); OWNER o'zini faolsizlantira olmaydi; takroriy login → `DUPLICATE_VALUE`; audit yozuvlarida parol yo'q.

**T-205 — CLI**
- `pnpm user:reset-password <login>` — interaktiv yangi parol, sessiyalarni o'chiradi, audit yozadi.
- Tayyor bo'lishi uchun: skript lokal bazada ishlaydi.

---

## Bosqich 3 — Ma'lumotnomalar

| ID | Vazifa | Bog'liq | Manba | Holat |
|---|---|---|---|---|
| T-301 | `shared`: birliklar, pul, tannarx formulalari | T-005 | business-logic §1 | ⬜ |
| T-302 | Toifa va brend | T-203 | FR-1.1 | ⬜ |
| T-303 | Mahsulotlar (CRUD, arxiv, rasm, kam qoldiq belgisi) | T-301, T-302 | FR-1.1–1.3, database §6.1, OQ-06, OQ-15 | ⬜ |
| T-304 | Omborlar va sub-omborlar | T-203 | FR-2.1–2.2 | ⬜ |

**T-301 — Formulalar**
- `units.ts` (`toPieces`, `splitPieces`, `formatQty`), `money.ts` (`formatSom`, `roundHalfUp`), `costing.ts` (`avgOnReceipt`, `avgOnPurchaseReversal` — 0 chegarasi bilan).
- Tayyor bo'lishi uchun: 100% unit test qamrovi; SRS misoli (20 dona, blok=6 → "3 blok 2 dona") testda bor.

**T-302 — Toifa va brend**
- Oddiy ro'yxat + dialog orqali qo'shish/tahrirlash/arxivlash; mahsulot formasida tanlov.
- Tayyor bo'lishi uchun: takroriy nom → `DUPLICATE_VALUE`.

**T-303 — Mahsulotlar**
- Ro'yxat (qidiruv: nom, SKU, shtrix-kod; filtr: toifa, brend, arxiv), forma (barcha FR-1.1 maydonlari), narx 1 dona uchun + blok narxi avtomatik ko'rsatiladi.
- Blokdagi dona sonini o'zgartirishda ogohlantirish dialogi (OQ-06).
- Rasm: `StorageAdapter` (lokal disk), ≤ 2 MB, 512px gacha kichraytirish.
- Arxivlash (o'chirish yo'q); kam qoldiq belgisi (qoldiq hozircha 0 — belgi T-401 dan keyin to'liq ishlaydi).
- Tayyor bo'lishi uchun: STAFF ham yaratadi/tahrirlaydi; SKU/shtrix-kod takrorlanmaydi; audit yoziladi.

**T-304 — Omborlar**
- Ombor → sub-omborlar daraxti (2 daraja), yaratish/tahrirlash/arxivlash.
- Bo'sh bo'lmagan ombor/sub-omborni arxivlash → `ENTITY_NOT_EMPTY` (test T-405 dan keyin to'liq).
- Tayyor bo'lishi uchun: 3-daraja yaratib bo'lmaydi; arxivlangan sub-ombor hujjatlarda tanlanmaydi.

---

## Bosqich 4 — Zaxira yadrosi va Xarid

| ID | Vazifa | Bog'liq | Manba | Holat |
|---|---|---|---|---|
| T-401 | Zaxira servisi: balans, tannarx, harakatlar | T-104, T-301 | business-logic §1.3, §2, ADR-007 | ⬜ |
| T-402 | Kassa yadrosi (ichki servis, UI'siz) | T-104 | business-logic §7 | ⬜ |
| T-403 | Qarz yadrosi (ichki servis, UI'siz) | T-402 | BR-10, business-logic §7 | ⬜ |
| T-404 | Xarid qoralamasi (servis + UI) | T-303, T-304 | FR-4.1–4.2, business-logic §5.1 | ⬜ |
| T-405 | Xaridni bajarish | T-401, T-402, T-403, T-404 | BR-4, BR-6, business-logic §5.2 | ⬜ |
| T-406 | Xarid storno'si | T-405 | BR-3, OQ-09, business-logic §5.3 | ⬜ |

**T-401 — Zaxira servisi**
- `modules/inventory`: `receive(tx, …)`, `issue(tx, …)`, `adjust(tx, …)`, qoldiq so'rovlari (`getAvailable`, `getProductTotals`). Yagona yozish nuqtasi `stock_balance` / `product_cost` / `stock_movement` uchun.
- Tayyor bo'lishi uchun: tannarx formulasi DB bilan birga testlangan; invariant helper o'tadi.

**T-402 / T-403 — Kassa va qarz yadrosi**
- `cash.record(tx, …)` (balans tekshiruvi, `balance_after`), `debts.open(tx, …)`, `debts.cancel(tx, …)`.
- Tayyor bo'lishi uchun: kassa manfiy bo'lmaydi (`CASHBOX_INSUFFICIENT`); STAFF uchun xabarda summa yo'q.

**T-404 — Xarid qoralamasi**
- Ro'yxat (holat, sana, raqam filtrlari), forma: qatorlar (mahsulot, sub-omborga, dona/blok, narx), to'lov qismlari, izoh, sana (kelajak sana yo'q). Saqlash / O'chirish.
- Optimistik `version`; istalgan foydalanuvchi tahrirlay oladi (OQ-14).
- Tayyor bo'lishi uchun: `DOC_DATE_IN_FUTURE`, `DOCUMENT_CHANGED` testlari.

**T-405 — Xaridni bajarish**
- business-logic §5.2 to'liq; "Bajarish" tugmasi.
- Tayyor bo'lishi uchun: testlar — tannarx qayta hisoblanadi (bo'sh va bo'sh bo'lmagan qoldiqda), naqd+karta+nasiya bo'linishi, kassa yetmasa xato, nasiya → `PAYABLE` qarz, `UNITS_PER_BLOCK_CHANGED`, audit.

**T-406 — Xarid storno'si**
- Faqat OWNER; sabab maydoni.
- Tayyor bo'lishi uchun: testlar — qoldiq yetmasa bloklanadi (BR-3 xabari), qaytarilgan qarz bo'lsa bloklanadi (OQ-04), tannarx qayta hisob va 0 chegarasi (OQ-09), STAFF → `FORBIDDEN`.

---

## Bosqich 5 — Savdo

| ID | Vazifa | Bog'liq | Manba | Holat |
|---|---|---|---|---|
| T-501 | Savdo qoralamasi (qoldiq ogohlantirishi bilan) | T-405 | FR-3.1–3.3, business-logic §4.1 | ⬜ |
| T-502 | Savdoni bajarish + parallel test | T-501 | BR-5, BR-7, business-logic §4.2 | ⬜ |
| T-503 | Savdo storno'si | T-502 | BR-3, OQ-01, OQ-03, OQ-04, business-logic §4.3 | ⬜ |

**T-501 — Savdo qoralamasi**
- Forma: mahsulot (nom/shtrix-kod qidiruvi), sub-ombordan, dona/blok, narx (o'qish uchun, 1 dona narxidan), qatorda mavjud qoldiq va qizil xato; jami; to'lov qismlari.
- Tayyor bo'lishi uchun: qoldiq yetmasa saqlanadi, lekin "Bajarish" o'chiq (FR-3.3).

**T-502 — Savdoni bajarish**
- business-logic §4.2 to'liq; tannarx qatorda muzlatiladi.
- Tayyor bo'lishi uchun: testlar — **ikki parallel savdo oxirgi qoldiqni olishga harakat qiladi → bittasi o'tadi, ikkinchisi `INSUFFICIENT_STOCK`**; nasiya → `RECEIVABLE`; kassa kirimi; invariantlar.
- **MVP nazorat nuqtasi:** foydalanuvchi bilan oraliq ko'rik.

**T-503 — Savdo storno'si**
- Faqat OWNER; tovar savdodagi tannarx bilan qaytadi va o'rtacha tannarx qayta hisoblanadi; pul kassadan qaytadi (balans tekshiruvi); qarz bekor.
- Tayyor bo'lishi uchun: OQ-04 bloki, kassa yetmasa bloki, P&L asl sanadan chiqadi (T-803 da tekshiriladi).

---

## Bosqich 6 — Inventarizatsiya

| ID | Vazifa | Bog'liq | Manba | Holat |
|---|---|---|---|---|
| T-601 | Inventarizatsiyani ochish, tahrirlash, bekor qilish + ombor bloki | T-502 | BR-8, business-logic §3, §6.1, §6.3 | ⬜ |
| T-602 | Inventarizatsiyani bajarish | T-601 | BR-8, OQ-13, business-logic §6.2 | ⬜ |
| T-603 | Ochiq inventarizatsiya banneri | T-601 | BR-8 | ⬜ |

**T-601** — ochish (bitta ombor uchun bitta DRAFT), sanoq formasi (sub-ombor × mahsulot, blok + dona, tizim qoldig'i va farq ustunlari), bekor qilish. Savdo/xarid bajarish va storno'ga blok tekshiruvi qo'shiladi.
Tayyor bo'lishi uchun: ochiq inventarizatsiya bor omborda savdo/xarid bajarish va storno → `WAREHOUSE_IN_STOCK_COUNT`; boshqa ombor bloklanmaydi; qoralama yaratish mumkin.

**T-602** — bajarish: qoldiq tenglashadi, ombor jami bo'yicha kamomad/ortiqcha natijalari yoziladi, sub-omborlar orasidagi farq P&L'ga ta'sir qilmaydi; "N ta qator sanalmadi" ogohlantirishi.
Tayyor bo'lishi uchun: testlar — SRS'dagi 3 holat (kamomad, ortiqcha, faqat joylashuv farqi); sanalmagan qator o'zgarmaydi; STAFF summani ko'rmaydi.

**T-603** — barcha sahifalarda sariq banner: "X ombor inventarizatsiyada (I-000007)" + havola.

---

## Bosqich 7 — Kassa va qarzlar (faqat OWNER)

| ID | Vazifa | Bog'liq | Manba | Holat |
|---|---|---|---|---|
| T-701 | Kassa sahifasi: balanslar va jurnal | T-402 | FR-6.1 | ⬜ |
| T-702 | Kassa amallari: yo'l kira, boshqa chiqim, o'tkazma | T-701 | FR-6.2–6.3, BR-9 | ⬜ |
| T-703 | Qo'lda kiritilgan kassa yozuvi storno'si | T-702 | OQ-08, business-logic §7 | ⬜ |
| T-704 | Qarzlar: ro'yxat, berish/olish, qaytarish | T-403, T-701 | FR-7.1–7.2, BR-10 | ⬜ |

Tayyor bo'lishi uchun (umumiy): STAFF hech bir endpoint'ga kira olmaydi (test); kassa manfiy bo'lmaydi; boshqa chiqim va qarzda izoh majburiy; o'tkazma ikki yozuv bitta `transfer_group_id` bilan; qarzni ortiqcha qaytarib bo'lmaydi; to'liq qaytgan qarz `CLOSED`; storno qilingan yo'l kira P&L'dan chiqadi.

---

## Bosqich 8 — Hisobotlar va eksport

| ID | Vazifa | Bog'liq | Manba | Holat |
|---|---|---|---|---|
| T-801 | Mahsulotlar qoldig'i hisoboti | T-405 | SRS §7.1, database §7.1 | ⬜ |
| T-802 | Savdo hisoboti (rolga qarab ustunlar) | T-503 | SRS §7.2, database §7.2 | ⬜ |
| T-803 | P&L hisoboti | T-503, T-602, T-703 | BR-11, business-logic §8, database §7.3 | ⬜ |
| T-804 | PDF va Excel eksport | T-801, T-802, T-803 | ADR-010, architecture §4.3 | ⬜ |

Tayyor bo'lishi uchun (umumiy): STAFF savdo hisobotida tannarx/foyda maydonlari **server javobida yo'q** (test); P&L — kun/oy/yil/oraliq filtrlari, Toshkent vaqti chegaralari; P&L formulasi qo'lda hisoblangan misol bilan solishtirib testlanadi; eksportlar ikki tilda, kirill harflari PDF'da to'g'ri.

---

## Bosqich 9 — Audit va bosh sahifa

| ID | Vazifa | Bog'liq | Manba | Holat |
|---|---|---|---|---|
| T-901 | Audit jurnali sahifasi (OWNER) | T-104 | BR-12, BR-13 | ⬜ |
| T-902 | Bosh sahifa (dashboard) | T-603, T-801 | FR-1.3 | ⬜ |

**T-901** — filtrlar (foydalanuvchi, obyekt turi, amal, sana), eski/yangi qiymat farqi, "o'tgan sana" belgisi.
**T-902** — kam qolgan mahsulotlar, ochiq inventarizatsiyalar, bajarilmagan qoralamalar soni. Yangi hisobot yo'q (SRS §7 — faqat 3 ta hisobot).

---

## Bosqich 10 — Yakuniy sinov va relizga tayyorlash

| ID | Vazifa | Bog'liq | Manba | Holat |
|---|---|---|---|---|
| T-1001 | E2E testlar (Playwright) | T-902 | architecture §10 | ⬜ |
| T-1002 | Hujjatlarni yakunlash (user-guide skrinshotlar bilan) | T-1001 | user-guide | ⬜ |
| T-1003 | Production Docker va deploy | T-1001, OQ-12 | architecture §8.4 | ⏸ OQ-12 kutilmoqda |

**T-1001** — oqimlar: login → mahsulot → xarid → savdo → qoldiq hisoboti; STAFF foyda/kassani ko'rmaydi; inventarizatsiya bloki; til almashtirish.

---

## O'zgarishlar tarixi

| Sana | O'zgarish |
|---|---|
| 2026-10-22 | Birinchi versiya (Prompt 11) |
| 2026-10-22 | T-001 bajarildi (Prompt 12). pnpm 12 o'rniga pnpm 10.34.7: corepack 0.32 pnpm 12 native binary'sini ishga tushira olmadi |
| 2026-10-22 | T-002 bajarildi (Prompt 14). Og'ishlar: (1) lint turbo orqali emas, root'da bitta `eslint .` (turbo.json dan `lint` vazifasi olib tashlandi) — chegaralar butun repoga yo'l bo'yicha qo'llanadi; (2) TypeScript 6.0.3 (7.x typescript-eslint 8.72 bilan mos emas); (3) Prettier `*.md` hujjatlarga tegmaydi |
| 2026-10-22 | T-003 fayllari tayyor (Prompt 15): `docker/compose.dev.yml`, init SQL, `.env.example`, `db:up/down/logs`. Holat ⏸: mashinada Docker yo'q, `pnpm db:up` + `psql` tekshiruvi Docker Desktop o'rnatilgach bajariladi |
| 2026-10-22 | T-003 runtime tekshiruvi o'tdi: `pnpm db:up` → healthy, ikkala bazaga 5433 orqali ulanildi. Docker Desktop o'rnatilgan edi, CLI (`~/.docker/bin`) faqat `~/.zprofile` da PATH'ga qo'shilgan |
| 2026-10-22 | T-004 bajarildi (Prompt 17): Next.js 16.4.2 + Tailwind 4.3.3 + `packages/ui` (shadcn, 10 komponent), `/api/health`. Og'ishlar: (1) ESLint'ga `uiBoundaries` va `react()` preset (react-hooks + Next.js qoidalari) qo'shildi; (2) bosh sahifadagi matn vaqtincha qattiq yozilgan — `messages/*.json` T-202 da; (3) shadcn CLI `cn` aliasini noto'g'ri `"cn"` npm paketiga aylantirdi — importlar `@drinks/ui/lib/utils` ga tuzatildi, `cn` paketi olib tashlandi; `zod`/`@hookform/resolvers` `ui` ga qo'shilmadi (T-005 `shared` da); (4) `test` vazifasi hali yo'q (0 task, yashil) — Vitest T-005 da |
| 2026-10-22 | T-005 bajarildi (Prompt 18): `@drinks/shared` (`enums.ts`, `errors.ts` — business-logic §10 dagi 25 kod, `permissions.ts` + `can()`, bo'sh `schemas/`), `@drinks/server` (`server-only`, `core/` stublari, `modules/`), Vitest 5.0.5 (root `projects` + paket configlari), 36 test. Og'ishlar: (1) `core/rbac.ts` dagi `assertCan` hozirdanoq ishlaydi (DB'siz sof funksiya, `FORBIDDEN` testi bilan); `tx`/`locks`/`numbering` — T-104 gacha bo'sh; (2) rol enumi nomi `UserRole` (database §4 Prisma nomi bilan bir xil; architecture §3 izohidagi `Role` emas); (3) turbo `test.outputs` = `[]` (coverage hali yo'q); (4) `apps/web` `@drinks/shared` dan `Locale` ni bosh sahifada ishlatadi (dev va build'da tekshirildi) |
| 2026-10-22 | T-006 fayli tayyor (Prompt 20): `.github/workflows/ci.yml` — Node `.nvmrc` dan, pnpm `packageManager` dan, pnpm kesh; `lint`, `format:check`, `typecheck`, `test`, `build` (build ~5 s, env talab qilmaydi). `integration` job (postgres:17-alpine) T-105 gacha o'chiq — `if: false` o'rniga `vars.RUN_INTEGRATION_TESTS` sharti (actionlint doimiy shartni xato deb hisoblaydi). Lokal tekshiruv: actionlint 1.7.12 toza, Node 24 da barcha buyruqlar o'tdi. Holat ⏸: GitHub repo/remote yo'q |
| 2026-10-22 | T-006 bajarildi (Prompt 21): remote `github.com/muhammadrasul-dev/drinks_trade` (private), `main` push qilindi; CI run yashil (check job ~1 daq, integration — skipped). Node 20 ogohlantirishi sababli action'lar yangilandi: `actions/checkout@v7`, `pnpm/action-setup@v6`, `actions/setup-node@v7` — qayta run ham yashil. 0-bosqich yopildi |
| 2026-10-22 | T-101 bajarildi (Prompt 22): `@drinks/db` — Prisma 7.10.1 (`prisma-client` generator, `@prisma/adapter-pg`, `prisma.config.ts` root `.env` dan), `src/client.ts` singleton, migratsiya `init` (25 jadval, 243 ustun, hammasi snake_case; toza bazada `pnpm db:migrate` o'tdi), `db:generate/migrate/studio`, `postinstall` da generate (CI'da DB kerak emas), enum sinxron testi (`packages/db/test/enums.test.ts`, 13 enum, ikki tomonlama). Og'ishlar: (1) Prisma 7 da `url` sxemada emas — `prisma.config.ts` da; (2) §4 dagi qisqartirilgan relation'lar to'ldirildi: `User` dan tashqari barcha `*_id` ustunlar ham FK (`store_id`, jurnal → hujjat qatori, `debt_repayment → cash_transaction` …), jurnallardagi ixtiyoriy FK'lar `onDelete: Restrict` — database §4 eslatmasida; (3) `@drinks/shared` ga `./enums` export qo'shildi (test faqat enumlarni solishtirishi uchun); (4) `src/generated/` ESLint/Prettier/git'dan chiqarildi; (5) pnpm `@prisma/engines`/`prisma` build skriptlarini bloklaydi — migrate/generate busiz ishlaydi, ruxsat berilmadi |
| 2026-10-22 | T-102 bajarildi (Prompt 24): migratsiya `20261022121351_constraints` (qo'lda SQL) — database §5 dagi barcha CHECK'lar, partial unique index'lar (`stock_count_one_open_per_warehouse`, `user_single_owner`), `forbid_modify()` append-only triggerlari (`audit_log`, `stock_movement`, `cash_transaction`), `pg_trgm` + `product_name_trgm`. `prisma migrate dev` ikki marta — "Already in sync" (drift yo'q); bo'sh `drinks_trade_test` da ikkala migratsiya toza qo'llandi. Minimal `pnpm test:int` (`packages/db/vitest.int.config.ts`, globalSetup `prisma migrate deploy` → `DATABASE_URL_TEST`, nomi `*_test` bo'lishi shart; har test tranzaksiyada, oxirida ROLLBACK; `pg` drayveri dev-dep) — 39 test: har cheklov uchun buzuvchi INSERT/UPDATE/DELETE (SQLSTATE + cheklov nomi) va ijobiy nazorat. `pnpm test` DB'siz qoladi. Og'ishlar: (1) kelajak sana qo'pol himoyasi `stock_count`, `cash_transaction`, `debt`, `debt_repayment` sanalariga ham qo'yildi (§6.3); (2) `postgresqlExtensions`/`partialIndexes` Prisma 7.10 da preview — faqat SQL, `schema.prisma` o'zgarmadi (database §5 eslatmasi); (3) dev bazada `prisma migrate reset --force` Prisma'ning AI-rozilik himoyasi tufayli bajarilmadi — toza qo'llanish bo'sh test bazasida tekshirildi |
| 2026-10-22 | T-104 bajarildi (T-102 sessiyasi ishga tushirgan alohida sessiya): `packages/server/src/core` — `tx.ts` (`withTransaction`, READ COMMITTED; `@drinks/db` dinamik import → unit testlar va build `DATABASE_URL` siz ishlaydi), `locks.ts` (business-logic §2 dagi 7 qadam + `assertLockOrder` himoyasi), `numbering.ts` (`nextDocNumber`: `doc_sequence` upsert, `S-/P-/I-` + 6 raqam), `money.ts` (ADR-008), `modules/audit` (`audit.log`, `isBackdated`, `toAuditJson`). Testlar: 18 unit (DB'siz) + `packages/server` `test:int` — 11 integratsiya testi (40 parallel chaqiruvda takror raqam yo'q va ketma-ket; rollback'da bo'shliq qoladi; barcha qulflar, `FOR UPDATE` kutishi; audit tranzaksiya bilan birga rollback bo'ladi); root `test:int` endi `@drinks/db` + `@drinks/server`. Og'ishlar: (1) `lockProductCosts`/`lockStockBalances` yo'q qatorlarni 0 qiymat bilan yaratadi; (2) kassalar `type::text` bo'yicha tartiblanadi (`CARD`, `CASH`); (3) `audit.log` imzosi `(tx, actor, entry)`, tizim hodisalari uchun `actor.user = null`. business-logic §2, architecture §5.3–5.4 va §8.3, ADR-008 yangilandi |
