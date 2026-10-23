# Arxitektura

Versiya: 0.1 (qoralama) · Sana: 2026-10-22 · Manba: [01-srs.md](01-srs.md) v1.0
Bog'liq: [database.md](database.md) · [business-logic.md](business-logic.md) · [decisions.md](decisions.md) · [conventions.md](conventions.md) · [open-questions.md](open-questions.md)

---

## 1. Umumiy ko'rinish

Tizim — bitta do'kon uchun web mini-ERP. Bitta **monorepo** ichida: frontend (UI), backend (biznes mantiq), ma'lumotlar bazasi sxemasi, umumiy (shared) kod va Docker fayllari.

```
Brauzer (uz/ru)
   │  HTTPS
   ▼
┌───────────────────────────────────────────────┐
│ apps/web  — Next.js (App Router)              │
│  • UI: Server + Client Components, Tailwind   │
│  • Server Actions (mutatsiyalar)              │
│  • Route Handlers (eksport PDF/Excel, health) │
│        │ faqat chaqiradi                       │
│        ▼                                       │
│ packages/server — BACKEND yadrosi             │
│  • servislar (product, sale, purchase, ...)   │
│  • RBAC, audit, tranzaksiya, qulflash         │
│        │                                       │
│        ▼                                       │
│ packages/db — Prisma schema + client          │
└────────┼──────────────────────────────────────┘
         ▼
   PostgreSQL (Docker)

packages/shared — UI ham, server ham ishlatadigan kod
(zod sxemalar, tiplar, enumlar, birlik/pul funksiyalari, ruxsatlar matritsasi, xato kodlari)
```

**Asosiy g'oya:** Next.js — faqat "transport" va UI qatlami. Barcha biznes qoidalar (BR-1…BR-13) `packages/server` da, framework'dan mustaqil, test qilinadigan servislar ko'rinishida yashaydi. Ertaga mobil ilova yoki REST API kerak bo'lsa, xuddi shu servislar qayta ishlatiladi (qarang ADR-002).

## 2. Texnologiyalar steki

| Qatlam | Tanlov | Izoh |
|---|---|---|
| Runtime | Node.js 24 LTS | |
| Paket menejer | pnpm (workspaces) | monorepo uchun tez va qat'iy |
| Monorepo orkestr | Turborepo | build/lint/test keshlash, vazifalar grafigi |
| Til | TypeScript (`strict: true`) | hamma joyda |
| Fullstack framework | Next.js (App Router, joriy barqaror major) | RSC + Server Actions |
| UI | Tailwind CSS v4 + shadcn/ui (Radix asosida) | komponentlar repoga ko'chiriladi, AI uchun qulay |
| Ikonkalar | lucide-react | |
| Formalar | react-hook-form + zod | sxema `packages/shared` da, client va server bir xil validatsiya |
| Jadvallar | TanStack Table | saralash, filtr, sahifalash |
| i18n | next-intl | `uz` (lotin, default) va `ru` |
| ORM | Prisma | sxema, migratsiyalar, tiplar |
| DB | PostgreSQL 17 | Docker'da lokal |
| Auth | O'zimizning sessiya-auth (argon2 + `session` jadvali + httpOnly cookie) | ADR-006 |
| PDF eksport | @react-pdf/renderer (kirill shrift ro'yxatdan o'tkaziladi) | ADR-010 |
| Excel eksport | exceljs | |
| Sana/vaqt | date-fns + `@date-fns/tz` | vaqt zonasi `Asia/Tashkent` |
| Logging | pino | |
| Testlar | Vitest (unit + integratsiya), Playwright (e2e) | |
| Lint/format | ESLint (flat config) + Prettier | |
| Konteyner | Docker + Docker Compose | lokal DB; keyin prod |

Aniq versiyalar loyiha `init` qilinganda `package.json` da qotiriladi (pin) va shu faylga yoziladi.

**Qotirilgan versiyalar** (T-001 dan boshlab to'ldiriladi):

| Vosita | Versiya | Qayerda |
|---|---|---|
| Node.js | 24 | `.nvmrc`, root `engines` |
| pnpm | 10.34.7 | root `packageManager` (corepack) |
| Turborepo | 2.11.10 | root `devDependencies` |
| TypeScript | 6.0.3 | root `devDependencies` (7.x hali typescript-eslint bilan mos emas: `<6.1.0`) |
| ESLint | 10.13.0 | root `devDependencies` |
| @eslint/js | 10.0.1 | `packages/config` |
| typescript-eslint | 8.72.0 | `packages/config` |
| eslint-config-prettier | 10.1.8 | `packages/config` |
| globals | 17.13.0 | `packages/config` |
| Prettier | 3.9.10 | root `devDependencies` |
| PostgreSQL (image) | `postgres:17-alpine` | `docker/compose.dev.yml` (major qotirilgan, minor yangilanadi) |
| Adminer (image) | `adminer:5` | `docker/compose.dev.yml` (`profiles: [tools]`) |
| Next.js | 16.4.2 | `apps/web` (App Router, Turbopack, `output: 'standalone'`) |
| React / React DOM | 19.3.1 | `apps/web`, `packages/ui` (peer) |
| @types/react / @types/react-dom | 19.3.0 | `apps/web`, `packages/ui` |
| @types/node | 24.19.2 | `apps/web` (Node 24 ga mos) |
| Tailwind CSS / @tailwindcss/postcss | 4.3.3 | `packages/ui` (tema), `apps/web` |
| tw-animate-css | 1.4.0 | `packages/ui` |
| shadcn (CLI) | 4.22.1 | `pnpm dlx` orqali, `packages/ui/components.json` (style `new-york`, `neutral`) |
| radix-ui | 1.8.1 | `packages/ui` |
| class-variance-authority | 0.7.1 | `packages/ui` |
| clsx | 2.1.1 | `packages/ui` |
| tailwind-merge | 3.7.0 | `packages/ui` |
| lucide-react | 1.61.0 | `packages/ui` |
| sonner | 2.0.8 | `packages/ui` (toast) |
| next-themes | 0.4.6 | `packages/ui` (`sonner` komponenti uchun) |
| react-hook-form | 7.90.0 | `packages/ui` (`form` komponenti) |
| @next/eslint-plugin-next | 16.4.2 | `packages/config` |
| eslint-plugin-react-hooks | 7.1.1 | `packages/config` |
| Vitest | 5.0.5 | root, `packages/shared`, `packages/server`, `apps/web` (`devDependencies`) |
| Vite | 8.3.4 | Vitest'ning majburiy peer'i; Vitest bilan bir joyda |
| server-only | 0.0.1 | `packages/server` |
| prisma (CLI) / @prisma/client / @prisma/adapter-pg | 7.10.1 | `packages/db` (`prisma-client` generator → `src/generated/prisma`, gitignore'da; `postinstall` da generatsiya). npm `latest` tegi 8.0.0-rc — RC, shuning uchun 7.x barqaror |
| dotenv | 18.0.8 | `packages/db` (`prisma.config.ts` root `.env` ni o'qiydi) |
| next-intl | 4.14.9 | `apps/web` (plugin `next.config.ts` da, `src/i18n/request.ts`) |

## 3. Monorepo tuzilmasi

```
drinks_trade/
├── CLAUDE.md                       # AI uchun kirish nuqtasi (qoidalar + hujjatlarga havola)
├── .claude/
│   └── docs/                       # Barcha hujjatlar: SRS (01-srs.md), texnik hujjatlar, vazifalar
├── apps/
│   └── web/                        # Next.js ilova (UI + server actions + route handlers)
│       ├── src/
│       │   ├── app/
│       │   │   ├── [locale]/
│       │   │   │   ├── (auth)/login/
│       │   │   │   └── (app)/              # himoyalangan zona, layout + sidebar
│       │   │   │       ├── page.tsx        # bosh sahifa (dashboard, `/`)
│       │   │   │       ├── forbidden.tsx   # 403 (T-203)
│       │   │   │       ├── products/
│       │   │   │       ├── warehouses/
│       │   │   │       ├── sales/
│       │   │   │       ├── purchases/
│       │   │   │       ├── stock-counts/   # inventarizatsiya
│       │   │   │       ├── cash/           # kassa (faqat OWNER)
│       │   │   │       ├── debts/          # qarzlar (faqat OWNER)
│       │   │   │       ├── reports/        # stock, sales, pnl
│       │   │   │       ├── users/          # faqat OWNER
│       │   │   │       └── audit/          # faqat OWNER
│       │   │   └── api/
│       │   │       ├── products/[id]/image/route.ts   # mahsulot rasmi, sessiya bilan (T-303)
│       │   │       ├── reports/[report]/export/route.ts
│       │   │       └── health/route.ts
│       │   ├── features/<modul>/   # modulga xos UI: components/, actions.ts, columns.tsx
│       │   ├── components/         # ilova darajasidagi umumiy UI (layout, sidebar, locale-switcher)
│       │   ├── lib/                # session o'qish (session.ts, session-cookie.ts), action-wrapper, format helperlar
│       │   ├── i18n/               # next-intl: routing.ts, navigation.ts, request.ts
│       │   └── proxy.ts            # locale + auth redirect (Next.js 16: middleware.ts → proxy.ts)
│       ├── messages/
│       │   ├── uz.json
│       │   └── ru.json
│       ├── public/fonts/           # PDF uchun kirill shriftlar
│       └── next.config.ts
├── packages/
│   ├── server/                     # BACKEND yadrosi (faqat serverda ishlaydi: `server-only`)
│   │   ├── scripts/                # CLI (faqat I/O): reset-password.ts → `pnpm user:reset-password`
│   │   └── src/
│   │       ├── modules/
│   │       │   ├── auth/           # login, logout, session, parol hash
│   │       │   ├── users/
│   │       │   ├── products/       # product, category, brand
│   │       │   ├── warehouses/     # warehouse, sub-warehouse
│   │       │   ├── inventory/      # stock balance, movements, avg cost (ichki)
│   │       │   ├── sales/
│   │       │   ├── purchases/
│   │       │   ├── stock-counts/
│   │       │   ├── cash/
│   │       │   ├── debts/          # open/cancel/repay (ichki) + qarzlar sahifasi (T-704)
│   │       │   ├── reports/        # stock, sales, pnl + eksport
│       │   ├── dashboard/      # bosh sahifa xulosasi (T-902), faqat o'qish
│   │       │   └── audit/
│   │       ├── core/
│   │       │   ├── context.ts      # ServiceContext { user, storeId, tx }
│   │       │   ├── tx.ts           # withTransaction, qulf helperlari
│   │       │   ├── locks.ts        # FOR UPDATE so'rovlari (tartib qat'iy)
│   │       │   ├── rbac.ts         # assertCan(user, permission)
│   │       │   ├── numbering.ts    # hujjat raqamlari (S-000001)
│   │       │   └── storage.ts      # StorageAdapter + LocalDiskStorage (§9, T-303)
│   │       └── index.ts
│   ├── db/                         # Prisma
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/         # + qo'lda SQL (CHECK, partial index, trigger)
│   │   │   ├── seed.ts             # OWNER foydalanuvchi, 2 kassa, do'kon (idempotent)
│   │   │   └── seed.dev.ts         # faqat lokal: omborlar, mahsulotlar, 2 xodim
│   │   ├── prisma.config.ts        # Prisma 7 CLI config: sxema/migratsiya yo'li, DATABASE_URL
│   │   └── src/
│   │       ├── client.ts           # PrismaClient singleton (adapter-pg, globalThis)
│   │       ├── index.ts            # prisma + generatsiya qilingan tiplar/enumlar
│   │       └── generated/prisma/   # `prisma generate` natijasi (commit qilinmaydi)
│   ├── shared/                     # FRONT + BACK umumiy (brauzerda ham ishlay oladi)
│   │   └── src/
│   │       ├── schemas/            # zod: productInput, saleInput, ...
│   │       ├── types/              # DTO tiplari
│   │       ├── enums.ts            # UserRole, DocStatus, CashTxType ... (Prisma'dan mustaqil)
│   │       ├── permissions.ts      # rol → ruxsatlar matritsasi
│   │       ├── errors.ts           # ErrorCode ro'yxati + DomainError
│   │       ├── units.ts            # dona ↔ blok (BR-1)
│   │       ├── money.ts            # so'm formatlash, yaxlitlash
│   │       └── costing.ts          # o'rtacha tannarx formulasi (BR-6) — sof funksiya
│   ├── ui/                         # shadcn/ui komponentlari + umumiy UI primitivlar
│   └── config/                     # tsconfig base, eslint config, prettier
├── docker/
│   ├── compose.dev.yml             # PostgreSQL (+ ixtiyoriy Adminer)
│   ├── compose.prod.yml            # web + postgres + migrate (keyinroq)
│   └── web.Dockerfile              # Next.js standalone build
├── .env.example
├── package.json                    # root skriptlar
├── pnpm-workspace.yaml
└── turbo.json
```

### 3.1 Paketlar orasidagi bog'liqlik qoidalari

```
apps/web ──► packages/server ──► packages/db
   │               │
   ├──► packages/ui │
   └──► packages/shared ◄──┘
```

| Paket | Kim import qila oladi | Nimani import qila oladi |
|---|---|---|
| `shared` | hamma | hech narsani (faqat zod, date-fns kabi kutubxonalar). **Prisma import qilinmaydi**, Node API ishlatilmaydi |
| `ui` | `web` | `shared` |
| `db` | faqat `server` | — |
| `server` | faqat `web` (server tomonda) | `db`, `shared` |
| `web` | — | `server`, `shared`, `ui` |

- `apps/web` **to'g'ridan-to'g'ri Prisma'ni chaqirmaydi** — faqat `packages/server` servislarini. Bu qoida ESLint (`no-restricted-imports`) bilan majburlanadi.
- ESLint chegaralari `packages/config/eslint/index.js` da (`webBoundaries`, `sharedBoundaries`, `uiBoundaries`): `apps/web` → `@prisma/*`, `prisma`, `@drinks/db`, `**/packages/db` taqiqlangan; `packages/shared` → shularga qo'shimcha Node built-in modullari (`node:*`, `fs`, `path` …) taqiqlangan; `packages/ui` → Prisma, `db`, `server`, `apps/web` va Node built-in modullari taqiqlangan (faqat `shared` mumkin). `apps/web` va `packages/ui` ga `react-hooks`, `apps/web` ga Next.js (`core-web-vitals`) qoidalari qo'llanadi (`react()` preset).
- `packages/ui` build qilinmaydi: TS manbasi `exports` (`@drinks/ui/components/*`, `@drinks/ui/lib/*`, `@drinks/ui/globals.css`, `@drinks/ui/postcss.config`) orqali beriladi, `apps/web` uni `transpilePackages` bilan kompilyatsiya qiladi. Tailwind tema tokenlari va `@source` (ilovalar + ui) — `packages/ui/src/styles/globals.css`. Yangi shadcn komponent: `packages/ui` ichida `pnpm dlx shadcn@4.22.1 add <nom>` (keyin versiyani qotirish va `cn` importini tekshirish).
- ESLint **bitta root `eslint.config.js`** bilan butun repo bo'ylab ishga tushadi (`pnpm lint`), chegaralar fayl yo'li bo'yicha qo'llanadi — yangi paket o'z lint sozlamasini unutsa ham chegarani chetlab o'ta olmaydi. Paketlarda alohida `lint` skript yo'q; `typecheck`/`test` esa turbo orqali paket bo'yicha.
- `packages/server` `import 'server-only'` bilan belgilanadi (`src/index.ts`) — client bundle'ga tushib qolmaydi. Vitest'da `server-only` `packages/server/test/server-only.ts` bo'sh moduliga alias qilinadi (`packages/server/vitest.config.ts`), shuning uchun testlar server modullarini import qila oladi.
- `packages/shared` va `packages/server` ham build qilinmaydi: TS manbasi `exports` orqali (`@drinks/shared`, `@drinks/shared/schemas`, `@drinks/server`); `apps/web` ularni `transpilePackages` bilan kompilyatsiya qiladi. Enumlar Prisma'ga o'xshash shaklda: `const` obyekt + bir xil nomli union tip (`UserRole.OWNER` / `UserRole`).
- Qoida: **"ikki tomonda kerak bo'lsa → `shared`"**. Masalan, blok/dona konvertatsiyasi formada ham (oldindan ko'rish), serverda ham (saqlash) kerak → `shared/units.ts`.

## 4. So'rov oqimi

### 4.1 O'qish (sahifa ochish)
1. `proxy.ts` (Next.js 16 da `middleware.ts` nomi o'zgargan): locale aniqlanadi; session cookie yo'q bo'lsa `/[locale]/login` ga.
2. Server Component `getSession()` → `ServiceContext` yaratadi.
3. Servis chaqiriladi (`productsService.list(ctx, filters)`), servis RBAC tekshiradi, DTO qaytaradi.
4. DTO — rolga qarab **filtrlangan**: STAFF uchun `costTotal`, `grossProfit` kabi maydonlar **serverda** olib tashlanadi (UI'da yashirish yetarli emas).

### 4.2 Yozish (mutatsiya)
1. Client forma `react-hook-form` + `shared` zod sxema bilan validatsiya qiladi.
2. Server Action (`features/sales/actions.ts`) → `action()` wrapper (`apps/web/src/lib/action.ts`, T-203): session (yo'q → `UNAUTHORIZED`), zod qayta validatsiya (`validationError` — `@drinks/shared`, servislar ham shuni ishlatadi → `VALIDATION_FAILED` + `fieldErrors`), servis chaqiruvi (`ctx` tayyor: `auth.toServiceContext`), `DomainError` → `ActionResult`. Boshqa xatolar (`redirect()`, `forbidden()`, bug) qayta otiladi. Sessiyasiz formalar (login) — `publicAction()`. Ruxsat — servisda (`assertCan`).
   ```ts
   'use server';
   export const createProduct = action(productInputSchema, (input, { ctx }) => products.create(ctx, input));
   ```
3. Servis: `withTransaction` ichida qulflar → biznes tekshiruvlar → yozuvlar → audit → commit.
4. `revalidatePath` / `revalidateTag` bilan kesh yangilanadi.

```ts
// shared
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; params?: Record<string, unknown>; fieldErrors?: Record<string, string[]> } };
```

Xato matnlari serverda emas, **UI'da `code` bo'yicha tarjima qilinadi** (`messages/uz.json` → `errors.INSUFFICIENT_STOCK`). Shu tufayli bitta xato ikki tilda to'g'ri chiqadi.

### 4.3 Eksport
`GET /api/reports/{stock|sales|pnl}/export?format=pdf|xlsx&from=&to=` → session + RBAC → `reportsService` → fayl stream. STAFF uchun savdo hisobotida tannarx/foyda ustunlari umuman generatsiya qilinmaydi; P&L uchun 403.

## 5. Backend dizayni (`packages/server`)

### 5.1 Modul tuzilmasi
Har modul bir xil shaklda:
```
modules/sales/
├── sales.service.ts     # public API: create, update, remove, post, reverse, get, list
├── sales.repo.ts        # Prisma so'rovlari (faqat shu modul jadvallari)
├── sales.mapper.ts      # DB → DTO (rolga qarab filtr)
├── sales.post.ts        # bajarish algoritmi (murakkab bo'lgani uchun alohida)
└── sales.test.ts        # integratsiya testlari (haqiqiy Postgres)
```

Modullar bir-birining **repo**siga kirmaydi, faqat **servis** orqali (masalan, `sales.post` → `inventoryService.issue(tx, ...)`, `cashService.record(tx, ...)`, `debtsService.open(tx, ...)`). Ichki servis funksiyalari `tx` qabul qiladi, shunda hammasi bitta tranzaksiyada.

### 5.2 ServiceContext
```ts
interface ServiceContext {
  user: { id: string; role: UserRole; locale: Locale };
  storeId: string;        // v1 da yagona do'kon; kelajakda filial tanlovi
  organizationId: string;
  requestId: string;      // log va audit uchun
}
```
Har bir so'rov `storeId` bilan filtrlanadi — filiallar qo'shilganda kod o'zgarmaydi (qarang [database.md §2](database.md)).

### 5.3 Tranzaksiya va bir vaqtdalik (BR-7, NFR "Yaxlitlik")
- Barcha "bajarish" va "storno" amallari **bitta Postgres tranzaksiyasi** (Prisma interactive transaction, `READ COMMITTED`) ichida.
  `core/tx.ts` → `withTransaction(fn)`; `@drinks/db` dinamik import qilinadi, shuning uchun `@drinks/server` ni import qilish (unit testlar, `next build`) `DATABASE_URL` talab qilmaydi.
- Qoldiq va tannarx qatorlari `SELECT ... FOR UPDATE` bilan qulflanadi; qulflar **doim bir xil tartibda** olinadi (deadlock oldini olish) — tartib [business-logic.md §2](business-logic.md) da.
- Oxirgi himoya chizig'i — DB darajasida `CHECK (qty >= 0)`, `CHECK (balance >= 0)`. Kod xato qilsa ham ma'lumot buzilmaydi.
- Qoralamalarni tahrirlashda optimistik qulf: `version` ustuni (ikki kishi bir qoralamani bir vaqtda tahrirlasa, ikkinchisi "hujjat o'zgargan, yangilang" xatosini oladi).

### 5.4 Audit (BR-12)
- Har bir yozuvchi servis funksiyasi o'sha tranzaksiya ichida `audit.log(tx, {...})` chaqiradi (yashirin Prisma middleware emas — aniq, ko'rinadigan chaqiruv).
- `audit_log` jadvalida `UPDATE`/`DELETE` DB trigger bilan taqiqlangan.
- O'tgan sana bilan kiritilgan hujjatlar `meta.backdated = true` bilan belgilanadi (BR-13).
- Amalda (T-104): `modules/audit` — `audit.log(tx, actor, { action, entityType, entityId, before?, after?, backdated?, meta? })`; `meta.requestId` har doim yoziladi; `before`/`after` dagi `bigint` → string. `isBackdated(docDate)` — `docDate` kuni Toshkent vaqti bo'yicha bugundan oldin.
- O'qish (T-901): `auditLog.list(ctx, { user?, entityType?, action?, entityId?, from?, to?, page? })` va `auditLog.userOptions(ctx)` (`modules/audit/audit.queries.ts`, faqat `audit.read` — STAFF `FORBIDDEN`). 50 tadan, eng yangisi birinchi; `user: 'system'` — foydalanuvchisiz yozuvlar; sana oralig'i Toshkent kuni bo'yicha. Ko'rinish doirasi — faqat joriy do'kon (`store_id = ctx.storeId`); do'konsiz `LOGIN_FAILED` yozuvlari ko'rsatilmaydi (OQ-25, B). Javobda `before`/`after`/`meta` dan maxfiy kalitlar (`pass…`, `hash`, `token`, `secret`) yana olib tashlanadi (`redactAuditValue`), `meta.backdated` alohida `backdated` maydoniga chiqadi, `refs` — sahifadagi id'lar (`entityId`, `productId`, `subWarehouseId` …) → nomlar (faqat o'z tashkiloti/do'koni). Diff (`auditChanges`, `auditListChanges` — qatorlar `lineNo` bo'yicha) — `@drinks/shared/audit.ts`. UI: `/audit` — filtrlar URL'da, qator ochilganda eski → yangi qiymatlar, hujjat qatorlari jadvali, "o'tgan sana" belgisi.

### 5.5 RBAC
Ruxsatlar `shared/permissions.ts` da yagona joyda:

| Ruxsat | OWNER | STAFF |
|---|:-:|:-:|
| `product.read`, `product.write` (blokdagi dona sonini o'zgartirish ham — OQ-06) | ✅ | ✅ |
| `product.purchasePrice.read` | ✅ | ✅ |
| `warehouse.read`, `warehouse.write` | ✅ | ✅ |
| `sale.write`, `sale.post` | ✅ | ✅ |
| `purchase.write`, `purchase.post` | ✅ | ✅ |
| `stockCount.write`, `stockCount.post` | ✅ | ✅ |
| `document.reverse` (storno, shu jumladan qo'lda kassa yozuvlari) | ✅ | ❌ (OQ-03) |
| `document.paymentSplit.write` (o'z hujjatida Naqd/Karta/Nasiya kiritish) | ✅ | ✅ (OQ-02) |
| `report.stock`, `report.sales` | ✅ | ✅ |
| `report.sales.cost` (tannarx/foyda ustunlari; qoldiq hisobotida o'rtacha tannarx va qiymat ham — OQ-28) | ✅ | ❌ |
| `report.pnl` | ✅ | ❌ |
| `cash.read`, `cash.write` | ✅ | ❌ |
| `debt.read`, `debt.write` | ✅ | ❌ |
| `stockCount.amount.read` (kamomad summasi) | ✅ | ❌ |
| `user.manage` (xodim akkauntlarini yaratish/tahrirlash, login va parolni o'zgartirish, faolsizlantirish) | ✅ | ❌ |
| `document.draft.editAny` (boshqa foydalanuvchi qoralamasini tahrirlash — OQ-14) | ✅ | ✅ |
| `audit.read` | ✅ | ❌ |

Tekshiruv **3 joyda**: (1) servis (`assertCan`) — majburiy; (2) mapper — maxfiy maydonlarni olib tashlash; (3) UI — menyu/tugmalarni yashirish (faqat qulaylik uchun).

## 6. Frontend dizayni (`apps/web`)

- **Default — Server Components.** Client Component faqat interaktivlik kerak bo'lganda (formalar, jadval filtrlari, dialoglar).
- Ma'lumot o'qish — Server Component ichida servis chaqiruvi. Alohida client fetch kutubxonasi (TanStack Query) v1 da kerak emas.
- Layout: chap sidebar (rolga qarab menyu), yuqorida til almashtirgich (uz/ru), foydalanuvchi menyusi; **ochiq inventarizatsiya banneri** — ombor inventarizatsiyada bo'lsa barcha sahifalarda sariq ogohlantirish (BR-8).
  - Amalga oshirilishi (T-203): `app/[locale]/(app)/layout.tsx` (`requireSession`) → `components/app-shell/` (`sidebar-nav`, `mobile-nav` — `md` dan kichik ekranda Sheet, `user-menu` — F.I.O, login, rol, **Chiqish**; `stock-count-banner` — ochiq inventarizatsiya banneri, T-603).
  - Inventarizatsiya banneri (T-603): `components/app-shell/stock-count-banner.tsx` (server) layout bilan `stockCounts.openCounts(ctx)` ni o'qiydi → `features/stock-counts/components/open-stock-count-banner.tsx` (client): header ostida sariq chiziq; bitta sanoq — bitta jumla, bir nechta — ro'yxat; raqam `/stock-counts/[id]` ga havola. Sanoqning o'z formasida o'sha sanoq ko'rsatilmaydi (`bannerCounts`, formada o'z ogohlantirishi bor). Next.js layout'ni client navigatsiyada qayta render qilmaydi, shuning uchun banner har pathname o'zgarishida va tab qayta ko'ringanda `GET /api/stock-counts/open` ni o'qiydi (taymer bilan so'rov yo'q, OQ-34); layout qayta render bo'lsa (inventarizatsiya amallari `revalidatePath('/[locale]', 'layout')`) server ro'yxati ustun. `template.tsx` ham, `@banner` parallel route slot (catch-all) ham yaramadi: birinchisi ham qayta render bo'lmaydi, ikkinchisi Next 16 qat'iy route moslashuvida `/[locale]` va `(auth)/login` bilan to'qnashadi.
  - Menyu — `lib/nav.ts`: `NAV_SECTIONS` (bo'lim → `href`, ruxsat `permissions.ts` dan, ikonka), `navForRole(role)` (ruxsatsiz bo'lim va bo'sh guruh tushiriladi). Ro'yxatda `sale.read`/`purchase.read` yo'q, shuning uchun Savdo/Xarid/Inventarizatsiya bo'limlari `*.write` ruxsati bilan ochiladi (ikkala rolda bor).
  - Sahifa himoyasi — **serverda**: har sahifa `requireSection(locale, 'cash')` yoki `requirePermission(locale, 'cash.read')` (`lib/session.ts`) chaqiradi → ruxsat yo'q bo'lsa `forbidden()` → `(app)/forbidden.tsx` (HTTP 403, menyu bilan). Next.js'da bu `experimental.authInterrupts` bayrog'ini talab qiladi (`next.config.ts`). Menyu va sahifa tekshiruvi bitta jadvaldan (`NAV_SECTIONS`) olinadi. Hali tayyor bo'lmagan bo'limlar — `ComingSoon` placeholder (keyingi vazifalar almashtiradi).
  - Server Component'da o'qish: `getServiceContext(session)` (`lib/session.ts`) → servis (masalan `categories.list(ctx)`). Bildirishnoma — `toast` (`@drinks/ui/components/sonner` dan qayta eksport, `Toaster` root layout'da).
  - Foydalanuvchilar (T-204): `/users` — `features/users` (`UsersTable`, `CreateUserDialog` / `EditUserDialog` / `SetPasswordDialog`); `/account` — "Mening akkauntim" (har rol, foydalanuvchi menyusida havola; formalar faqat Egasiga). Sana-vaqt UI'da `formatDateTime` (`@drinks/shared`, `DD.MM.YYYY HH:mm`, do'kon vaqt zonasi) bilan — `Intl` ning `uz` formati Node va brauzerda farq qilib, hydration xatosi beradi.
  - Toifa va brend (T-302): `/products/categories`, `/products/brands` (`products` bo'limi ruxsati) — `features/catalog` (`CatalogPage` server, `CatalogTable` + `CatalogItemDialog` client, `actions.ts`; `?archived=1` — arxiv ro'yxati).
  - Omborlar (T-304): `/warehouses` (`warehouses` bo'limi ruxsati) — `features/warehouses` (`WarehousesPage` server; har ombor — `WarehouseCard` client: sub-omborlar `DataTable` da, "Qoldiq bor/Bo'sh" holati, arxivdagi sub-ombor belgisi; `WarehouseNameDialog` — ikkala daraja uchun qo'shish/nomlash; `actions.ts`; `?archived=1` — arxivdagi omborlar). Hujjat formalari ombor tanlovini `warehouses.options(ctx)` dan oladi.
  - Mahsulotlar (T-303): `/products` (ro'yxat; filtrlar URL'da — `?q=&category=&brand=&archived=1&page=`, `features/products/list-params.ts` noto'g'ri qiymatlarni tashlab yuboradi), `/products/new`, `/products/[id]` (tahrirlash + arxivlash/tiklash). `features/products`: `ProductFilters` (qidiruv 300 ms debounce bilan `router.replace`), `ProductTable`, `ProductForm` (react-hook-form + `productCreateInputSchema`, blok narxi jonli, blokdagi dona soni o'zgarsa AlertDialog — OQ-06, rasm saqlashdan keyin alohida yuboriladi), `ProductArchiveDialog`/`ProductArchiveButton`, `ProductThumb`; `actions.ts`. Formada faol toifa/brendlar + mahsulotning o'z arxivlangan qiymati ("(arxiv)").
  - Xaridlar (T-404): `/purchases` (ro'yxat; filtrlar URL'da — `?status=&from=&to=&q=&page=`, `features/purchases/list-params.ts`), `/purchases/new`, `/purchases/[id]` (qoralama — forma, boshqa holat — faqat ko'rish `PurchaseView`). `PurchaseForm` — `useFieldArray` qatorlar, `ProductPicker` (nom/SKU/shtrix-kod bo'yicha qidiruv; skaner kodni yozib Enter bossa aniq SKU/shtrix-kod tanlanadi), sub-ombor `Select` (omborlar bo'yicha guruhlangan), birlik, soni (blokda "= N dona"), narx, qator summasi; to'lov qismlari va farq ko'rsatkichi, "Qolganini naqdga". Saqlangach sahifa `key={version}` bilan qayta o'rnatiladi; `DOCUMENT_CHANGED` da "Sahifani yangilash" tugmasi. `DocStatusBadge` — hujjat holati.
  - Kassa (T-701, faqat OWNER — `requireSection('cash')`, servis ham `cash.read` bilan rad etadi): `/cash` — ikki kassa balansi kartalari, jurnal (filtrlar URL'da — `?from=&to=&cashbox=&type=&direction=&page=`, `features/cash/list-params.ts`), Σ kirim/chiqim, `balance_after` ustuni, sahifalash. T-702 amallar tugmalarini `PageHeader` `actions` ga qo'shadi.
  - Qoldiq hisoboti (T-801): `/reports/stock` (`stockReport` bo'limi, `report.stock` — ikkala rol) — `reports.stock(ctx, filters)` (`modules/reports`), filtrlar URL'da (`?warehouse=&sub=&category=&brand=&low=1&archived=0|1`, `features/reports/stock-params.ts`). `StockReportFiltersBar` (ombor → uning sub-omborlari, toifa, brend, mahsulot holati, "Kam qolganlar"), `StockReportTable` — tannarx ustunlari faqat javobda `totals.value` bo'lsa (server STAFF uchun kalitlarni umuman qo'shmaydi). `reports` obyekti `modules/reports/index.ts` da yig'iladi (`stock`, `sales`, `pnl`); mahsulot bloki (select, tartib, DTO) — `report-product.ts`, jadvaldagi mahsulot katakchasi — `ReportProductCell`.
  - Savdo hisoboti (T-802): `/reports/sales` (`salesReport` bo'limi, `report.sales` — ikkala rol) — `reports.sales(ctx, { from, to })`, davr URL'da (`?from=&to=`, `features/reports/sales-params.ts`; parametrsiz — joriy oy, OQ-35; teskari oraliq almashtiriladi). `SalesReportFiltersBar` (ikki sana, "Bugun", "Shu oy"), jami bloki, `SalesReportTable` — tannarx va yalpi foyda ustunlari faqat javobda `totals.cost` bo'lsa. URL parametrlarini o'qish yordamchilari — `lib/search-params.ts` (`firstParam`, `uuidParam`, `dateParam`).
  - P&L (T-803): `/reports/pnl` (`pnlReport` bo'limi, `report.pnl` — faqat OWNER; STAFF menyuda ko'rmaydi, sahifa 403, servis `FORBIDDEN`) — `reports.pnl(ctx, { from, to })`. Davr URL'da — `?day=` / `?month=YYYY-MM` / `?year=YYYY` / `?from=&to=` (`features/reports/pnl-params.ts`: birinchi to'g'ri tur ustun, parametrsiz — joriy oy, OQ-36; `pnlPeriodRange` davrni Toshkent kunlari oralig'iga aylantiradi, `shiftPnlPeriod` — ‹ › qadami, kelajakka emas, `switchPnlPeriodKind` — tur almashganda joy saqlanadi). `PnlPeriodFilter` (Kun / Oy / Yil / Oraliq, kun va oraliq sana maydonlari bilan), `PnlStatement` (BR-11 qatorlari, chiqimlar ishorasi bilan, manfiy foyda qizil), oy nomlari tarjimadan (`pnlReport.period.month`, Intl emas — hydration).
  - Umumiy UI: `packages/ui` — `DataTable` (TanStack Table v9, `dataTableColumnHelper<T>()`; ustunlar render funksiyasi bo'lgani uchun Client Component modulida e'lon qilinadi; filtr/sahifalash serverda), `PageHeader`, shadcn `alert-dialog`, `sheet`, `separator`. `apps/web/src/components` (tarjima kerak bo'lganlar) — `MoneyText` (`formatSom` + `common.som`), `QtyText` (`formatQty` + `enums.QtyUnit.*`), `ConfirmDialog` (bajarish/storno/o'chirishdan oldin; `onConfirm` tugaguncha ochiq turadi).
- Hujjat formalari (savdo/xarid): qatorlar jadvali, har qatorda mahsulot (qidiruv/shtrix-kod), sub-ombor, miqdor (dona/blok almashtirgich), narx, summa; pastda to'lov qismlari (Naqd/Karta/Nasiya) va "Qoldiq: N blok M dona" ko'rsatkichi. Tugmalar: **Saqlash (qoralama)** · **Bajarish** · **O'chirish** (faqat qoralama) · **Storno** (faqat bajarilgan).
- Savdo qatorida qoldiq yetmasa — qator qizil, xabar, "Bajarish" o'chiq (FR-3.3). Bajarishda server yana tekshiradi (BR-7).
- Raqamlar: so'm `1 250 000 soʻm` formatida (no-break space bilan), miqdor `3 blok 2 dona` — faqat `@drinks/shared` dagi `formatSom` / `formatQty` orqali ([business-logic.md §1.4](business-logic.md)).
- Responsiv: asosan desktop/planshet; telefon ekranida ham ishlashi kerak (kassada telefon bilan ishlatilishi mumkin).

## 7. i18n
- `next-intl`, URL prefiks: `/uz/...`, `/ru/...` (`localePrefix: 'always'`); default `uz`. Barcha sahifalar `app/[locale]/` ostida, root layout — `app/[locale]/layout.tsx` (`<html lang>` locale'dan; `generateStaticParams` + `setRequestLocale` — statik render).
- Fayllar: `src/i18n/routing.ts` (locale ro'yxati `@drinks/shared` `Locale` enumidan), `src/i18n/navigation.ts` (`Link`, `useRouter`, `usePathname`, `redirect` — `next/link`/`next/navigation` o'rniga shularni ishlating), `src/i18n/request.ts` (xabarlarni yuklash), `src/proxy.ts` (prefikssiz yo'l → locale'ga redirect; `api`, `_next` va fayllar chiqarib tashlangan). Kalitlar tiplangan: `src/global.d.ts` (`AppConfig.Messages` = `uz.json` shakli) — mavjud bo'lmagan kalit `typecheck` da xato.
- Prefikssiz yo'l (`/`) uchun til: `NEXT_LOCALE` cookie → brauzer `Accept-Language` → `uz` (next-intl standarti; OQ-16).
- Til almashtirgich (`src/components/locale-switcher.tsx`) URL prefiksini almashtiradi, cookie'ni next-intl yozadi. Foydalanuvchi tanlagan til `user.locale` da saqlanadi (`features/i18n/actions.ts` → `saveUserLocale` → `users.updateOwnLocale`, audit `USER_UPDATE`; sessiyasiz — faqat URL/cookie), login'dan keyin shu tilga yo'naltiriladi (T-201).
- Tarjima kalitlari modul bo'yicha: `products.title`, `errors.INSUFFICIENT_STOCK`, `enums.CashTxType.TRAVEL_EXPENSE`. `apps/web/test/messages.test.ts` tekshiradi: `uz.json` va `ru.json` kalitlari bir xil, bo'sh qiymat yo'q, `errors.*` = `ErrorCode` ro'yxati, `enums.*` = `shared/enums.ts` a'zolari. Yangi xato kodi yoki enum qo'shilsa — ikkala faylga tarjima qo'shilmaguncha test qizil.
- O'zbekcha matnlarda `oʻ`/`gʻ` uchun U+02BB (ʻ), tutuq belgisi uchun U+02BC (ʼ) ishlatiladi — oddiy `'` ICU formatida maxsus belgi.
- Foydalanuvchi kiritgan ma'lumot (mahsulot nomi, izohlar) tarjima qilinmaydi.
- PDF/Excel eksport ham joriy til bo'yicha.

## 8. Docker va muhitlar

### 8.1 Lokal ishlab chiqish
- Faqat **PostgreSQL** Docker'da; Next.js host'da `pnpm dev` bilan (tez HMR).
- `docker/compose.dev.yml`:
  - `postgres` — `postgres:17-alpine`, port `5433:5432` (hostdagi boshqa Postgres bilan to'qnashmasligi uchun), named volume `pgdata`, healthcheck `pg_isready`, init skript ikkita DB yaratadi: `drinks_trade` va `drinks_trade_test`.
  - `adminer` — ixtiyoriy (`profiles: [tools]`), port `8080`. Yoqish: `docker compose -f docker/compose.dev.yml --profile tools up -d`.
- Init skript: `docker/postgres/init/01-create-databases.sql` — faqat `pgdata` volume bo'sh bo'lganda (birinchi ishga tushishda) bajariladi. Qayta yaratish uchun: `docker compose -f docker/compose.dev.yml down -v` (ma'lumotlar o'chadi).
- Healthcheck `pg_isready -h 127.0.0.1` — TCP orqali, shuning uchun init tugamaguncha `healthy` bo'lmaydi.

### 8.2 Muhit o'zgaruvchilari (`.env.example`)
```
DATABASE_URL=postgresql://drinks:drinks@localhost:5433/drinks_trade
DATABASE_URL_TEST=postgresql://drinks:drinks@localhost:5433/drinks_trade_test
SESSION_SECRET=change-me
APP_TIMEZONE=Asia/Tashkent
UPLOAD_DIR=./storage/uploads
SEED_OWNER_USERNAME=owner
SEED_OWNER_PASSWORD=change-me
```

### 8.3 Root skriptlar
| Skript | Vazifa |
|---|---|
| `pnpm db:up` / `db:down` | Docker Postgres'ni yoqish (`--wait`: `healthy` bo'lguncha kutadi) / o'chirish (volume saqlanadi) |
| `pnpm db:logs` | Postgres loglarini kuzatish |
| `pnpm db:migrate` | `prisma migrate dev` (`@drinks/db` orqali; yangi migratsiya: `pnpm db:migrate --name <nom>`) |
| `pnpm db:generate` | `prisma generate` (`pnpm install` da `@drinks/db` `postinstall` i ham bajaradi; DB kerak emas) |
| `pnpm db:reset` | `prisma migrate reset --force` — dev bazani o'chirib, migratsiyalarni qayta qo'llaydi (Prisma 7 seed'ni avtomatik ishlatmaydi) |
| `pnpm db:seed` | boshlang'ich ma'lumot (OWNER, do'kon, 2 kassa) — `prisma db seed` → `prisma.config.ts` `migrations.seed` (`tsx prisma/seed.ts`); idempotent |
| `pnpm db:seed:dev` | `db:seed` + namunaviy ma'lumot (`seed.dev.ts`, `NODE_ENV=production` da ishlamaydi); idempotent |
| `pnpm db:studio` | Prisma Studio |
| `pnpm user:reset-password <login>` | parolni tiklash (Egasi unutsa; business-logic §11): yangi parol ikki marta yashirin so'raladi, sessiyalar va login bloki o'chiriladi, audit `PASSWORD_RESET`. `packages/server/scripts/reset-password.ts` (`tsx`), root `.env` dagi `DATABASE_URL` ga ulanadi |
| `pnpm dev` | Next.js dev |
| `pnpm test` / `test:int` / `test:e2e` | testlar (`test` — DB'siz unit; `test:int` — `@drinks/db` va `@drinks/server` integratsiya testlari `DATABASE_URL_TEST` bazasida, `*.int.test.ts`) |
| `pnpm lint` | root `eslint .` (butun repo, bitta config) |
| `pnpm format` / `format:check` | Prettier (yozish / tekshirish) |
| `pnpm typecheck` / `build` | turbo orqali |

### 8.4 Production (keyingi bosqich — SRS 8: "texnologiya, joylashtirish keyin")
`compose.prod.yml`: `web` (Next.js `output: 'standalone'`, `web.Dockerfile` multi-stage), `postgres`, bir martalik `migrate` servisi (`prisma migrate deploy`), kunlik `pg_dump` backup. Joylashtirish platformasi ochiq savol (OQ-12).

## 9. Fayl saqlash
Mahsulot rasmi (FR-1.1) — v1 da server diskidagi `UPLOAD_DIR` (Docker volume). Kod `StorageAdapter` interfeysi orqali yozadi, keyin S3/MinIO ga o'tish oson. Rasm hajmi ≤ 2 MB, formatlar: jpg/png/webp; serverda 512px gacha kichraytiriladi (sharp).

Amalda (T-303):
- `packages/server/src/core/storage.ts` — `StorageAdapter { put(key, data), get(key) → bytes | null, delete(key) }`, `LocalDiskStorage(root)` (vaqtinchalik fayl + `rename` — yarim yozilgan fayl ko'rinmaydi; kalit `^[a-z0-9-]+(/[a-z0-9-]+)*\.[a-z0-9]+$` — `..` va absolyut yo'l yo'q), `getStorage()` — har chaqiruvda `UPLOAD_DIR` ni o'qiydi (default `./storage/uploads`, nisbiy yo'l **jarayon cwd** siga nisbatan: `pnpm dev` da `apps/web/storage/uploads`; `storage/` gitignore'da). Production'da `UPLOAD_DIR` absolyut yo'l (volume) bo'lishi kerak.
- `sharp` 0.35.5 (`@drinks/server` dependency, versiya qotirilgan; Next.js ham shu versiyani ishlatadi, prebuilt binary — install skript kerak emas). Next.js uni `serverExternalPackages` ro'yxati bo'yicha bundle qilmaydi, `standalone` chiqishiga trace qilinadi. Rasm doim **WebP** sifatida saqlanadi (`products/<id>/<uuid>.webp`).
- Yuklash: client `FormData { id, file }` → Server Action `setProductImage` (`features/products/actions.ts`); Server Action body chegarasi `next.config.ts` da `experimental.serverActions.bodySizeLimit: '3mb'` (default 1 MB). Client oldindan hajm/turni tekshiradi, server baribir baytlarni tekshiradi.
- Ko'rsatish: `GET /api/products/[id]/image?v=<imageVersion>` (Route Handler) — sessiya talab qilinadi (`public/` emas), `products.readImage`; versiya URL'da bo'lgani uchun `Cache-Control: private, max-age=31536000, immutable`. `<img>` ishlatiladi (`next/image` optimizatsiyasi bu yerda foyda bermaydi).

## 10. Test strategiyasi

| Daraja | Nima | Vosita |
|---|---|---|
| Unit | `shared`: birliklar, tannarx formulasi, P&L formulasi, zod sxemalar | Vitest |
| Integratsiya | `server` servislari haqiqiy Postgres'da (`drinks_trade_test`): savdo/xarid/storno/inventarizatsiya, kassa manfiy bo'lmasligi, **parallel savdo bajarish** (BR-7) | Vitest + Docker DB |
| E2E | Asosiy oqimlar: login → xarid → savdo → hisobot; STAFF foyda ko'rmasligi | Playwright |

Vitest sozlamasi: har paketda `vitest.config.ts` (`defineProject`, testlar `src/**/*.test.ts`, paket ichida `test` skripti `vitest run`); `pnpm test` turbo orqali paketlar bo'yicha ishlaydi. Root `vitest.config.ts` barcha paketlarni `projects` sifatida bitta jarayonda ishga tushiradi (`pnpm exec vitest`).

Integratsiya testlari (`pnpm test:int`): har paketda `vitest.int.config.ts` (`test/int/**/*.int.test.ts`, `fileParallelism: false`); root skript paketlarni ketma-ket ishga tushiradi (`pnpm -r --workspace-concurrency=1 --if-present run test:int`), chunki hammasi bitta `drinks_trade_test` bazasini ishlatadi. Umumiy to'plam — `@drinks/db/test-utils` (`packages/db/test-utils/README.md`):
- `globalSetup` → `@drinks/db/test-utils/global-setup`: `prisma migrate deploy` → `DATABASE_URL_TEST` (nomi `*_test` bo'lishi shart);
- `setupFiles` → `@drinks/db/test-utils/setup`: `DATABASE_URL` ni test bazasiga yo'naltiradi va **har test faylidan oldin** `truncateAll` (`TRUNCATE … RESTART IDENTITY CASCADE`; append-only triggerlar TRUNCATE'da ishlamaydi — testda tekshirilgan);
- fabrikalar: `makeOrganization`, `makeStore`, `makeUser`, `makeCategory`, `makeBrand`, `makeProduct`, `makeWarehouse` (+ sub-omborlar), `makeSubWarehouse`, `makeCashbox`, `makeStoreFixture`;
- `assertInvariants(db)` — `stock_balance.qty = Σ stock_movement.qty_delta`, `product_cost.total_qty = Σ stock_balance.qty` (do'kon bo'yicha), `cashbox.balance = Σ IN − Σ OUT`. Zaxira yoki kassaga tegadigan **har bir integratsiya testi oxirida** chaqiriladi (odatda `afterEach`).

CI'da `integration` job Postgres 17 service (`drinks_trade_test`) bilan `pnpm test:int` ni ishga tushiradi.

Biznes qoidalar uchun har bir BR-xx ga kamida bitta integratsiya testi bo'lishi shart; test nomida BR raqami yoziladi (`it('BR-7: qoldiq yetmasa savdo bajarilmaydi')`).

## 11. Foydalanuvchilar va akkauntlar (OQ-10)
- Har foydalanuvchining o'z **logini va paroli** bor. Umumiy akkaunt ishlatilmaydi, aks holda audit "kim qildi"ni ko'rsata olmaydi.
- **Egasi (OWNER)** — tizimda bitta. U seed orqali yaratiladi (`SEED_OWNER_*` env).
- **Xodimlar (STAFF)** — cheklanmagan son. Ularni faqat Egasi **Foydalanuvchilar** bo'limida boshqaradi:
  - yaratish: F.I.O, login, parol;
  - tahrirlash: F.I.O, login, parol (yangi parol o'rnatish), interfeys tili;
  - faolsizlantirish/qayta faollashtirish (`is_active`). Akkaunt **o'chirilmaydi**, chunki hujjat va auditda unga havola bor.
- Egasi o'z login va parolini ham shu yerdan o'zgartiradi (joriy parolni kiritish sharti bilan). Xodim o'z parolini o'zgartira olmaydi, buni Egasi qiladi.
- Login yoki parol o'zgarganda yoki akkaunt faolsizlantirilganda o'sha foydalanuvchining **barcha sessiyalari darhol o'chiriladi**: u qayta kirishi kerak bo'ladi. Istisno (OQ-22): Egasi "Mening akkauntim"da **o'z** login/parolini o'zgartirsa, shu o'zgarishni qilgan sessiya qoladi, boshqa barcha sessiyalari o'chiriladi.
- Egasi parolini unutsa, uni serverda CLI orqali tiklaydi: `pnpm user:reset-password <login>` (T-205: `packages/server/scripts/` — faqat I/O, mantiq `users.resetPassword` da; skript `src/index.ts` ni emas, modulni to'g'ridan-to'g'ri import qiladi, chunki `server-only` Node'da xato beradi).
- Login: 3–32 belgi, `a-z 0-9 . _ -`, katta-kichik harf farqlanmaydi (kichik harfda saqlanadi), yagona bo'ladi. Parol: kamida 8 belgi.
- Barcha amallar auditga yoziladi: `USER_CREATE`, `USER_UPDATE`, `PASSWORD_RESET`, `USER_DEACTIVATE`, `USER_ACTIVATE` (T-204). Parolning o'zi ham, hashi ham auditga yozilmaydi.
- Amalda (T-204): servis — `packages/server/src/modules/users` ([business-logic.md §11](business-logic.md)); UI — `/users` (`users` bo'limi, `user.manage`: ro'yxat, "Xodim qo'shish" dialogi, qatorda tahrirlash / parol o'rnatish dialoglari va faolsizlantirish/faollashtirish tasdig'i) va `/account` — **Mening akkauntim** (foydalanuvchi menyusidan, faqat `requireSession`: Egasi F.I.O, login, parolni o'zgartiradi; Xodim faqat ko'radi). Kod: `apps/web/src/features/users` (`actions.ts`, `form-errors.ts`, `components/`).

## 12. Kuzatuv va xavfsizlik
- pino JSON log, har so'rovda `requestId`.
- Parollar argon2id; login urinishlari cheklanadi (5 ta xato → 15 daqiqa blok, IP+username bo'yicha).
  Amalda (T-201): `packages/server/src/modules/auth` — `@node-rs/argon2` (argon2id, PHC satr), hisoblagich `login_attempt` jadvalida ([database.md §6.6](database.md)); blok paytida (6-urinish) parol to'g'ri bo'lsa ham `TOO_MANY_ATTEMPTS` (`params.lockedUntil`). IP — `X-Forwarded-For` ning birinchi qiymati, bo'lmasa `X-Real-IP` (`apps/web/src/lib/session.ts`); ilova bitta reverse proxy ortida turadi deb hisoblanadi (OQ-12) — proxy'siz bu sarlavhani mijoz soxtalashtira oladi.
- Cookie: `dt_session`, `httpOnly`, `secure` (prod), `sameSite=lax`, `path=/`, `maxAge` 30 kun (`apps/web/src/lib/session-cookie.ts`); Server Actions CSRF himoyasi Next.js'da o'rnatilgan (Origin tekshiruvi).
- Sessiya oqimi (T-201): `proxy.ts` faqat cookie bor-yo'qligini tekshiradi (DB'siz) va cookie muddatini suradi; haqiqiy tekshiruv — `lib/session.ts` `getCurrentSession()` (`auth.getSession`, so'rov uchun `React.cache`) va `requireSession(locale)` (sessiya yo'q → `/[locale]/login`). Login/logout — `features/auth/actions.ts` Server Action'lari; muvaffaqiyatli login `user.locale` tilidagi bosh sahifaga yo'naltiradi.
- Barcha kiritmalar zod bilan serverda qayta tekshiriladi.
- `/api/health` — DB ulanishini tekshiradi (Docker healthcheck uchun).

## 13. Kengayish (filiallar) — tayyorgarlik
- Ma'lumotlar `organization → store` ierarxiyasida; har bir operatsion jadvalda `store_id` bor ([database.md §2](database.md)).
- Ma'lumotnoma (mahsulot, toifa, brend) — `organization` darajasida (filiallar uchun umumiy katalog).
- Tannarx `(store_id, product_id)` bo'yicha — har filial o'z o'rtacha tannarxiga ega.
- v1 da UI'da do'kon tanlovi yo'q; `storeId` sessiyadan (yagona do'kon) olinadi.
