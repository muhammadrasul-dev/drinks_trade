# drinks_trade — AI uchun yo'riqnoma

Ichimliklar do'koni uchun mini-ERP. Monorepo: Next.js (fullstack) + TypeScript + Tailwind/shadcn + Prisma + PostgreSQL (Docker).

## Avval o'qing
- Biznes talablar: `.claude/docs/01-srs.md` (BR-xx, FR-xx raqamlari shu yerda)
- Texnik hujjatlar: `.claude/docs/README.md` (indeks)
- Ish rejasi: `.claude/docs/tasks.md` — vazifani boshlashdan oldin uning qabul mezonlarini o'qing, tugagach holatini yangilang

## Qat'iy qoidalar
1. Har yangi foydalanuvchi promptini `.claude/docs/ai-prompts.md` oxiriga o'zgartirmasdan qo'shing.
2. Foydalanuvchiga javob — o'zbek tilida. Kod, identifikatorlar, commitlar — ingliz tilida.
3. Biznes mantiq faqat `packages/server` da. `apps/web` Prisma'ni import qilmaydi. Front va back umumiy kodi — `packages/shared`.
4. Miqdor doim donada (`Int`), pul — butun so'm (`BigInt` DB'da), tannarx — `Decimal(20,4)`.
5. Bajarish/storno — bitta tranzaksiya, qulflar `.claude/docs/business-logic.md §2` tartibida, audit yozuvi majburiy.
6. Maxfiy maydonlar (tannarx, foyda, kassa, qarz) STAFF uchun **serverda** olib tashlanadi.
7. Sxema/algoritm/qaror o'zgarsa — tegishli hujjatni shu o'zgarish bilan birga yangilang.
8. Noaniqlik bo'lsa — taxmin qilmang: `.claude/docs/open-questions.md` ga yozing va so'rang.
