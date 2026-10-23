# Ichimliklar do'koni uchun mini-ERP

Versiya 1.0 · Hujjat sanasi: 2026-10-23

Bitta ichimliklar do'koni egasiga uchta savolga aniq javob beradigan veb-tizim:

1. **Omborda qancha tovar bor?** — blok va donada.
2. **Tovar qayerda turibdi?** — ombor → sub-ombor.
3. **Biznes qancha sof foyda keltirmoqda?** — foyda va zarar hisoboti (P&L).

Tizim brauzerda ishlaydi (kompyuter va telefon), interfeys **o'zbek** va **rus** tillarida, pul birligi — **so'm**.

> **Joylashtirish rejimi.** Loyiha hozircha faqat **lokal (stage) muhitda** ishlaydi: tizim bitta kompyuterda (yoki do'kon ichki tarmog'idagi serverda) ishga tushiriladi. Internetdagi production server (VPS, domen, HTTPS) bu versiyada rejalashtirilmagan (OQ-12 yopilgan, T-1003 bekor qilingan).

---

## Mundarija

1. [Imkoniyatlar: talab va natija](#1-imkoniyatlar-talab-va-natija)
2. [Rollar va ruxsatlar](#2-rollar-va-ruxsatlar)
3. [Ish jarayoni: qadamma-qadam](#3-ish-jarayoni-qadamma-qadam)
4. [Hisob-kitob qoidalari](#4-hisob-kitob-qoidalari)
5. [Hisobotlar va eksport](#5-hisobotlar-va-eksport)
6. [Xavfsizlik va ma'lumot yaxlitligi](#6-xavfsizlik-va-malumot-yaxlitligi)
7. [Tizim talablari va o'rnatish](#7-tizim-talablari-va-ornatish)
8. [Kundalik ishlatish va ma'lumotni saqlash](#8-kundalik-ishlatish-va-malumotni-saqlash)
9. [Cheklovlar (v1 ga kirmaydi)](#9-cheklovlar-v1-ga-kirmaydi)
10. [Sifat nazorati](#10-sifat-nazorati)
11. [Hujjatlar](#11-hujjatlar)

---

## 1. Imkoniyatlar: talab va natija

Quyidagi jadvalda texnik topshiriq ([SRS v1.0](.claude/docs/01-srs.md)) bo'yicha har bir talab va uning joriy holati keltirilgan. Barcha vazifalar [ish rejasida](.claude/docs/tasks.md) bajarilgan (✅) va avtomatik testlar bilan tekshirilgan.

| № | Talab (SRS) | Tizimda qanday amalga oshirilgan | Holat |
|---|---|---|---|
| 1 | **Mahsulot** (FR-1.1–1.3): nom, blokdagi dona soni, narx, toifa, brend, SKU, shtrix-kod, rasm, minimal qoldiq, yaroqlilik muddati | Mahsulotlar bo'limi: qidiruv (nom/SKU/shtrix-kod), toifa va brend filtri, rasm (JPG/PNG/WEBP, 2 MB gacha), «Kam qoldi» belgisi; o'chirish o'rniga **arxivlash** | ✅ |
| 2 | **Ombor va sub-ombor** (FR-2.1–2.2): 2 darajali joylashuv | Omborlar bo'limi; faqat bo'sh ombor/sub-ombor arxivlanadi; qoldiq sub-ombor darajasida saqlanadi | ✅ |
| 3 | **Xarid** (FR-4.x, BR-4): tovar kirimi, to'lov bo'linishi | Qoralama → Bajarish; Naqd + Karta + Nasiya; o'rtacha tannarx avtomatik qayta hisoblanadi; qidiruv shtrix-kod skaneri bilan ham ishlaydi | ✅ |
| 4 | **Savdo** (FR-3.x, BR-5, BR-7): qoldiq nazorati | Qatorda qoldiq ko'rinadi, yetmasa qator qizil va «Bajarish» o'chiq; bajarishda qayta tekshiriladi; manfiy qoldiq mumkin emas | ✅ |
| 5 | **Storno** (BR-3): bajarilgan hujjatni bekor qilish | Faqat Egasi; savdo storno'sida tovar savdodagi tannarx bilan qaytadi; xarid storno'si tovar yetmasa bloklanadi | ✅ |
| 6 | **Inventarizatsiya** (FR-5.x, BR-8) | Butun ombor sanog'i; kamomad/ortiqcha P&L ga tushadi; sub-omborlar orasidagi farq foydaga ta'sir qilmaydi; ochiq sanoq paytida shu ombor bloklanadi va barcha sahifalarda sariq ogohlantirish chiqadi | ✅ |
| 7 | **Kassa** (FR-6.x, BR-9): Naqd va Karta | Balanslar, jurnal, yo'l kira, boshqa chiqim, kassalar orasida o'tkazma; kassa manfiy bo'lmaydi; xato yozuv storno qilinadi | ✅ |
| 8 | **Qarzlar** (FR-7.x, BR-10): debitor va kreditor | Nasiya savdo/xarid avtomatik qarzga tushadi; qo'lda qarz berish/olish; qisman qaytarish va tarix | ✅ |
| 9 | **Hisobotlar** (SRS 7): qoldiq, savdo, P&L | Uchala hisobot; filtrlar; qoldiq, savdo va P&L ekrandagi filtrlar bilan **PDF** va **Excel** ga yuklanadi | ✅ |
| 10 | **Audit** (BR-12): kim, qachon, nima | O'zgartirib/o'chirib bo'lmaydigan jurnal; o'tgan sana bilan kiritilgan hujjatlar alohida belgilanadi; faqat Egasi ko'radi | ✅ |
| 11 | **Rollar** (SRS 3): Egasi va Xodim | Maxfiy ma'lumotlar (foyda, tannarx, kassa, qarz) Xodim uchun **serverda** olib tashlanadi | ✅ |
| 12 | **Til** (SRS 8): o'zbek va rus | Foydalanuvchi tili saqlanadi; hisobot fayllari sahifa tilida chiqadi | ✅ |
| 13 | **Yaxlitlik** (SRS 8): atomik bajarish, parallel ishlash | Har bajarish bitta tranzaksiya; qulflar bilan ikki xodim bitta qoldiqni buza olmaydi; parallel testlar mavjud | ✅ |
| 14 | **Kengayish** (SRS 2, 8): keyin filial qo'shishga tayyorlik | Ma'lumotlar modeli filialga tayyor (ADR-011); filial funksiyasi v1 da yo'q | ✅ (poydevor) |
| 15 | **Bosh sahifa** (qo'shimcha) | Kam qolgan mahsulotlar, ochiq inventarizatsiyalar, bajarilmagan qoralamalar | ✅ |
| 16 | **Foydalanuvchilarni boshqarish** (qo'shimcha) | Egasi xodim qo'shadi, parol o'rnatadi, faolsizlantiradi; 5 xato urinishdan keyin 15 daqiqa blok | ✅ |

### Talabdan tashqari qo'shilgan imkoniyatlar

SRS da to'g'ridan-to'g'ri yozilmagan, lekin amaliy ish uchun qo'shilgan: bosh sahifa, foydalanuvchilarni boshqarish va «Mening akkauntim», PDF/Excel fayllarining ikki tilda chiqishi, telefon uchun moslashgan interfeys, Egasi parolini serverda tiklash buyrug'i.

---

## 2. Rollar va ruxsatlar

Tizimda ikki rol bor. Egasi bitta; xodimlar soni cheklanmagan, har biriga alohida login beriladi.

| Bo'lim | Egasi | Xodim |
|---|:-:|:-:|
| Mahsulotlar, omborlar | ✅ | ✅ |
| Xarid narxlarini ko'rish | ✅ | ✅ |
| Savdo, xarid, inventarizatsiya (yaratish, bajarish, o'tgan sana bilan ham) | ✅ | ✅ |
| Storno | ✅ | ❌ |
| Qoldiq hisoboti | ✅ | ✅ |
| Savdo hisoboti | ✅ tannarx va foyda bilan | ✅ tannarx va foydasiz |
| Foyda va zarar (P&L) | ✅ | ❌ |
| Kassa va qarzlar | ✅ | ❌ |
| Foydalanuvchilar, audit jurnali | ✅ | ❌ |

Xodimga yopiq bo'limlar menyuda ko'rinmaydi. Manzilni qo'lda ochsa ham «Ruxsat yo'q» (403) sahifasi chiqadi, tannarx va foyda ma'lumotlari esa serverdan umuman yuborilmaydi — brauzer orqali ham olib bo'lmaydi.

---

## 3. Ish jarayoni: qadamma-qadam

Batafsil ekran rasmlari bilan — [Foydalanuvchi qo'llanmasi](.claude/docs/user-guide.md).

### 3.1. Birinchi sozlash (Egasi, bir marta)

1. **Kirish** — Egasi login va paroli bilan tizimga kiradi (til yuqori o'ng burchakda).
2. **Omborlar** — ombor va unga sub-omborlar yaratiladi (masalan, «Asosiy ombor» → «Javon A», «Muzlatgich»).
3. **Toifalar va brendlar** — mahsulotlarni guruhlash uchun.
4. **Mahsulotlar** — har mahsulot uchun blokdagi dona soni, **1 dona** narxi, minimal qoldiq kiritiladi.
5. **Xodimlar** — har bir xodimga alohida login va parol beriladi (umumiy akkaunt ishlatilmaydi, aks holda audit kim nima qilganini ko'rsata olmaydi).
6. **Boshlang'ich qoldiq** — alohida import yo'q; mavjud tovar **Xarid** hujjati orqali kiritiladi.

### 3.2. Kundalik ish

| Qadam | Nima qilinadi | Natija |
|---|---|---|
| 1. Tovar keldi | **Xarid** → qatorlar (mahsulot, sub-ombor, soni, narx) → to'lov (Naqd/Karta/Nasiya) → **Saqlash** → **Bajarish** | Tovar sub-omborga kiradi, o'rtacha tannarx yangilanadi, kassadan pul chiqadi, nasiya qismi «Bizning qarzimiz» ga yoziladi |
| 2. Sotuv | **Savdo** → qatorlar (mahsulot, qaysi sub-ombordan, soni) → to'lov → **Saqlash** → **Bajarish** | Tovar chiqadi, tushum kassaga tushadi, nasiya «Bizga qarzdor» ga yoziladi; tannarx savdo paytida muzlatiladi |
| 3. Xarajat | **Kassa** → Yo'l kira / Boshqa chiqim / O'tkazma | Yo'l kira foydani kamaytiradi; boshqa chiqim (masalan, egasi pul oldi) foydaga kirmaydi |
| 4. Qarz | **Qarzlar** → Berish / Olish / Qaytarish | Qisman qaytarish mumkin; qarz qoldig'i avtomatik hisoblanadi |
| 5. Xato topildi | Hujjatni **Storno** qilish (Egasi) | Hujjat o'chmaydi, teskari yozuv bilan bekor bo'ladi, audit'ga yoziladi |

### 3.3. Davriy sanoq (inventarizatsiya)

1. **Inventarizatsiya** → yangi sanoq → ombor tanlanadi.
2. Shu paytdan boshlab **shu ombor bo'yicha savdo, xarid va storno bajarilmaydi** (qoralama yaratish mumkin). Boshqa omborlar ishlayveradi.
3. Har sub-ombor va mahsulot uchun haqiqiy son kiritiladi, tizim farqni ko'rsatadi.
4. **Bajarish** — qoldiq haqiqiy songa tenglashadi; kamomad yo'qotish, ortiqcha daromad sifatida P&L ga tushadi. Bir sub-omborda kam, boshqasida ortiq bo'lsa — faqat joylashuv tuzatiladi.
5. Kerak bo'lmasa — **Bekor qilish** (blok yechiladi). Bajarilgan sanoq o'zgartirilmaydi.

### 3.4. Haftalik / oylik nazorat (Egasi)

1. **P&L** — kun/oy/yil yoki ixtiyoriy oraliq bo'yicha sof foyda.
2. **Savdo hisoboti** — mahsulot kesimida tushum, tannarx, yalpi foyda.
3. **Qoldiq hisoboti** — «Kam qolganlar» filtri bilan qaysi tovarni buyurtma qilish kerakligi.
4. **Audit jurnali** — shubhali o'zgarishlarni tekshirish.
5. Hisobotlarni PDF (chop etish) yoki Excel (hisob-kitob) ga yuklab olish.

---

## 4. Hisob-kitob qoidalari

Hisoblar tushunarli va tekshiriladigan bo'lishi uchun qat'iy qoidalarga asoslangan (to'liq: [SRS §5](.claude/docs/01-srs.md)).

- **Birliklar.** Qoldiq tizim ichida doim **donada** saqlanadi; ekranda blok + dona ko'rinadi (masalan, 27 dona, blok = 12 → «2 blok 3 dona»).
- **Narx.** Har mahsulotda bitta sotuv narxi (1 dona uchun), chegirma va optom narx yo'q. Xarid narxi har xarid hujjatida kiritiladi.
- **Tannarx.** O'rtacha tortilgan: `yangi = (eski qoldiq × eski tannarx + kirim × xarid narxi) / (eski qoldiq + kirim)`. Savdo tannarxni o'zgartirmaydi; savdo paytidagi tannarx qatorda muzlatiladi.
- **Sof foyda:**

  ```
  Tushum (nasiya ham kiradi, storno ayiriladi)
  − Sotilgan tovar tannarxi
  = Yalpi foyda
  − Yo'l kira
  − Inventarizatsiya kamomadi (+ ortiqcha bo'lsa qo'shiladi)
  = SOF FOYDA
  ```

  Foydaga **kirmaydi**: xarid summasi (u zaxira), qarz berish/olish/qaytarish, «boshqa chiqim», kassalar orasidagi o'tkazma.
- **Qoldiq nazorati.** Qoldiq yetmasa savdo bajarilmaydi — hech kim, Egasi ham. Manfiy qoldiq bo'lmaydi.
- **Kassa nazorati.** Chiqim kassadagi balansdan oshmaydi.
- **Hujjat holatlari.** Qoralama (tahrirlash/o'chirish mumkin) → Bajarilgan (o'zgartirilmaydi) → Storno qilingan.
- **Sana.** Hujjatni bugungi yoki o'tgan sana bilan kiritish mumkin (Xodim ham), kelajak sana — yo'q. Hisobot davri hujjat sanasiga, tannarx esa **bajarilgan vaqt tartibiga** bog'liq. Kunlar Toshkent vaqti bo'yicha (`Asia/Tashkent`).

---

## 5. Hisobotlar va eksport

| Hisobot | Mazmuni | Kim ko'radi |
|---|---|---|
| **Mahsulotlar qoldig'i** | Har mahsulot blok/donada, ombor → sub-ombor bo'yicha; filtrlar: ombor, toifa, brend, holat, «Kam qolganlar» | Egasi (tannarx va qiymat bilan), Xodim (ularsiz) |
| **Savdo hisoboti** | Sana oralig'i, mahsulot kesimida: soni, tushum, tannarx, yalpi foyda | Egasi (to'liq), Xodim (tannarx/foydasiz) |
| **Foyda va zarar (P&L)** | Sof foyda formulasi, kun/oy/yil/oraliq | Faqat Egasi |

Har hisobot **PDF** (chop etish uchun: sarlavha, davr, jami, sahifa raqamlari) va **Excel** (hisob-kitob uchun: haqiqiy sonlar, formulali jami qatori) ko'rinishida yuklanadi. Fayl ekrandagi filtrlar va tilda tuziladi; Xodim fayliga tannarx va foyda umuman kirmaydi.

---

## 6. Xavfsizlik va ma'lumot yaxlitligi

- **Kirish.** Parollar argon2id bilan xeshlanadi; sessiya cookie `httpOnly`; 5 ta xato urinishdan keyin 15 daqiqalik blok; faolsizlantirilgan xodim darhol tizimdan chiqariladi.
- **Maxfiylik.** Foyda, tannarx, kassa va qarz ma'lumotlari Xodim uchun serverda olib tashlanadi, faqat interfeysda yashirilmaydi.
- **Atomiklik.** Bajarish va storno bitta tranzaksiyada; ikki xodim bir qoldiqni bir vaqtda sotsa, ikkinchisiga aniq xato chiqadi, ma'lumot buzilmaydi.
- **Ma'lumotlar bazasi himoyasi.** Qoldiq manfiy bo'lmasligi, audit jurnali o'zgartirilmasligi kabi qoidalar bazaning o'zida ham (CHECK cheklovlar va triggerlar) tekshiriladi.
- **Izlanuvchanlik.** Har o'zgarish uchun: kim, qachon, nima, eski va yangi qiymat. Jurnal o'chirilmaydi.
- **Hujjatlar o'chirilmaydi.** Mahsulot, ombor, foydalanuvchi — arxivlanadi/faolsizlantiriladi; hujjat — storno qilinadi.

---

## 7. Tizim talablari va o'rnatish

### 7.1. Talablar

| Talab | Versiya |
|---|---|
| Node.js | 24 (`.nvmrc`) |
| pnpm | 10 (`packageManager` maydoni) |
| Docker (PostgreSQL uchun) | Docker Desktop yoki Docker Engine, Compose bilan |
| Brauzer | Zamonaviy Chrome, Edge, Safari yoki Firefox |

Ma'lumotlar bazasi — PostgreSQL 17 (Docker konteynerida, lokal port `5433`).

### 7.2. Birinchi ishga tushirish

```bash
# 1. Bog'liqliklarni o'rnatish
pnpm install

# 2. Sozlamalar fayli
cp .env.example .env
#    .env ichida SESSION_SECRET va SEED_OWNER_PASSWORD ni o'zgartiring (change-me qoldirmang)

# 3. Ma'lumotlar bazasini ishga tushirish va tayyorlash
pnpm db:up
pnpm db:migrate
pnpm db:seed          # tashkilot, do'kon, 2 kassa, Egasi akkaunti

# 4. Ilovani ishga tushirish
pnpm dev              # ishlab chiqish rejimi, http://localhost:3000
```

Do'konda doimiy ishlatish uchun (tezroq, ishlab chiqish rejimisiz):

```bash
pnpm build
pnpm --filter @drinks/web start     # http://localhost:3000
```

Egasi uchun boshlang'ich login `.env` dagi `SEED_OWNER_USERNAME` (standart: `owner`), parol — `SEED_OWNER_PASSWORD`. Birinchi kirishdan keyin parolni **Mening akkauntim** sahifasida almashtiring.

Sinov uchun namunaviy ma'lumot (omborlar, mahsulotlar, 2 xodim) kerak bo'lsa: `pnpm db:seed:dev`. **Haqiqiy ma'lumotli bazada bu buyruqni ishlatmang.**

### 7.3. Egasi parolini unutsa

Xodim parolini Egasi tiklaydi. Egasining o'z parolini esa tizimni o'rnatgan mutaxassis serverda tiklaydi:

```bash
pnpm user:reset-password
```

---

## 8. Kundalik ishlatish va ma'lumotni saqlash

Tizim lokal ishlagani uchun ma'lumot xavfsizligi (zaxira nusxa) mijoz tomonidan ta'minlanishi kerak.

- **Zaxira nusxa.** Hozircha avtomatik backup yo'q. Kamida kuniga bir marta bazaning nusxasini oling:

  ```bash
  docker compose -f docker/compose.dev.yml exec -T postgres \
    pg_dump -U drinks drinks_trade > backup_$(date +%F).sql
  ```

  Nusxani boshqa qurilmaga (tashqi disk, bulutli xotira) ko'chiring.
- **Rasmlar** `UPLOAD_DIR` (standart `./storage/uploads`) papkasida saqlanadi — uni ham zaxiralang.
- **Baza hajmi (`pgdata` volume)** o'chirilsa, barcha ma'lumot yo'qoladi. `pnpm db:down` ma'lumotni o'chirmaydi; `pnpm db:reset` esa **hamma narsani o'chiradi** — haqiqiy ma'lumotda ishlatmang.
- **Yangilash.** Yangi versiya olingach: `pnpm install`, `pnpm db:migrate`, `pnpm build`, ilovani qayta ishga tushirish. Avval zaxira nusxa oling.
- **Ko'p qurilma.** Do'kon ichki tarmog'ida bir nechta xodim bitta serverga brauzer orqali ulanadi. Tashqi internetdan kirish v1 da qo'llab-quvvatlanmaydi va HTTPS sozlanmagan.

---

## 9. Cheklovlar (v1 ga kirmaydi)

Quyidagilar kelishilgan ko'lamdan tashqarida:

| Kirmaydi | Izoh |
|---|---|
| Filiallar / ko'p do'kon | Ma'lumotlar modeli tayyor, funksiya yo'q |
| Mijoz va ta'minotchi ro'yxati | Qarz va nasiya **izoh** bilan yuritiladi |
| Chegirma, optom narx | Har mahsulotda bitta narx |
| Kun yopish (smena) | — |
| Omborlar orasida ko'chirish hujjati | Joylashuv tuzatish — inventarizatsiya orqali |
| Manfiy qoldiq | Taqiqlangan |
| Boshqa valyuta, soliq, ish haqi | Faqat so'm |
| Partiya / yaroqlilik muddati bo'yicha hisob | Yaroqlilik muddati faqat ma'lumot maydoni |
| Kassa va qarz hisobotlari | Kassa va qarzlar o'z sahifalarida ko'riladi |
| Boshlang'ich ma'lumot importi | Boshlang'ich qoldiq xarid hujjati orqali |
| Mobil ilova, REST API | Telefon brauzeri qo'llab-quvvatlanadi; ilova yo'q |
| Production server (VPS, HTTPS, avtomatik backup) | Loyiha lokal rejimda ishlaydi |

Bular kelajakda alohida vazifa sifatida qo'shilishi mumkin.

---

## 10. Sifat nazorati

Har bir vazifa kod, migratsiya, test va hujjat bilan birga topshirilgan. Tekshirish buyruqlari:

| Buyruq | Nimani tekshiradi |
|---|---|
| `pnpm lint` · `pnpm typecheck` | Kod sifati va tiplar |
| `pnpm test` | Unit testlar (hisob-kitob formulalari, ruxsatlar, validatsiya) |
| `pnpm test:int` | Integratsiya testlari haqiqiy PostgreSQL bilan: qoldiq, kassa, qarz, tannarx, parallel savdo, cheklovlar (28 fayl, 349 test) |
| `pnpm test:e2e` | Brauzer testlari (Playwright): kirish → mahsulot → xarid → savdo → hisobot, Xodim ko'rinishi, inventarizatsiya bloki, til almashtirish |

Integratsiya testlari har safar quyidagi **invariantlarni** tekshiradi: `qoldiq = harakatlar yig'indisi`, `mahsulot tannarxi jami = qoldiqlar yig'indisi`, `kassa balansi = kassa yozuvlari yig'indisi`. CI (GitHub Actions) lint, typecheck va testlarni har o'zgarishda ishga tushiradi.

---

## 11. Hujjatlar

| Hujjat | Kim uchun |
|---|---|
| [Foydalanuvchi qo'llanmasi](.claude/docs/user-guide.md) — ekran rasmlari bilan | Do'kon egasi, xodim |
| [Texnik topshiriq (SRS)](.claude/docs/01-srs.md) — biznes talablar va qoidalar | Hamma |
| [Arxitektura](.claude/docs/architecture.md) — tuzilma, stek, xavfsizlik, testlar | Dasturchi |
| [Ma'lumotlar bazasi](.claude/docs/database.md) · [Biznes mantiq](.claude/docs/business-logic.md) | Dasturchi |
| [Texnik qarorlar (ADR)](.claude/docs/decisions.md) · [Ochiq savollar](.claude/docs/open-questions.md) | Dasturchi, mahsulot egasi |
| [Ish rejasi](.claude/docs/tasks.md) — vazifalar holati va o'zgarishlar tarixi | Dasturchi |
| [Hujjatlar indeksi](.claude/docs/README.md) | Hamma |

**Texnologiyalar:** Next.js · TypeScript · Tailwind CSS + shadcn/ui · Prisma · PostgreSQL 17 · pnpm + Turborepo · Vitest · Playwright.
