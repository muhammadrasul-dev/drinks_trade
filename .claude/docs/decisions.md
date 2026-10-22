# Qarorlar jurnali (ADR)

Har bir muhim texnik qaror shu yerda qisqa ADR shaklida yoziladi: **kontekst → qaror → oqibat**. Qaror o'zgarsa, eski yozuv o'chirilmaydi — holati `Almashtirildi (ADR-0XX)` qilinadi va yangi ADR yoziladi.

Holatlar: `Taklif` (foydalanuvchi tasdig'ini kutmoqda) · `Qabul qilingan` · `Almashtirildi`

| # | Qaror | Holat |
|---|---|---|
| ADR-001 | pnpm + Turborepo monorepo | Qabul qilingan |
| ADR-002 | Next.js fullstack, backend yadrosi alohida paketda | Qabul qilingan |
| ADR-003 | `packages/shared` — front va back umumiy kodi | Qabul qilingan |
| ADR-004 | Tailwind CSS v4 + shadcn/ui | Taklif |
| ADR-005 | PostgreSQL + Prisma, lokal DB Docker'da | Qabul qilingan |
| ADR-006 | O'zimizning sessiya-auth (kutubxonasiz) | Qabul qilingan |
| ADR-007 | Qoldiq: joriy balans + o'zgarmas jurnal | Qabul qilingan |
| ADR-008 | Pul BIGINT so'm, tannarx NUMERIC(20,4) | Qabul qilingan |
| ADR-009 | Bir vaqtdalik: pessimistik qulf + DB CHECK | Qabul qilingan |
| ADR-010 | PDF — @react-pdf/renderer, Excel — exceljs | Taklif |
| ADR-011 | Filialga tayyorlik: organization → store | Qabul qilingan |
| ADR-012 | Mutatsiyalar — Server Actions, eksport — Route Handlers | Taklif |
| ADR-013 | Audit — servisda aniq chaqiruv + DB trigger | Qabul qilingan |
| ADR-014 | i18n — next-intl, xato matnlari kod bo'yicha UI'da | Qabul qilingan |
| ADR-015 | Hujjatlar turi bo'yicha alohida jadvallar | Qabul qilingan |

---

## ADR-001 — pnpm + Turborepo monorepo
**Kontekst.** Foydalanuvchi talabi: front, back, DB sxemasi, Docker — bitta repoda; umumiy kod `shared` da. AI bilan ishlash uchun butun kontekst bitta joyda bo'lishi kerak.
**Qaror.** pnpm workspaces (`apps/*`, `packages/*`) + Turborepo (build/lint/test/typecheck vazifalari, kesh).
**Oqibat.** + Bitta `pnpm install`, bitta PR'da front+back+migratsiya. + Paket chegaralari aniq. − Monorepo sozlamasi biroz murakkabroq (tsconfig references, ESLint chegaralari). Alternativa Nx — bu loyiha uchun ortiqcha og'ir.

## ADR-002 — Next.js fullstack, backend yadrosi alohida paketda
**Kontekst.** Talab: Next.js + TypeScript fullstack. Shu bilan birga "front va back" ajratilgan bo'lishi kerak. Platforma (web/mobil) keyin aniqlanadi (SRS 8).
**Qaror.** Bitta deploy qilinadigan ilova `apps/web` (Next.js). Biznes mantiq `packages/server` da — Next.js'ga bog'liq emas, oddiy TS funksiyalar (`service(ctx, input)`). Next.js faqat UI + transport (Server Actions, Route Handlers).
**Oqibat.** + Bitta servis, bitta Docker image, oddiy deploy. + Backend testlari Next.js'siz ishlaydi. + Mobil/REST kerak bo'lsa, `apps/api` (masalan Hono) qo'shilib, xuddi shu `packages/server` ishlatiladi. − Alohida backend server (NestJS) bo'lmaydi. OQ-11 javobi: v1 faqat web, mobil yo'q — alohida `apps/api` qilinmaydi.
**Rad etilgan:** alohida `apps/api` (NestJS/Express) hozirdan — ikki servis, ikki deploy, CORS, auth ikki joyda; bitta do'kon uchun ortiqcha.

## ADR-003 — `packages/shared`
**Qaror.** Brauzerda ham, serverda ham ishlaydigan kod: zod sxemalar, DTO tiplar, enumlar, ruxsatlar matritsasi, xato kodlari, birlik/pul/tannarx sof funksiyalari. Prisma va Node API import qilinmaydi.
**Oqibat.** Validatsiya bir marta yoziladi; UI'dagi oldindan hisob (summa, blok/dona) server bilan bir xil. Enumlar Prisma enumlaridan alohida, lekin test bilan sinxronligi tekshiriladi.

## ADR-004 — Tailwind CSS v4 + shadcn/ui
**Kontekst.** Talab: Tailwind yoki tavsiya.
**Qaror.** Tailwind v4 + shadcn/ui (Radix primitivlar, komponent kodi repoga ko'chiriladi `packages/ui` ga). Ikonkalar — lucide.
**Oqibat.** + Kirish imkoniyati (a11y) tayyor, dialog/combobox/table kabi ERP uchun kerakli komponentlar bor. + Kod bizniki — AI erkin o'zgartira oladi, kutubxona "qora quti" emas. − Ant Design/MUI'dagi tayyor "data grid" yo'q — TanStack Table bilan yig'iladi.
**Rad etilgan:** Ant Design (og'ir, Tailwind bilan yaxshi chiqishmaydi), MUI (stil tizimi ikkita bo'lib qoladi).

## ADR-005 — PostgreSQL + Prisma, Docker
**Qaror.** PostgreSQL 17; Prisma — sxema, migratsiya, tiplangan so'rovlar. Prisma ifodalay olmaydigan narsalar (CHECK, partial index, trigger, `FOR UPDATE`) — qo'lda SQL migratsiya va `$queryRaw`. Lokal DB — `docker/compose.dev.yml`.
**Oqibat.** − Qulf so'rovlari raw SQL'da; ular `core/locks.ts` da jamlanadi va testlanadi.

## ADR-006 — O'zimizning sessiya-auth
**Kontekst.** 2 rol, username + parol, OAuth yo'q, bitta do'kon. Rol o'zgarsa yoki xodim o'chirilsa — darhol kuchga kirishi kerak.
**Qaror.** argon2id hash, `session` jadvali (tokenning SHA-256 hashi), httpOnly cookie, 30 kun sirpanuvchi muddat. Har so'rovda session DB'dan o'qiladi (JWT emas).
**Oqibat.** + Xodimni o'chirish = barcha sessiyalari darhol bekor. + ~200 qator kod, to'liq nazorat, tashqi bog'liqlik yo'q. − Parolni email orqali tiklash yo'q. OQ-10 bo'yicha har foydalanuvchining o'z logini va paroli bor. Bitta OWNER bo'ladi, STAFF soni cheklanmagan. Xodim akkauntlarini (login, parol) faqat OWNER yaratadi va tahrirlaydi. OWNER o'z parolini unutsa, CLI orqali tiklanadi. Login yoki parol o'zgarsa, sessiyalar darhol o'chiriladi.
**Rad etilgan:** Auth.js (credentials + DB sessiya noqulay), Better Auth (ishlaydi, lekin bu hajm uchun ortiqcha jadvallar va abstraksiya). Agar kelajakda OAuth/2FA kerak bo'lsa — Better Auth'ga o'tish ko'rib chiqiladi.

## ADR-007 — Qoldiq: joriy balans + jurnal
**Qaror.** `stock_balance` (joriy) + `stock_movement` (faqat INSERT). Ikkalasi bitta tranzaksiyada. Kassa uchun ham xuddi shunday (`cashbox.balance` + `cash_transaction`).
**Oqibat.** + Qoldiqni o'qish tez (yig'indi hisoblanmaydi). + To'liq tarix, istalgan vaqtda qayta tekshirish (invariant testi). − Ikki joyni sinxron saqlash — faqat `inventoryService` orqali yoziladi.

## ADR-008 — Pul va tannarx turlari
**Qaror.** Pul — `BIGINT` (butun so'm). O'rtacha tannarx va birlik tannarx — `NUMERIC(20,4)`. Summaga aylantirishda ROUND HALF UP. Servis chegarasida `bigint → number` (`Number.isSafeInteger` tekshiruvi; 9·10¹⁵ so'mgacha xavfsiz), `Decimal → string`.
**Oqibat.** + UI va JSON'da BigInt muammosi yo'q. − Juda katta qiymat bo'lsa xato chiqadi (amalda imkonsiz).

## ADR-009 — Bir vaqtdalik
**Qaror.** `READ COMMITTED` + `SELECT ... FOR UPDATE` qat'iy tartibda ([business-logic.md §2](business-logic.md)); DB `CHECK` cheklovlari oxirgi himoya. Qoralamalarda optimistik `version`.
**Oqibat.** + BR-7 (manfiy qoldiq yo'q) kafolatlangan. + Parallel savdo testi majburiy.
**Rad etilgan:** `SERIALIZABLE` — retry mantiqi kerak, Prisma bilan noqulay.

## ADR-010 — Eksport
**Qaror.** PDF: `@react-pdf/renderer` (serverda, kirill + lotin shrift — Noto Sans/Inter fayli repoda). Excel: `exceljs` (raqamlar raqam formatida, so'm formati bilan).
**Oqibat.** − Headless Chrome (Puppeteer) ishlatilmaydi — Docker image yengil. Murakkab dizayn kerak bo'lsa qayta ko'riladi.

## ADR-011 — Filialga tayyorlik
**Qaror.** `organization → store`. Katalog (mahsulot, toifa, brend, foydalanuvchi) — organization darajasida; omborlar, hujjatlar, kassa, qarz, tannarx, audit — `store_id` bilan. v1 da bitta store, UI'da tanlov yo'q.
**Oqibat.** Filial qo'shish = `store` qatori + foydalanuvchi↔do'kon bog'lanishi (keyingi versiyada `user_store` jadvali) + UI'da do'kon tanlovi. Mavjud jadvallar o'zgarmaydi. Mahsulot sotuv narxi hozircha umumiy — filiallarda farqli narx kerak bo'lsa `store_product_price` qo'shiladi.

## ADR-012 — Server Actions va Route Handlers
**Qaror.** Forma mutatsiyalari — Server Actions (`ActionResult` qaytaradi). Fayl eksporti, health-check — Route Handlers. O'qish — Server Components ichida servis chaqiruvi.
**Oqibat.** + Alohida API qatlami, fetch, kesh kutubxonasi kerak emas. − Tashqi klient (mobil) uchun API yo'q — kerak bo'lsa ADR-002 dagi yo'l.

## ADR-013 — Audit
**Qaror.** Har yozuvchi servis funksiyasi o'z tranzaksiyasida `audit.log()` chaqiradi. `audit_log` ga UPDATE/DELETE trigger bilan taqiqlangan.
**Oqibat.** + Audit va o'zgarish atomik (biri bo'lib, ikkinchisi yo'qolmaydi). + Kod ko'rib chiqishda aniq ko'rinadi. − Unutish xavfi — har servis testida audit yozuvi tekshiriladi.

## ADR-014 — i18n
**Qaror.** next-intl, `/uz` va `/ru` prefikslari, default `uz` (lotin). Server xato **kodini** qaytaradi, matn UI'da tarjima qilinadi.

## ADR-015 — Hujjatlar uchun alohida jadvallar
**Kontekst.** Variant: bitta umumiy `document` + `document_line` jadvali yoki turi bo'yicha alohida jadvallar.
**Qaror.** Alohida: `sale/sale_line`, `purchase/purchase_line`, `stock_count/...`.
**Oqibat.** + Har tur o'z maydonlari va CHECK'lariga ega (savdo qatorida `unit_cost` muzlatiladi, xaridda `input_price`), null'ga to'la ustunlar yo'q. + AI va odam uchun tushunarli. − Umumiy maydonlar (status, raqam, sana) takrorlanadi — kodda umumiy helper bilan.
