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
