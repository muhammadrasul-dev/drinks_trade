# Kod konventsiyalari va ish jarayoni

Versiya: 0.1 · Sana: 2026-10-22
Odam ham, AI ham shu qoidalarga amal qiladi. Qoida o'zgarsa — shu fayl va kerak bo'lsa `decisions.md` yangilanadi.

---

## 1. Til
- **Kod, identifikatorlar, commit xabarlari, kod izohlari — ingliz tilida.**
- **Hujjatlar (`.claude/docs`, `docs/`) — o'zbek (lotin).**
- UI matnlari — faqat `messages/uz.json`, `messages/ru.json` orqali; komponentda qattiq yozilgan matn bo'lmaydi.
- Domen atamalari lug'ati (kod ↔ biznes):

| Kod | O'zbekcha |
|---|---|
| `Sale` | Savdo |
| `Purchase` | Xarid |
| `StockCount` | Inventarizatsiya |
| `Warehouse` / `SubWarehouse` | Ombor / Sub-ombor |
| `StockBalance` | Qoldiq |
| `StockMovement` | Tovar harakati |
| `ProductCost.avgCost` | O'rtacha tannarx |
| `Cashbox` / `CashTransaction` | Kassa / Kassa harakati |
| `Debt` (`RECEIVABLE` / `PAYABLE`) | Qarz (Menga qarz / Mendan qarz) |
| `post` / `POSTED` | Bajarish / Bajarilgan |
| `reverse` / `REVERSED` | Storno / Storno qilingan |
| `paidCredit` | Nasiya |
| `unitsPerBlock` | Blokdagi dona soni |
| `OWNER` / `STAFF` | Egasi / Xodim |

## 2. TypeScript
- `strict: true`, `noUncheckedIndexedAccess: true`. `any` taqiqlangan (zarur bo'lsa `unknown` + tekshiruv).
- Fayl nomlari: `kebab-case.ts`; React komponentlar: `PascalCase.tsx`.
- Funksiyalar: `camelCase`; tiplar/interfeyslar: `PascalCase`; konstantalar: `UPPER_SNAKE_CASE`.
- Default export faqat Next.js talab qilgan joyda (`page.tsx`, `layout.tsx`).
- Pul — `number` (butun so'm), hech qachon float hisob-kitob emas; tannarx — `Decimal`/string (serverda).

## 3. Paket chegaralari
[architecture.md §3.1](architecture.md) ga qarang. Qisqasi:
- `apps/web` Prisma'ni import qilmaydi.
- `packages/shared` Prisma va Node API'ni import qilmaydi.
- Modul boshqa modulning `*.repo.ts` siga kirmaydi.
- Joylashuv: hisob-kitob formulalari (qatordagi dona `unitPieces`, `toPieces`, to'lov yig'indisi `paymentSum`, ombor kaliti `stockKeyOf`) — `packages/shared`, server va forma bir xil funksiyani ishlatadi; Prisma xatosini aniqlash (`isUniqueViolation`) va hujjat qatori mahsulotlarini yuklash/tekshirish (`loadActiveProducts`, `assertLineProductsUnchanged`) — `packages/server/src/core`; bir nechta feature ishlatadigan UI — `apps/web/src/components` yoki `apps/web/src/lib`, feature'lar bir-birining `components/` papkasiga kirmaydi (faqat `list-params` kabi havola yordamchilari mumkin).

## 4. Servis yozish qoidalari
- Imzo: `fn(ctx: ServiceContext, input: z.infer<typeof Schema>)` yoki tranzaksiya ichida `fn(tx, ctx, input)`.
- Birinchi qator — `assertCan(ctx.user, 'permission')`.
- Kiritma `shared` zod sxemasi bilan qayta tekshiriladi.
- Yozuvchi funksiya — `withTransaction` + `audit.log`.
- Xato — faqat `throw new DomainError(ErrorCode.X, params)`. Matn emas, kod.
- Qaytariladigan qiymat — DTO (`mapper` orqali, rolga qarab filtrlangan), Prisma obyekti emas.

## 5. Testlar
- Har BR qoidasi uchun integratsiya testi, nomida BR raqami: `it('BR-7: ...')`.
- Integratsiya testlari `drinks_trade_test` DB'da; har test tranzaksiyada yoki `TRUNCATE` bilan izolyatsiya.
- PR'dan oldin: `pnpm lint && pnpm typecheck && pnpm test`.
- CI (`.github/workflows/ci.yml`, push `main` va har PR): `pnpm install --frozen-lockfile`, `lint`, `format:check`, `typecheck`, `test`, `build`. Integratsiya job'i (Postgres service) T-105 da yoqiladi.
- E2E (T-1001): `pnpm test:e2e` — Playwright, `apps/e2e`; o'z bazasi (`drinks_trade_e2e`, har ishga tushishda qayta yaratiladi) va 3911-port, `pnpm test` ga kirmaydi. Foydalanuvchi oqimiga tegadigan o'zgarishdan keyin (sahifa, forma, menyu, matn kaliti) ishga tushiriladi; CI'da `e2e` job. Yangi oqim — `apps/e2e/tests/*.spec.ts`, o'z ma'lumotini UI orqali o'z nomi bilan yaratadi, lokatorlar rol/label va `messages/*.json` matnlari bo'yicha. Batafsil — [architecture.md §10](architecture.md).

## 6. Git
- Asosiy branch: `main`. Ish: `feat/<qisqa-nom>`, `fix/...`, `docs/...`, `chore/...`.
- Commit: Conventional Commits — `feat(sales): post sale with stock check`.
- Bitta commit/PR — bitta mantiqiy o'zgarish (kod + migratsiya + test + hujjat birga).
- `.env` commit qilinmaydi; `.env.example` yangilanadi.

## 7. Hujjatlarni yangilash (AI ish jarayoni)
Har bir vazifada AI:
1. Promptni `ai-prompts.md` oxiriga qo'shadi.
2. Vazifani `tasks.md` dan oladi (bog'liq vazifalar tayyorligini tekshiradi), tugagach holatini yangilaydi.
3. Ishni boshlashdan oldin tegishli hujjatni o'qiydi (`database.md`, `business-logic.md`...).
4. Sxema o'zgarsa — `database.md`; algoritm o'zgarsa — `business-logic.md`; yangi texnik qaror — `decisions.md` (yangi ADR).
5. Noaniqlik chiqsa — o'zi hal qilmaydi, `open-questions.md` ga yozadi va foydalanuvchidan so'raydi.
6. Foydalanuvchiga ko'rinadigan o'zgarish — `user-guide.md`.
