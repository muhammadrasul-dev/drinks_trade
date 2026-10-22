# Ochiq texnik savollar

SRS'dagi biznes savollar yopilgan. Bu yerda — arxitektura va DB loyihalashda chiqqan **texnik/aniqlashtiruvchi** savollar. Har birida tavsiya bor; hujjatlar hozircha **tavsiya bo'yicha** yozilgan. Javob kelgach savol `Yopilgan` bo'ladi va tegishli hujjat yangilanadi.

**2026-10-22 (Prompt 8):** OQ-01, 02, 03, 04, 05, 08, 11, 13 yopildi — barchasi tavsiya bo'yicha. 

**2026-10-22 (Prompt 9):** OQ-06, 07, 09, 10, 14, 15 yopildi. OQ-06 — tavsiyadan farqli: blokdagi dona sonini Xodim ham o'zgartira oladi. OQ-10 kengaytirildi: xodimlar soni cheklanmagan, akkauntlarini Egasi boshqaradi ([architecture.md §11](architecture.md)). **Ochiq savol qolmadi** (OQ-12 — deploy, keyingi bosqich).

| # | Savol | Tavsiya | Holat |
|---|---|---|---|
| OQ-01 | Storno qilingan savdo P&L'da qaysi sanada aks etadi? | Asl hujjat sanasida (hujjat davr hisobidan butunlay chiqadi) | Yopilgan — asl sanada (A) |
| OQ-02 | Xodim savdo/xaridda Naqd/Karta/Nasiya bo'linishini kiritadimi? | Ha, o'z hujjatida kiritadi; kassa balansi va qarzlar ro'yxatini ko'rmaydi | Yopilgan — Xodim o'z hujjatida kiritadi; kassa/qarz ma'lumotlarini ko'rmaydi |
| OQ-03 | Storno'ni kim qiladi? | Faqat Egasi | Yopilgan — faqat Egasi |
| OQ-04 | Qarzi qisman qaytarilgan nasiya savdo/xaridni storno qilish | Bloklanadi — avval qaytarishlarni hal qilish kerak | Yopilgan — bloklanadi |
| OQ-05 | Savdo qatorida narxni qo'lda o'zgartirsa bo'ladimi? | Yo'q — narx mahsulotdan olinadi (BR-2) | Yopilgan — yo'q, narx faqat mahsulot kartochkasida |
| OQ-06 | Hujjatlarda ishlatilgan mahsulotning "blokdagi dona"sini o'zgartirish | Faqat Egasi, ogohlantirish bilan; tarix buzilmaydi | Yopilgan — Egasi ham, Xodim ham o'zgartira oladi |
| OQ-07 | Kelajak sana bilan hujjat kiritish | Taqiqlanadi (faqat bugun yoki o'tgan sana) | Yopilgan — taqiqlanadi |
| OQ-08 | Xato kiritilgan qo'lda kassa yozuvi (yo'l kira, boshqa chiqim, qarz) | Egasi storno qiladi (teskari yozuv), o'chirilmaydi | Yopilgan — Egasi storno qiladi (teskari yozuv) |
| OQ-09 | Xarid storno'sida o'rtacha tannarx | Formula bilan qayta hisob; manfiy chiqsa 0 | Yopilgan — qayta hisoblanadi |
| OQ-10 | Login va parolni tiklash | Username + parol; parolni Egasi qayta o'rnatadi | Yopilgan — har kimning o'z logini; xodim akkauntlarini Egasi boshqaradi |
| OQ-11 | Alohida backend servis (apps/api) kerakmi? | Hozir yo'q — Next.js + `packages/server` | Yopilgan — yo'q, v1 faqat web, mobil yo'q |
| OQ-12 | Production qayerda ishlaydi? | Keyingi bosqich (VPS + Docker Compose tavsiya) | Keyinga |
| OQ-13 | Inventarizatsiyada kiritilmagan (sanalmagan) qator | O'zgarishsiz qoladi; nol — faqat aniq "0" kiritilsa | Yopilgan — o'zgarishsiz qoladi |
| OQ-14 | Xodim boshqa foydalanuvchi yaratgan qoralamani tahrirlay oladimi? | Ha (kichik jamoa); hammasi audit'da | Yopilgan — ha |
| OQ-15 | Sotuv narxi dona uchunmi? | Ha, `sale_price` = 1 dona narxi; blok = narx × dona soni | Yopilgan — ha, dona uchun |
| OQ-16 | Prefikssiz `/` ochilganda til qanday tanlanadi? | `NEXT_LOCALE` cookie → brauzer tili (`Accept-Language`) → `uz` (next-intl standarti) | Ochiq — tavsiya bo'yicha qilingan (T-202) |
| OQ-17 | `pnpm user:reset-password` faolsiz akkauntga nima qiladi? | Parol tiklanadi, akkaunt faolsizligicha qoladi (CLI ogohlantiradi) | Yopilgan — A: parol tiklanadi, akkaunt faolsizligicha qoladi |
| OQ-18 | Nasiya savdo/xaridda izoh (qarz izohi) majburiymi? | Ha — `paidCredit > 0` bo'lsa hujjat izohi majburiy (`NOTE_REQUIRED`), qarzga o'sha izoh yoziladi | Ochiq — T-403 da yadro bo'sh izohni qabul qiladi |

---

## Batafsil

### OQ-01 — Storno va P&L davri
Savdo 10-oktabrda bajarildi, 5-noyabrda storno qilindi.
- **A (tavsiya):** Savdo oktabr P&L'idan chiqadi (oktabr hisoboti o'zgaradi). Oddiy, "hujjat go'yo bo'lmagan".
- **B:** Oktabr o'zgarmaydi, noyabrda manfiy tushum/tannarx yoziladi. Yopilgan davrlar o'zgarmaydi, lekin kun yopish (smena) SRS'da yo'q, shuning uchun bu murakkablik kerak emas.

### OQ-02 — Xodim va to'lov ma'lumotlari
SRS: Xodim savdo/xarid yaratadi va bajaradi, lekin "to'lov ma'lumotlari"ni ko'rmaydi. Bajarish uchun to'lov bo'linishi majburiy (BR-9). Tavsiya: Xodim **o'zi kiritayotgan** hujjatda Naqd/Karta/Nasiya summalarini kiritadi va ko'radi; kassa balanslari, kassa jurnali, qarzlar ro'yxati unga yopiq. Kassada pul yetmasa xabar "Kassada mablag' yetarli emas" — summasiz.
Alternativa: Xodim hujjatlarida to'lov doim 100% Naqd (avtomatik) — oddiyroq, lekin karta/nasiya savdolarini faqat Egasi kirita oladi.

### OQ-03 — Storno huquqi
SRS'da Xodim uchun "yaratish va bajarish" bor, storno aytilmagan. Storno — pul qaytishi va tannarxga ta'sir, xavfli amal. Tavsiya: faqat Egasi. Xodim xato qilsa — Egasiga aytadi.

### OQ-04 — Qaytarilgan qarzli hujjat storno'si
Nasiya savdo 1 000 000, mijoz 300 000 qaytargan. Savdo storno qilinsa, 300 000 nima bo'ladi?
- **A (tavsiya):** storno bloklanadi ("avval qarz qaytarishlarni bekor qiling"). Qarz qaytarishni storno qilish — OQ-08 mexanizmi bilan.
- **B:** avtomatik: 300 000 kassadan qaytariladi, qarz bekor.

### OQ-05 — Savdoda narx
BR-2: bitta narx, chegirma yo'q. FR-3.1 da qatorda "narx" ustuni bor. Tavsiya: ustun ko'rinadi, lekin tahrirlanmaydi (mahsulot narxidan avtomatik). Narxni o'zgartirish — mahsulot kartochkasida.

### OQ-06 — Blokdagi dona sonini o'zgartirish
Masalan 6 ta → 12 ta. Qoldiq donada saqlangani uchun hisob buzilmaydi, faqat "3 blok 2 dona" ko'rinishi qayta hisoblanadi. Tavsiya: ruxsat (faqat Egasi), ogohlantirish oynasi va audit bilan.

### OQ-07 — Kelajak sana
Tavsiya: taqiqlash (kelajak sanali savdo bugungi hisobotlarni chalg'itadi).

### OQ-08 — Qo'lda kassa yozuvini bekor qilish
Hozir faqat savdo/xarid uchun storno bor. Yo'l kirani 50 000 o'rniga 500 000 kiritib qo'yishsa-chi? Tavsiya: Egasi "Storno" qiladi → teskari `MANUAL_REVERSAL` yozuvi, asl yozuv ham, teskari ham jurnalda qoladi; P&L'dan chiqadi. Qarz berish/olish storno'si — qarz bekor qilinadi (qaytarishlari bo'lmasa).

### OQ-09 — Xarid storno'si va tannarx
Misol: qoldiq 10 dona × 5 000; 10 dona × 7 000 xarid → o'rtacha 6 000 (20 dona). 15 dona sotildi (5 qoldi, 6 000). Endi xaridni storno qilish — 5 < 10, bloklanadi (BR-3), to'g'ri. Agar qoldiq yetarli bo'lsa: `(Q×avg − xarid summasi)/(Q − q)` ba'zan manfiy yoki g'alati natija berishi mumkin (o'rtacha orada boshqa xaridlar bilan o'zgargan bo'lsa). Tavsiya: formula + pastki chegara 0. Alternativa: storno'da o'rtacha tannarx o'zgarmaydi (tovar joriy o'rtacha bilan chiqadi, farq e'tiborsiz) — oddiyroq, lekin aniqligi kamroq.

### OQ-10 — Login
Tavsiya: username + parol (email/telefon tasdiqlash yo'q). Xodim parolini unutsa — Egasi yangisini o'rnatadi. Egasi parolini unutsa — server'da CLI skript (`pnpm user:reset-password`).

### OQ-11 — Alohida backend
Siz "front va back" dedingiz. Tavsiya: ular **papka darajasida** ajratilgan (`apps/web` — front + yupqa transport, `packages/server` — back), lekin bitta Next.js ilovada ishga tushadi. Agar alohida API server (masalan mobil ilova uchun) hozirdan kerak bo'lsa — ayting, `apps/api` qo'shamiz.

### OQ-13 — Sanalmagan qator
Butun ombor sanaladi (BR-8), lekin foydalanuvchi bir mahsulotni kiritmay qoldirsa? **A (tavsiya):** o'zgarishsiz. **B:** 0 deb hisoblanadi (xavfli — bitta unutilgan qator katta kamomad yozadi). Bajarishdan oldin "N ta qator sanalmadi" ogohlantirishi chiqadi.

### OQ-14 — Qoralamani kim tahrirlaydi
Tavsiya: istalgan foydalanuvchi istalgan qoralamani (kichik do'kon). Alternativa: Xodim faqat o'zinikini.

### OQ-15 — Sotuv narxi birligi
Tavsiya: narx 1 dona uchun kiritiladi; formada "blok narxi" avtomatik ko'rsatiladi.

### OQ-16 — Birinchi kirishda til
ADR-014: default `uz`. Lekin brauzeri rus tilida bo'lgan foydalanuvchi `/` ni birinchi marta ochsa-chi?
- **A (tavsiya, hozir shunday):** next-intl standarti — avval `NEXT_LOCALE` cookie (oldin tanlangan til), keyin brauzer tili, ikkalasi ham bo'lmasa `uz`. Rus tilli brauzer → `/ru`.
- **B:** `/` doim `/uz` ga (next-intl `localeDetection: false` — cookie ham, brauzer tili ham hisobga olinmaydi). ADR-014 ga so'zma-so'z mos, lekin rus tilli xodim har safar login sahifasida o'zi almashtiradi.
Login'dan keyin baribir `user.locale` ga yo'naltiriladi (T-201), shuning uchun farq faqat login sahifasida. B ga o'tish — `src/i18n/routing.ts` da bitta sozlama. ("Cookie bor, brauzer tili yo'q" varianti next-intl'da sozlama bilan qilinmaydi — `proxy.ts` da qo'lda.)

### OQ-17 — Faolsiz akkaunt parolini CLI orqali tiklash
**Javob (2026-10-22, Prompt 33): A.** business-logic §11 bu holatni aytmaydi. **A (tanlandi):** parol tiklanadi, sessiyalar va `login_attempt` tozalanadi, lekin `is_active` o'zgarmaydi — CLI "akkaunt faolsiz va shunday qoladi" deb ogohlantiradi; faollashtirish Egasining alohida amali. **B:** faolsiz akkauntga CLI rad etadi (xato). **C:** CLI parolni tiklab, akkauntni faollashtiradi ham. Egasini faolsizlantirib bo'lmaydi, shuning uchun amalda bu faqat xodimlarga tegishli.

### OQ-18 — Nasiya hujjat qarzining izohi
BR-10: kontragent ro'yxati yo'q, qarz **izoh** bilan yuritiladi; kassa orqali qarz berish/olishda izoh majburiy (business-logic §7). Lekin savdo/xarid izohi ixtiyoriy (FR-3.1, FR-4.1), shuning uchun nasiya qismidan ochilgan qarz izohsiz qolishi mumkin — qarzlar ro'yxatida (FR-7.1) kim qarzdor ekani ko'rinmaydi (faqat hujjat raqami orqali).
- **A (tavsiya):** `paidCredit > 0` bo'lsa hujjatni bajarishda izoh majburiy (`NOTE_REQUIRED`); `debt.note` = hujjat izohi. Tekshiruv T-405 / T-503 da.
- **B:** izoh ixtiyoriy qoladi; ro'yxatda izoh o'rniga hujjat raqami ko'rsatiladi.
Hozir (T-403): `debts.open` `MANUAL` qarzda izohsiz → `NOTE_REQUIRED`; `SALE`/`PURCHASE` qarzda bo'sh izohni (`''`) qabul qiladi — qaror chaqiruvchida (bajarish) qo'llanadi, yadroni o'zgartirish shart emas.
