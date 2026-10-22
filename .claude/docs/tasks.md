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
| 1 | Ma'lumotlar bazasi va backend yadrosi | T-101 … T-105 | ✅ |
| 2 | Auth, foydalanuvchilar, layout, i18n | T-201 … T-205 | ✅ |
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
- `integration` job (Postgres 17 service, `drinks_trade_test`) T-006 da o'chiq edi: `if: vars.RUN_INTEGRATION_TESTS == 'true'` — **T-105 da yoqildi** (shart olib tashlandi, `pnpm test:int` qadami qo'shildi).

---

## Bosqich 1 — Ma'lumotlar bazasi va backend yadrosi

| ID | Vazifa | Bog'liq | Manba | Holat |
|---|---|---|---|---|
| T-101 | Prisma sxemasi va birinchi migratsiya | T-003, T-005 | database §4 | ✅ |
| T-102 | Qo'lda SQL migratsiya: CHECK, indekslar, triggerlar | T-101 | database §5 | ✅ |
| T-103 | Seed (prod minimal + dev namunaviy) | T-102 | database §8 | ✅ |
| T-104 | Server yadrosi: context, tx, locks, numbering, audit | T-102 | architecture §5, business-logic §2 | ✅ |
| T-105 | Integratsiya test muhiti + invariant testlari | T-104 | architecture §10 | ✅ |

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
| T-201 | Auth: login, logout, sessiya, urinishlar cheklovi | T-104 | architecture §11–12, ADR-006, business-logic §11 | ✅ |
| T-202 | i18n (uz/ru) va til almashtirgich | T-004 | architecture §7, ADR-014 | ✅ |
| T-203 | Ilova layout'i: sidebar (rolga qarab), header, action wrapper | T-201, T-202 | architecture §4, §6 | ✅ |
| T-204 | Foydalanuvchilarni boshqarish (OWNER) | T-203 | architecture §11, business-logic §11 | ✅ |
| T-205 | CLI: Egasi parolini tiklash | T-201 | business-logic §11 | ✅ |

**T-201 — Auth**
- `modules/auth`: argon2id hash, `login` (kichik harfga o'girish, vaqt bo'yicha teng tekshiruv), `logout`, `getSession`, sirpanuvchi 30 kunlik muddat, 5 xato → 15 daqiqa blok.
- `proxy.ts` (Next.js 16 da `middleware.ts` o'rniga; T-202 da locale uchun yaratilgan): sessiyasiz → `/[locale]/login`. Login sahifasi (UI) — T-202 dagi placeholder `app/[locale]/(auth)/login/page.tsx` almashtiriladi. `saveUserLocale` (`features/i18n/actions.ts`) ni `user.locale` ga ulash.
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
| T-301 | `shared`: birliklar, pul, tannarx formulalari | T-005 | business-logic §1 | ✅ |
| T-302 | Toifa va brend | T-203 | FR-1.1 | ✅ |
| T-303 | Mahsulotlar (CRUD, arxiv, rasm, kam qoldiq belgisi) | T-301, T-302 | FR-1.1–1.3, database §6.1, OQ-06, OQ-15 | ✅ |
| T-304 | Omborlar va sub-omborlar | T-203 | FR-2.1–2.2 | ✅ |

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
| T-401 | Zaxira servisi: balans, tannarx, harakatlar | T-104, T-301 | business-logic §1.3, §2, ADR-007 | ✅ |
| T-402 | Kassa yadrosi (ichki servis, UI'siz) | T-104 | business-logic §7 | ✅ |
| T-403 | Qarz yadrosi (ichki servis, UI'siz) | T-402 | BR-10, business-logic §7 | ✅ |
| T-404 | Xarid qoralamasi (servis + UI) | T-303, T-304 | FR-4.1–4.2, business-logic §5.1 | ✅ |
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
| 2026-10-22 | T-103 bajarildi (Prompt 26, 28): `packages/db/prisma/seed.ts` (tashkilot, do'kon `Asia/Tashkent`, kassalar CASH "Naqd" / CARD "Karta", OWNER `SEED_OWNER_*` dan, `doc_sequence` SALE/PURCHASE/STOCK_COUNT = 0; idempotent — mavjud OWNER, kassa va hisoblagichlarga tegilmaydi) va `seed.dev.ts` (2 ombor × 3/2 sub-ombor, 5 toifa, 8 brend, 13 mahsulot, 2 xodim). Skriptlar: `db:seed` (`prisma db seed` → `prisma.config.ts` `migrations.seed` = `tsx prisma/seed.ts`), `db:seed:dev`, `db:reset`. Integratsiya testi `packages/db/test/int/seed.int.test.ts` — ikkala seed test bazada ikki marta, sonlar va hash tekshiruvi (jami 43 int test). Dev bazada foydalanuvchi roziligi bilan `pnpm db:reset && pnpm db:seed` (+ qayta `db:seed`) o'tdi. Og'ishlar: (1) argon2id uchun `@node-rs/argon2` 2.2.2 tanlandi (prebuilt, install skriptsiz); `hashPassword` hozircha `seed.ts` da — T-201 `modules/auth` o'z helperini shu kutubxona bilan yozadi (PHC satr mos); (2) `tsx` 4.23.15 dev-dep (generatsiya qilingan client kengaytmasiz import qiladi, Node type-stripping yetmaydi); (3) database §8 dagi dev "xaridlar" va qoldiq qo'shilmadi — faqat servislar orqali (T-4xx); (4) Prisma 7 `migrate reset` seed'ni avtomatik ishlatmaydi, shuning uchun `db:reset && db:seed` |
| 2026-10-22 | T-202 bajarildi (alohida sessiya, `claude/t-202-i18n-d694ad` branch): next-intl 4.14.9 — `/uz`, `/ru` (`localePrefix: 'always'`, default `uz`), barcha sahifalar `app/[locale]/` ostida, `src/i18n/{routing,navigation,request}.ts`, `src/proxy.ts`, tiplangan kalitlar (`src/global.d.ts`); `messages/uz.json`, `ru.json` (`meta`, `localeSwitcher`, `home`, `auth.login`, `errors.*` — 25 kod, `enums.*` — 13 enum); `LocaleSwitcher` (URL + `NEXT_LOCALE` cookie); `apps/web` da Vitest, `test/messages.test.ts` (kalitlar bir xil, bo'sh qiymat yo'q, `errors` = `ErrorCode`, `enums` = shared enumlar). Brauzerda tekshirildi: `/` → `/uz`, `/uz/login` → almashtirgich → `/ru/login` (`lang=ru`, cookie), keyin `/` → `/ru`. Og'ishlar: (1) login sahifasi — faqat tarjima qilingan **placeholder** (o'chiq maydonlar), haqiqiy forma T-201 da; (2) `user.locale` ga saqlash hali yo'q — `features/i18n/actions.ts` dagi `saveUserLocale` Server Action (tiplangan, `HOOK(T-201/T-104)` izohi) almashtirgichdan chaqiriladi, lekin hozircha faqat validatsiya qiladi; (3) Next.js 16 da `middleware.ts` → `proxy.ts` (architecture §3, §4.1, T-201 tavsifi yangilandi); (4) `/` uchun `Accept-Language` ham hisobga olinadi — OQ-16; (5) 404 sahifasi hali Next.js standarti (inglizcha) |
| 2026-10-22 | T-105 bajarildi (T-102 sessiyasidan ishga tushirilgan alohida sessiya, `claude/t-105-test-env-459375` branch): umumiy integratsiya test to'plami `@drinks/db/test-utils` (`packages/db/test-utils/`, README bilan) — `global-setup` (`migrate deploy` → `DATABASE_URL_TEST`, `*_test` himoyasi), `setup` (har test faylidan oldin `truncateAll`; append-only jurnallarda ham ishlashi va `RESTART IDENTITY` testda tekshirildi), fabrikalar (`makeOrganization/Store/User/Category/Brand/Product/Warehouse/SubWarehouse/Cashbox`, `makeStoreFixture`), `assertInvariants`/`findInvariantViolations` (3 invariant, Prisma va `pg` klient bilan), `insert`/`expectPgError`. Mavjud testlar to'plamga o'tkazildi: db (constraints, seed — qo'lda TRUNCATE olib tashlandi) va server core (qo'lda yaratish/o'chirish o'rniga fabrikalar + `afterEach(assertInvariants)`). Yangi `test-utils.int.test.ts` (9 test). Jami int: db 52 + server 11; `pnpm test:int` ikki marta ketma-ket o'tdi. Root `test:int` → `pnpm -r --workspace-concurrency=1 --if-present run test:int` (yangi paketlar avtomatik qo'shiladi, bitta bazada parallel ishlamaydi). CI: `integration` job'dagi `vars.RUN_INTEGRATION_TESTS` sharti olib tashlandi, `pnpm test:int` qadami qo'shildi (CI'da tekshiruv merge'dan keyin). Og'ishlar: (1) to'plam alohida paket emas, `@drinks/db` ning subpath export'lari (`./test-utils`, `./test-utils/global-setup`, `./test-utils/setup`) — Prisma client va `pg` shu paketda; (2) `makeCashbox({ balance })` balansni `DEBT_TAKEN` IN tranzaksiyasi sifatida yozadi ("boshlang'ich qoldiq" turi yo'q), invariant buzilmasligi uchun; (3) `packages/server` dagi `dotenv` dev-dep endi ishlatilmaydi, lekin lockfile konfliktlaridan qochish uchun (T-201 parallel) qoldirildi |
| 2026-10-22 | T-201 bajarildi (alohida sessiya, `claude/t-201-auth-67a474` branch): `packages/server/src/modules/auth` — `@node-rs/argon2` 2.2.2 (argon2id), `auth.login` (kichik harf, soxta hash bilan teng vaqt, faolsiz → `USER_INACTIVE`, (login, IP) bo'yicha 5 xato → 15 daqiqa `TOO_MANY_ATTEMPTS`), `auth.logout`, `auth.getSession` (token SHA-256, 30 kun sirpanuvchi, kuniga ≤ 1 yozuv), `auth.toServiceContext`; audit `LOGIN` / `LOGIN_FAILED` (parol/hash/tokensiz). `@drinks/shared/schemas` — `loginInputSchema` (zod 4.6.7). `apps/web`: `proxy.ts` (next-intl + cookie yo'q → `/[locale]/login`, cookie muddatini surish), `lib/session.ts`, `lib/session-cookie.ts` (`dt_session`: httpOnly, sameSite=lax, secure prod'da, path=/), `features/auth/actions.ts` (`loginAction`, `logoutAction`), login formasi (react-hook-form + zodResolver, shadcn `Form`), himoyalangan placeholder `app/[locale]/(app)/page.tsx`. Testlar: 14 integratsiya (`packages/server/test/int/auth.int.test.ts`, `users.int.test.ts`) + cookie atributlari unit testi. Og'ishlar: (1) yangi jadval `login_attempt` (migratsiya `20261022172357_login_attempt`) — database.md §2, §4, §6.6; (2) `saveUserLocale` endi `users.updateOwnLocale` ni chaqiradi (minimal `modules/users`, audit `USER_UPDATE`; T-204 kengaytiradi); (3) bosh sahifa `app/[locale]/(app)/` ga ko'chirildi, `home.goToLogin` va `auth.login.notReady` kalitlari olib tashlandi; (4) `next.config.ts` root `.env` ni yuklaydi (`dotenv`) va `@drinks/server`, `@drinks/db` ni `transpilePackages` ga qo'shadi; (5) `lib/action-error.ts` — vaqtinchalik `DomainError → ActionError`, T-203 `action()` wrapper'ga ko'chiradi; (6) integratsiya fixture'lari test bazasida qoladi (audit append-only va foydalanuvchiga FK) — T-105 test kiti bilan birlashtiriladi; (7) dev serverda curl bilan tekshirildi: `/` → `/uz` → `/uz/login`, login sahifasi uz/ru; seed OWNER bilan haqiqiy kirish va `Set-Cookie` ni curl orqali tekshirish ruxsat tizimi tomonidan rad etildi — cookie atributlari unit test bilan, oqim integratsiya testlari bilan tasdiqlangan |
| 2026-10-22 | T-301 bajarildi (alohida sessiya, `claude/t-301-formulas-bb8ccd` branch): `packages/shared/src` — `units.ts` (`toPieces`, `splitPieces`, `formatQty`), `money.ts` (`formatSom`, `roundHalfUp`), `costing.ts` (`costAmount`, `unitCostOf`, `avgOnReceipt`, `avgOnPurchaseReversal` — 0 chegarasi bilan, `COST_SCALE`), ichki `decimal.ts` (`bigint × 10⁴` aniq arifmetika, ROUND HALF UP noldan uzoqqa); hammasi `@drinks/shared` dan eksport. 80 unit test (shu 4 fayl uchun 100% qamrov — `@vitest/coverage-v8` bilan lokal tekshirildi, lockfile konfliktidan qochish uchun dependency qo'shilmadi), SRS misoli `formatQty(20, 6)` → "3 blok 2 dona". Og'ishlar: (1) tannarx satr (`CostString`, doim 4 xona), pul `number` (ADR-008), `formatSom` `bigint` ham qabul qiladi; (2) qo'shimcha `costAmount`, `unitCostOf` (§1.2, §5.1 formulalari); (3) birlik so'zlari parametr (standart uz), raqam guruhlari no-break space bilan; (4) noto'g'ri kiritma → `RangeError`. business-logic §1.4 qo'shildi, architecture §6 yangilandi |
| 2026-10-22 | T-205 bajarildi (alohida sessiya, `claude/t-205-reset-cli-4c119b` branch): `pnpm user:reset-password <login>` → `packages/server/scripts/reset-password.ts` (`tsx`, root `.env`; parol ikki marta, TTY'da echo'siz raw rejim, TTY bo'lmasa stdin'ning 2 qatori; parol hech qachon chiqarilmaydi) → `users.resetPassword` (bitta tranzaksiya: argon2id hash + `password_changed_at`, barcha sessiyalar va `login_attempt` qatorlari o'chiriladi, audit `PASSWORD_RESET` parolsiz/hashsiz). `@drinks/shared/schemas`: `passwordSchema` (8–128), `resetPasswordInputSchema`; `validationError` `auth.service.ts` dan `core/validation.ts` ga ko'chirildi. Testlar: 4 integratsiya (`reset-password.int.test.ts`: sessiyalar/blok/audit, faolsiz akkaunt, `NOT_FOUND`, `VALIDATION_FAILED`) + shared unit. Dev bazada vaqtinchalik `t205_demo` xodimida tekshirildi (TTY va pipe, noto'g'ri takror, qisqa parol, noma'lum login) — keyin faolsizlantirildi (audit append-only, shuning uchun o'chirilmadi). Og'ishlar: (1) skript `packages/server` da (`db` serverni import qila olmaydi, `apps/web` — UI); (2) faolsiz akkaunt parolini tiklash — OQ-17 (tavsiya: tiklanadi, faolsizligicha qoladi); (3) `tsx` 4.23.15 `@drinks/server` dev-dep'iga qo'shildi |
| 2026-10-22 | T-402 bajarildi (alohida sessiya, `claude/t-402-cash-core-d5fabf` branch): `packages/server/src/modules/cash` — `cash.record(tx, ctx, cashbox, input)`: `lockCashboxes` (§2, 4-qadam) bilan qulflangan kassada `UPDATE … balance + delta … WHERE balance + delta >= 0 RETURNING` → `balance_after`, `cash_transaction` yozuvi va audit `CREATE cash_transaction`. Yo'nalish turdan olinadi (`CASH_TX_DIRECTION`), faqat `MANUAL_REVERSAL` da `direction` + `reversalOfId` beriladi; `OTHER_EXPENSE` izohsiz → `NOTE_REQUIRED`; summa ≤ 0 yoki kasr → `RangeError` (chaqiruvchi xatosi). `CASHBOX_INSUFFICIENT` params — faqat `{ cashbox: 'CASH' \| 'CARD' }`, rolga qaramay summa yo'q. Ruxsat (`assertCan`) va sana tekshiruvi (OQ-07) chaqiruvchida. Testlar: `packages/server/test/int/cash.int.test.ts` — 9 integratsiya testi (IN/OUT va `balance_after` zanjiri, aynan 0 gacha, yetmasa xato + butun tranzaksiya rollback, parallel ikki OUT'dan bittasi o'tadi, izoh, `MANUAL_REVERSAL`, noto'g'ri summa), har testdan keyin `assertInvariants`. business-logic §7 yangilandi |
| 2026-10-22 | T-301, T-205, T-402 main'ga merge qilindi (Prompt 33). Refactor: `cash.record` dagi summa tekshiruviga qavslar. OQ-17 yopildi — A (faolsiz akkaunt parol tiklangandan keyin ham faolsiz qoladi). |
| 2026-10-22 | T-401 bajarildi (alohida sessiya, `claude/t-401-inventory-65e651` branch): `packages/server/src/modules/inventory` — `inventory.receive` (PURCHASE / SALE_REVERSAL, mahsulot bo'yicha `avgOnReceipt`), `inventory.issue` (SALE — joriy avg bilan, `INSUFFICIENT_STOCK`; PURCHASE_REVERSAL — `avgOnPurchaseReversal`, `PURCHASE_REVERSAL_INSUFFICIENT_STOCK`), `inventory.adjust` (COUNT_ADJUSTMENT, `stock_count_result` uchun mahsulot jami), so'rovlar `getAvailable`, `getProductTotals` (avg faqat `report.sales.cost` bilan). 6–7-qulflarni servis o'zi oladi; do'kon/tashkilot tekshiruvi → `NOT_FOUND`; audit chaqiruvchida. Testlar: `packages/server/test/int/inventory.int.test.ts` — 23 integratsiya testi (bo'sh va bo'sh bo'lmagan qoldiqda tannarx, 4-xona yaxlitlash DB bilan, guruhlash, savdo storno'si, yetmagan qoldiq + rollback, parallel ikki savdo, xarid storno'si 0 chegarasi, inventarizatsiya ikki yo'nalishda), har testdan keyin `assertInvariants`. business-logic §1.5, database.md §6.2 yangilandi; OQ-18 ochildi (savdo storno'sida guruhlash — tavsiya bo'yicha qilingan) |
| 2026-10-22 | T-403 bajarildi (alohida sessiya, `claude/t-403-debts-585683` branch): `packages/server/src/modules/debts` — `debts.open(tx, ctx, input)` (`MANUAL`: izoh majburiy, `RECEIVABLE` → `DEBT_GIVEN` OUT / `PAYABLE` → `DEBT_TAKEN` IN `cash.record` orqali; `SALE` → `RECEIVABLE`, `PURCHASE` → `PAYABLE`, kassasiz) va `debts.cancel(tx, ctx, lockedDebt, { cashbox? })` (`DEBT_HAS_REPAYMENTS` — OQ-04, yangi `DEBT_CANCELLED`; `MANUAL` qarzda asl yozuvga teskari `MANUAL_REVERSAL` — OQ-08). `lockDebt` endi `direction`/`source` ham qaytaradi. Qaytarish (`debt_repayment`) — T-704 ga qoldirildi (§7 uni kassa amallari qatorida beradi, T-403 vazifasida yo'q). Testlar: `packages/server/test/int/debts.int.test.ts` — 13 integratsiya testi (ochish: 4 manba/yo'nalish, izoh, kassa yetmasa rollback, summa; bekor qilish: berilgan/olingan/xarid qarzi, olinganda balans yetmasa rollback, qisman va to'liq qaytarilgan → blok, parallel ikki storno, noto'g'ri kassa), har testdan keyin `assertInvariants`. OQ-19 ochildi (nasiya hujjat qarzining izohi). business-logic §2, §7, §10 yangilandi |
| 2026-10-22 | T-203 bajarildi (alohida sessiya, `claude/t-203-layout-3109ae` branch): `(app)` layout — sidebar (`lib/nav.ts`: `NAV_SECTIONS` + `navForRole`, `permissions.ts` bo'yicha), mobil menyu (Sheet), header (til almashtirgich, foydalanuvchi menyusi → Chiqish), inventarizatsiya banneri uchun bo'sh joy (T-603). `lib/action.ts` — `action()` / `publicAction()` wrapper (sessiya → `UNAUTHORIZED`, zod → `VALIDATION_FAILED`, `DomainError` → `ActionResult`, qolgani qayta otiladi); `loginAction` unga o'tkazildi, `lib/action-error.ts` va `LogoutButton` olib tashlandi. 403: `requireSection`/`requirePermission` (`lib/session.ts`) → `forbidden()` → `(app)/forbidden.tsx`; barcha menyu bo'limlari uchun placeholder sahifalar. Umumiy UI: `DataTable` (TanStack Table 9.2.6), `PageHeader`, shadcn `alert-dialog`/`sheet`/`separator` (`packages/ui`), `MoneyText`, `QtyText`, `ConfirmDialog` (`apps/web`). Testlar: menyu filtri va bo'lim ruxsatlari, action wrapper, `validationError`. Og'ishlar: (1) `validationError` `packages/server/src/core/validation.ts` dan `@drinks/shared` ga ko'chirildi (core fayl endi re-export); (2) `next.config.ts` — `experimental.authInterrupts` (Next.js `forbidden()` uchun); (3) bosh sahifa `/` da qoldi (architecture §3 dagi `dashboard/` papkasi o'rniga); (4) birlik so'zlari enumi `QtyUnit` (business-logic §1.4 dagi `InputUnit` emas) — hujjat tuzatildi; (5) `home.title`/`home.description` kalitlari olib tashlandi, `common.*`, `nav.*`, `userMenu.*`, `forbidden.*` qo'shildi; (6) worktree'da `.env` yo'q — kirgandan keyingi sahifalar dev serverda ko'rilmadi (dev DB'ga yozmaslik uchun ham), faqat `next build`, sessiyasiz redirect va login sahifasi (uz/ru) tekshirildi |
| 2026-10-22 | T-401, T-403, T-203 main'ga merge qilindi (Prompt 35). Refactor: `packages/server/src/core/validation.ts` re-export'i olib tashlandi — `auth`/`users` servislari `validationError` ni to'g'ridan-to'g'ri `@drinks/shared` dan oladi. Ikkala sessiya ham OQ-18 raqamini ishlatgani uchun T-403 savoli OQ-19 ga o'zgartirildi. |
| 2026-10-22 | Prompt 36: OQ-18 va OQ-19 yopildi (ikkalasi A). OQ-18 — savdo storno'si mahsulot bo'yicha guruhlanadi (T-401 kodi o'zgarmadi, business-logic §4.3 moslandi). OQ-19 — nasiya qismli savdo/xaridda hujjat izohi majburiy: `debts.open` endi barcha manbalarda izohsiz qarzni `NOTE_REQUIRED` bilan rad etadi (+1 integratsiya testi), bajarish (T-405, T-502) buni qulflardan oldin tekshiradi, `debt.note` = hujjat izohi (business-logic §4.2, §5.2, §7, §10, user-guide yangilandi). T-203/T-401/T-403 worktree va branch'lari o'chirildi. |
| 2026-10-22 | T-302 bajarildi (Prompt 36, `feat/t-302-categories-brands` branch): `packages/server/src/modules/products/catalog.service.ts` — `categories` / `brands` (`list`, `create`, `rename`, `archive`, `restore`; `product.read` / `product.write`), nom takrori katta-kichik harfga sezgirsiz, arxivdagilar ham → `DUPLICATE_VALUE { archived }`, parallel P2002 ham shunga; audit `CREATE`/`UPDATE`/`ARCHIVE`/`RESTORE` (yangi amal). `@drinks/shared`: `schemas/catalog.ts` (`CatalogKind`, `catalog*InputSchema`), `types/catalog.ts` (`CatalogItem`). UI: `/products/categories`, `/products/brands` (ro'yxat, Faol/Arxiv, qo'shish/tahrirlash dialogi, arxivlash/qaytarish tasdiqi), Mahsulotlar sahifasidan havolalar; `lib/session.ts` `getServiceContext`, `ui/sonner` `toast` qayta eksporti; uz/ru tarjimalar. Testlar: 10 integratsiya (`catalog.int.test.ts`: takror, arxivdagi takror, boshqa tashkilot, parallel yaratish, rename/archive/restore + audit, NOT_FOUND, VALIDATION_FAILED, brend) + shared unit. Brauzerda (Playwright, `staff1`) tekshirildi: yaratish, takror xatosi, bo'sh nom, tahrirlash, arxivlash, Arxiv ro'yxati, ru tili, mobil — dev bazada `T-302 sinov 2` toifasi arxivda qoldi. "Mahsulot formasida tanlov" — `list(ctx)` tayyor, forma T-303 da |
| 2026-10-23 | T-304 bajarildi (alohida sessiya, `worktree-agent-a42dc94c4c1fe9d23` branch): `packages/server/src/modules/warehouses` — `warehouses` (`list` daraxt + `hasStock`, `options` — hujjat formalari uchun faqat faol ombor/sub-omborlar, `resolveActive` — hujjat servislari uchun `NOT_FOUND`/`ENTITY_ARCHIVED` himoyasi, `create`, `rename`, `archive`, `restore`) va `subWarehouses` (`create`, `rename`, `archive`, `restore`); `warehouse.read`/`warehouse.write`. 3-daraja yo'q: sub-ombor id'si ota sifatida → `NOT_FOUND { entity: 'warehouse' }`. Nom takrori (ombor — do'kon bo'yicha, sub-ombor — ombor bo'yicha, katta-kichik harfga sezgirsiz, arxivdagilar ham) → `DUPLICATE_VALUE`, parallel P2002 ham. Arxivlash ombor qatorini `FOR UPDATE` (§2 2-qadam) qilib, qoldiqni qulf ostida tekshiradi → `ENTITY_NOT_EMPTY`; ochiq inventarizatsiya → `WAREHOUSE_IN_STOCK_COUNT` (OQ-21, tavsiya bo'yicha); ombor arxivi kaskadsiz, arxivdagi omborga sub-ombor qo'shish/uning sub-omborini tiklash → `ENTITY_ARCHIVED`. `inventory.getStockedSubWarehouses` (yangi so'rov). Audit `CREATE`/`UPDATE`/`ARCHIVE`/`RESTORE` (`warehouse` / `sub_warehouse`). `@drinks/shared`: `schemas/warehouses.ts`, `types/warehouses.ts`. UI: `/warehouses` (ComingSoon o'rniga) — ombor kartochkalari, sub-omborlar jadvali (holati, arxiv belgisi), qo'shish/nomlash dialogi, arxivlash/qaytarish tasdiqi, Faol/Arxiv; uz/ru tarjimalar. Hujjatlar: business-logic §9c (+ §1.5, §3, §10), database §6.1b/§6.2, architecture §6, user-guide §5/§14. Testlar: 15 integratsiya (`warehouses.int.test.ts`: daraxt + audit, 3-daraja, takrorlar, parallel yaratish, rename, sub/ombor `ENTITY_NOT_EMPTY` va bo'shatilgach arxiv, `options`/`resolveActive`, kaskadsiz arxiv va tiklash, OQ-21, qulf poygasi ikki tomonlama — mutatsiya bilan tekshirilgan) + shared unit. Brauzerda (Playwright, `staff1`, port 3102) tekshirildi: yaratish, takror xatosi, sub-ombor qo'shish/nomlash/arxivlash, omborni arxivlash, Arxiv ro'yxati, ru, mobil (gorizontal skrollsiz) — dev bazada `T-304 sinov` ombori va `T-304 javon 2` sub-ombori arxivda qoldi |
| 2026-10-23 | T-204 bajarildi (alohida sessiya, `worktree-agent-a1890e90df7c2a82d` branch): `packages/server/src/modules/users` — `list`, `create` (rol doim `STAFF`, `created_by_id`), `update` (F.I.O/login/til, faqat o'zgargan maydonlar), `setPassword`, `deactivate` / `activate`, "Mening akkauntim" — `updateOwnProfile`, `changeOwnUsername`, `changeOwnPassword` (joriy parol → `CURRENT_PASSWORD_INVALID`); hammasi `user.manage`. Login: trim → kichik harf → `^[a-z0-9._-]{3,32}$`, takror (faolsizlar ham, parallel P2002 ham) → `DUPLICATE_VALUE`. Login/parol o'zgarsa yoki faolsizlantirilsa — sessiyalar o'chadi, login/parol o'zgarsa `login_attempt` (eski va yangi login) ham tozalanadi; o'z akkauntini o'zgartirganda joriy sessiya qoladi (OQ-22 ochildi — tavsiya bo'yicha qilingan). O'zi/OWNER akkauntiga boshqaruv amali → `FORBIDDEN { reason }`. Audit `USER_CREATE`/`USER_UPDATE`/`PASSWORD_RESET` (`meta.source` = `owner`/`self`)/`USER_DEACTIVATE`/yangi `USER_ACTIVATE`, parol va hashsiz. `@drinks/shared`: `schemas/users.ts` (+ "parolni takrorlang" forma sxemalari), `types/users.ts` (`UserAccount`), `dates.ts` (`formatDateTime` — `uz` `Intl` formati Node va brauzerda farq qilib hydration xatosi bergani uchun). UI: `/users` (ro'yxat, qo'shish/tahrirlash/parol dialoglari, faolsizlantirish/faollashtirish tasdig'i, login o'zgarishida ogohlantirish), `/account` — Mening akkauntim (foydalanuvchi menyusidan, har rol; formalar faqat Egasiga, Xodimga "Egasiga murojaat qiling"); uz/ru tarjimalar. Testlar: 18 integratsiya (`user-management.int.test.ts`: STAFF uchun 9 ta amal `FORBIDDEN`, yaratish + audit parolsiz, takror login, parallel yaratish, blokni tozalash, validatsiya, login o'zgarishi sessiya/hisoblagich, no-op, OWNER/boshqa tashkilot, parol o'rnatish, faolsizlantirish → `USER_INACTIVE` va sessiya yo'q, o'zini faolsizlantira olmaydi, o'z paroli/logini — joriy sessiya qoladi, profil) + shared unit (sxemalar, `formatDateTime`). Brauzerda (Playwright, alohida dev server :3103) Egasi va `staff1` bilan tekshirildi: bo'sh forma xabarlari, parol mos kelmasligi, takror login (`STAFF1`), login o'zgarishi ogohlantirishi, tahrir, parol o'rnatish → xodim yangi parol bilan kiradi, faolsizlantirish → xodim sessiyasi yopiladi va "Akkaunt faolsizlantirilgan", Egasining joriy parol xatosi va band login, Xodimda `/account` formasiz va `/users` → 403, ru, mobil — dev bazada `t204_demo` xodimi faolsiz holda qoldi (Egasi va `staff1`/`staff2` o'zgartirilmadi). Og'ishlar: (1) Xodim uchun "Mening akkauntim" faqat ko'rish (architecture §11: xodim o'z parolini o'zgartira olmaydi); (2) Egasining F.I.O si ham "Mening akkauntim"da o'zgartiriladi (`updateOwnProfile`); (3) faollashtirish uchun yangi audit amali `USER_ACTIVATE` |
| 2026-10-22 | T-303 bajarildi (alohida sessiya, `worktree-agent-a15b99fb3436f747a` branch): `packages/server/src/modules/products/products.service.ts` — `products.list` (qidiruv nom/SKU/shtrix-kod, toifa/brend/arxiv filtri, 50 tadan sahifa), `get`, `create`, `update` (o'zgarmasa yozuv/audit yo'q, audit faqat o'zgargan maydonlar), `archive`/`restore`, `setImage`/`removeImage`/`readImage`; SKU/shtrix-kod takrori katta-kichik harfga sezgirsiz, arxivdagilar ham → `DUPLICATE_VALUE { field, archived }`, parallel P2002 ham shunga; yangi toifa/brend faol bo'lishi shart (`ENTITY_ARCHIVED`), mahsulotda turgan arxivlangani saqlanadi; qoldiq va kam qoldiq belgisi `inventory.getProductTotals` orqali (DTO'da maxfiy maydon yo'q). `core/storage.ts` — `StorageAdapter` + `LocalDiskStorage` (`UPLOAD_DIR`); rasm `sharp` 0.35.5 bilan baytlardan tekshiriladi (≤ 2 MB, jpg/png/webp), 512 px ichiga, WebP. `@drinks/shared`: `schemas/product.ts`, `types/product.ts` (`Product`, `ProductPage`), `product.ts` (`blockPrice`, `isLowStock`). UI: `/products` (filtrlar URL'da, rasm, narx + blok narxi, qoldiq + "Kam qoldi", arxivlash/tiklash, sahifalash; Toifalar/Brendlar havolalari saqlandi), `/products/new`, `/products/[id]` (forma: jonli blok narxi, minimal qoldiq blok ko'rinishi, blokdagi dona soni o'zgarsa ogohlantirish oynasi — OQ-06, rasm tanlash/olib tashlash), `GET /api/products/[id]/image` (sessiya bilan, `immutable` kesh); `next.config.ts` `serverActions.bodySizeLimit: '3mb'`; uz/ru tarjimalar (`products.*`, `common.invalid`). Testlar: 20 integratsiya (`products.int.test.ts`: barcha maydonlar + audit, bo'sh ixtiyoriy maydonlar, SKU/shtrix-kod takrori, arxivdagi takror, boshqa tashkilot, parallel yaratish, arxivlangan/begona toifa-brend, VALIDATION_FAILED, OQ-06 STAFF + audit diff, no-op, arxivlangan toifa saqlanishi, NOT_FOUND, arxiv/tiklash qoldiq bilan, qidiruv/filtrlar, qoldiq va kam qoldiq, sahifalash, rasm kichraytirish/almashtirish/o'chirish, katta/noto'g'ri fayl, begona mahsulotda fayl tozalanishi) + unit (shared sxemalar, `blockPrice`/`isLowStock`, `LocalDiskStorage`, `list-params`). Brauzerda (Playwright, `staff1`, port 3101) tekshirildi: ro'yxat, qidiruv (nom, SKU), takror SKU xatosi, rasm bilan yaratish va thumbnail, blokdagi dona soni ogohlantirishi, rasmni olib tashlash, arxivlash, ru, mobil. Og'ishlar: (1) qoldig'i bor mahsulotni arxivlash ruxsat etilgan — OQ-20 (ochiq, tavsiya bo'yicha); (2) rasm doim WebP sifatida saqlanadi, `<img>` (next/image emas); (3) `UNITS_PER_BLOCK_CHANGED` tekshiruvi T-405/T-502 da (bu yerda faqat UI ogohlantirishi + audit); (4) branch eski `main` dan ochilgan edi — T-302 uchun `main` ga fast-forward qilindi. Dev bazada `T-303 sinov` mahsuloti (SKU `T303-SINOV`) arxivda, rasmsiz qoldi (audit append-only) |
| 2026-10-23 | T-304, T-204, T-303 main'ga merge qilindi (Prompt 39). To'qnashuvlar: `messages/*.json` (JSON darajasida 3 tomonlama birlashtirildi), `shared` index'lari, hujjatlar. Ikkala sessiya business-logic'da §9b raqamini ishlatgani uchun omborlar bo'limi §9c ga o'zgartirildi (havolalar bilan). OQ-22 yopildi (A). OQ-20, OQ-21 javob kutmoqda. Worktree'lar o'chirildi. |
| 2026-10-23 | Prompt 40: OQ-20 (qoldig'i bor mahsulotni arxivlash — ruxsat) va OQ-21 (ochiq inventarizatsiyali omborni arxivlash — rad) yopildi, ikkalasi A; kod o'zgarmadi. |
| 2026-10-23 | T-404 bajarildi (Prompt 40, `feat/t-404-purchase-draft` branch): `packages/server/src/modules/purchases` — `purchases.list` (holat, sana oralig'i, raqam; 50 tadan), `get`, `create` (`nextDocNumber` → `P-000001`), `update` (`lockPurchase` + `version` → `DOCUMENT_CHANGED` / `DOCUMENT_NOT_DRAFT`, qatorlar almashtiriladi), `remove`; sana kuni → vaqt (bugun → hozir, o'tgan → 12:00), `DOC_DATE_IN_FUTURE`, faol mahsulot/sub-ombor tekshiruvi, audit `CREATE`/`UPDATE`/`DELETE` (+ `backdated`). `products.options` (forma uchun faol mahsulotlar). `@drinks/shared`: `schemas/purchase.ts`, `types/purchase.ts` (`PurchaseDetail`, `PurchaseListItem`), `types/product.ts` `ProductOption`, `dates.ts` `storeDateOf`/`storeToday`/`formatDate`. UI: `/purchases` (filtrlar URL'da), `/purchases/new`, `/purchases/[id]` (`PurchaseForm` — `ProductPicker`, sub-ombor, dona/blok, to'lov farqi, o'chirish; bajarilgan — `PurchaseView`), uz/ru. Testlar: 15 integratsiya (`purchases.int.test.ts`: hisob va 4-xona tannarx, qoralama qoldiq/kassaga tegmaydi, `DOC_DATE_IN_FUTURE`, backdated, arxivlangan mahsulot/sub-ombor, boshqa do'kon, `VALIDATION_FAILED`, OQ-14 tahrir + audit, `DOCUMENT_CHANGED`, parallel ikki saqlash, `DOCUMENT_NOT_DRAFT`, o'chirish, ro'yxat filtrlari) + shared/web unit. Brauzerda (`staff1`) tekshirildi: bo'sh forma xatolari, qidiruv/klaviatura bilan tanlash, blok → dona, to'lov farqi, saqlash → raqam, tahrir, kelajak sana xatosi, ro'yxat, mobil, o'chirish, rus tili; sinov qoralamalari o'chirildi (P-000001…P-000003 raqamlari ishlatilgan). OQ-23 ochildi (0 narx — tavsiya bo'yicha ruxsat) |
| 2026-10-23 | T-404 main'ga merge qilindi (Prompt 41). OQ-23 yopildi (A — xarid qatorida 0 narx ruxsat, kod o'zgarmadi). |
