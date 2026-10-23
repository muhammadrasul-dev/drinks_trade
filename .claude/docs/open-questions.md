# Ochiq texnik savollar

SRS'dagi biznes savollar yopilgan. Bu yerda — arxitektura va DB loyihalashda chiqqan **texnik/aniqlashtiruvchi** savollar. Har birida tavsiya bor; hujjatlar hozircha **tavsiya bo'yicha** yozilgan. Javob kelgach savol `Yopilgan` bo'ladi va tegishli hujjat yangilanadi.

**2026-10-22 (Prompt 8):** OQ-01, 02, 03, 04, 05, 08, 11, 13 yopildi — barchasi tavsiya bo'yicha. 

**2026-10-22 (Prompt 9):** OQ-06, 07, 09, 10, 14, 15 yopildi. OQ-06 — tavsiyadan farqli: blokdagi dona sonini Xodim ham o'zgartira oladi. OQ-10 kengaytirildi: xodimlar soni cheklanmagan, akkauntlarini Egasi boshqaradi ([architecture.md §11](architecture.md)). **Ochiq savol qolmadi** (OQ-12 — deploy, keyingi bosqich).

**2026-10-22 (Prompt 36):** OQ-18 va OQ-19 yopildi — ikkalasi ham tavsiya bo'yicha (A).

**2026-10-23 (Prompt 39):** OQ-22 yopildi — tavsiya bo'yicha (A). OQ-20 (T-303) va OQ-21 (T-304) javob kutmoqda.

**2026-10-23 (Prompt 40):** OQ-20 va OQ-21 yopildi — ikkalasi ham tavsiya bo'yicha (A). **Ochiq savol qolmadi** (OQ-12 — deploy, keyingi bosqich).

**2026-10-23 (Prompt 41):** OQ-23 yopildi — tavsiya bo'yicha (A). **Ochiq savol qolmadi.**

**2026-10-23 (T-503):** OQ-31 ochildi — arxivlangan sub-omborga savdo storno'si; tavsiya bo'yicha qilingan, javob kutilmoqda.

**2026-10-23 (T-602):** OQ-33 ochildi — sanalgan qatorsiz inventarizatsiyani bajarish; tavsiya bo'yicha qilingan, javob kutilmoqda.

**2026-10-23:** OQ-25 (T-901) yopildi — B: audit jurnalida faqat joriy do'kon yozuvlari.

**2026-10-23 (T-801):** OQ-28 ochildi — qoldiq hisobotidagi mahsulotlar va tannarx ustunlari; tavsiya bo'yicha qilingan, javob kutilmoqda.

**2026-10-23 (T-603):** OQ-34 ochildi — inventarizatsiya banneri boshqa qurilmadagi o'zgarishni qachon ko'rsatadi; tavsiya bo'yicha qilingan, javob kutilmoqda.

**2026-10-23 (T-802):** OQ-35 ochildi — savdo hisobotining standart davri va qatorlar tartibi; tavsiya bo'yicha qilingan, javob kutilmoqda.

**2026-10-23 (T-803):** OQ-36 ochildi — P&L davri: tanlanmagan bo'lsa qaysi davr, "oy"/"yil" to'liqmi yoki bugungacha; tavsiya bo'yicha qilingan, javob kutilmoqda.

**2026-10-23 (T-902):** OQ-39 va OQ-40 ochildi — bosh sahifadagi "Kam qolgan mahsulotlar" blokida arxivlangan mahsulotlar, ro'yxat hajmi va tartibi; tavsiya bo'yicha qilingan, javob kutilmoqda.

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
| OQ-18 | Savdo storno'sida bir mahsulot bir necha qatorda bo'lsa, o'rtacha tannarx qatorma-qator hisoblanadimi yoki mahsulot bo'yicha bir marta? | Mahsulot bo'yicha bir marta (xarid §5.2 kabi) | Yopilgan — A: mahsulot bo'yicha bir marta |
| OQ-19 | Nasiya savdo/xaridda izoh (qarz izohi) majburiymi? | Ha — `paidCredit > 0` bo'lsa hujjat izohi majburiy (`NOTE_REQUIRED`), qarzga o'sha izoh yoziladi | Yopilgan — A: izoh majburiy, `debts.open` ham tekshiradi |
| OQ-21 | Ochiq (DRAFT) inventarizatsiyasi bor bo'sh ombor/sub-omborni arxivlash mumkinmi? | Yo'q — `WAREHOUSE_IN_STOCK_COUNT`; avval sanoqni bajaring yoki bekor qiling | Yopilgan — A: arxivlash rad etiladi (`WAREHOUSE_IN_STOCK_COUNT`) |
| OQ-22 | Egasi o'z login/parolini o'zgartirsa, shu o'zgarishni qilgan (joriy) sessiya ham o'chadimi? | Yo'q — joriy sessiya qoladi, boshqa barcha sessiyalari o'chiriladi | Yopilgan — A: joriy sessiya qoladi |
| OQ-23 | Xarid qatorida narx 0 bo'lishi mumkinmi (bonus/aksiya tovari)? | Ha — `inputPrice ≥ 0`; tannarx 0 bilan kiradi va o'rtacha tannarxni pasaytiradi | Yopilgan — A: 0 narx ruxsat |
| OQ-20 | Omborda qoldig'i bor mahsulotni arxivlash mumkinmi? | Ha — ruxsat, tasdiqlash oynasida qolgan miqdor va "sotib bo'lmaydi" ogohlantirishi; arxivdan istalgan payt chiqariladi | Yopilgan — A: ruxsat, ogohlantirish bilan |
| OQ-24 | Kassa jurnali qaysi tartibda ko'rsatiladi: hisobot sanasi (`tx_date`) yoki kiritilgan vaqt bo'yicha? | `tx_date` bo'yicha, yangisi tepada (teng bo'lsa — keyin kiritilgani tepada); o'tgan sana bilan kiritilgan yozuvlarda `balance_after` ketma-ket bo'lmasligi mumkin | Yopilgan — A (2026-10-23) |
| OQ-25 | Audit jurnalida do'konga bog'lanmagan (`store_id IS NULL`) yozuvlar — muvaffaqiyatsiz kirish (`LOGIN_FAILED`) — Egasiga ko'rinadimi? | Ha — o'z tashkilotidagi foydalanuvchi haqidagilari va noma'lum login bilan urinishlar | Yopilgan — B (foydalanuvchi, 2026-10-23) |
| OQ-26 | Xarid storno'sida tovar harakati va kassa qaytimi (`PURCHASE_REFUND`) qaysi sana bilan yoziladi: asl hujjat sanasi yoki storno payti? | Asl `doc_date` (OQ-01 kabi: storno qilingan hujjat o'z davrida nolga tushadi; bajarishdagi `tx_date = doc_date` bilan simmetrik) | Yopilgan — A (tavsiya, 2026-10-23) |
| OQ-27 | Qarz qaytarish sanasi qarz sanasidan oldin bo'lishi mumkinmi? | Yo'q — qaytarish kuni ≥ qarz kuni (Toshkent), aks holda `VALIDATION_FAILED` (`date`) | Yopilgan — A (tavsiya, 2026-10-23) |
| OQ-28 | Qoldiq hisobotida qaysi mahsulotlar chiqadi va tannarx ustunlari qaysi ruxsat bilan? | Qoldig'i bor (`qty > 0`) mahsulotlar; "Kam qolganlar" filtrida (joylashuv filtrisiz) qoldig'i 0 bo'lganlari ham; tannarx/qiymat — `report.sales.cost` (faqat Egasi), yangi ruxsat yo'q | Yopilgan — 1-A, 2-A (tavsiya, 2026-10-23) |
| OQ-29 | Savdo qoralamasi saqlangandan keyin mahsulot narxi o'zgarsa, bajarish (T-502) qaysi narx bilan o'tadi? | Bajarish rad etiladi (`SALE_PRICE_CHANGED { lines }`), foydalanuvchi qoralamani qayta saqlaydi — yangi narx va jami ko'rinadi (OQ-06 kabi) | Yopilgan — A (tavsiya, 2026-10-23) |
| OQ-30 | Qo'lda kiritilgan kassa yozuvi storno'si (T-703) qaysi sana bilan yoziladi: asl yozuv sanasi yoki storno payti? | Asl yozuvning `tx_date` si (OQ-01/OQ-26 kabi: xato yozuv o'z kunida nolga tushadi, jurnalda asl yozuv yonida turadi) | Ochiq — tavsiya bo'yicha qilingan (T-703) |
| OQ-31 | Savdo storno qilinayotganda tovar qaytadigan sub-ombor (yoki uning ombori) arxivlangan bo'lsa? | Storno bloklanadi (`ENTITY_ARCHIVED`) — avval sub-omborni tiklash kerak | Ochiq — tavsiya bo'yicha qilingan (T-503), javob kutilmoqda |
| OQ-33 | Bitta ham qator sanalmagan inventarizatsiyani bajarish mumkinmi? | Yo'q — `STOCK_COUNT_EMPTY`; sanoq ochiq qoladi, kerak bo'lmasa bekor qilinadi | Ochiq — tavsiya bo'yicha qilingan (T-602) |
| OQ-32 | Inventarizatsiyada arxivlangan mahsulotni sanash mumkinmi? | Faqat shu sub-omborda qoldig'i bor bo'lsa (hisobdan chiqarish uchun); qoldig'i yo'q joyga arxivdagi mahsulotni qo'shish → `ENTITY_ARCHIVED` | Ochiq — tavsiya bo'yicha qilingan (T-601) |
| OQ-34 | Inventarizatsiya banneri boshqa qurilmada (boshqa xodim) ochilgan yoki yopilgan sanoqni qachon ko'rsatadi? | Keyingi bosishda: banner har sahifa o'tishida va tab qayta ochilganda serverdan qayta o'qiladi (bitta yengil so'rov), taymer bilan so'rov yo'q | Ochiq — tavsiya bo'yicha qilingan (T-603) |
| OQ-35 | Savdo hisoboti davr tanlanmasdan ochilsa qaysi davrni ko'rsatadi va mahsulot qatorlari qaysi tartibda? | 1) Joriy oy (1-sanadan bugungacha, Toshkent); 2) mahsulot nomi bo'yicha (qoldiq hisoboti kabi) | Ochiq — tavsiya bo'yicha qilingan (T-802) |
| OQ-36 | P&L davri tanlanmasdan ochilsa qaysi davr? "Oy" va "Yil" — to'liq kalendar oy/yilmi yoki bugungacha? | 1) Joriy oy; 2) to'liq kalendar oy/yil (kelajakdagi kunlar bo'sh — summa bugungacha bilan bir xil), ‹ › bilan qo'shni davrga, kelajakka emas | Ochiq — tavsiya bo'yicha qilingan (T-803) |
| OQ-39 | Bosh sahifadagi "Kam qolgan mahsulotlar" blokida arxivlangan mahsulotlar ko'rinadimi? | Yo'q — faqat faol mahsulotlar; "Qoldiq hisobotida ko'rish" havolasi ham faqat faollarni ochadi (`?low=1&archived=0`), son bir xil | Ochiq — tavsiya bo'yicha qilingan (T-902) |
| OQ-40 | Blokda nechta mahsulot va qaysi tartibda ko'rsatiladi? | Jami soni + eng ko'p kamaygan 10 tasi (`qoldiq / minimal` o'sish tartibida — qoldig'i 0 lar birinchi; teng bo'lsa nom bo'yicha); qolganlari — "Yana N ta" va hisobotga havola | Ochiq — tavsiya bo'yicha qilingan (T-902) |

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

### OQ-18 — Savdo storno'sida o'rtacha tannarx: qatorma-qator yoki mahsulot bo'yicha
**Javob (2026-10-22, Prompt 36): A** — T-401 dagi amalga oshirish o'zgarmaydi; business-logic §4.3 7-qadam shunga moslandi.
business-logic §4.3 7-qadam "har qator" deydi, xarid (§5.2 6-qadam) esa mahsulot bo'yicha guruhlaydi. Farq faqat bitta savdoda bir mahsulot bir necha qatorda bo'lsa va faqat 4-xona yaxlitlashda: qatorma-qator hisobda har qadam alohida yaxlitlanadi.
- **A (tavsiya, T-401 da shunday):** mahsulot bo'yicha bir marta — `avgOnReceipt(Q, avg, Σ qty, Σ costAmount)`; shu mahsulotning barcha harakatlarida `avg_cost_before/after` bir xil. Matematik jihatdan aniqroq, xarid bilan bir xil.
- **B:** har qator ketma-ket — har harakatning `avg_cost_before` oldingisining `avg_cost_after` i.
B ga o'tish — `inventory.receive` da bitta tsikl.
### OQ-19 — Nasiya hujjat qarzining izohi
**Javob (2026-10-22, Prompt 36): A.** Bajarish (T-405, T-502) `paidCredit > 0` va bo'sh izohda boshqa ishdan oldin `NOTE_REQUIRED` qaytaradi; `debts.open` ham barcha manbalarda izohsiz qarzni rad etadi (himoya qatlami); `debt.note` = hujjat izohi.
BR-10: kontragent ro'yxati yo'q, qarz **izoh** bilan yuritiladi; kassa orqali qarz berish/olishda izoh majburiy (business-logic §7). Lekin savdo/xarid izohi ixtiyoriy (FR-3.1, FR-4.1), shuning uchun nasiya qismidan ochilgan qarz izohsiz qolishi mumkin — qarzlar ro'yxatida (FR-7.1) kim qarzdor ekani ko'rinmaydi (faqat hujjat raqami orqali).
- **A (tavsiya):** `paidCredit > 0` bo'lsa hujjatni bajarishda izoh majburiy (`NOTE_REQUIRED`); `debt.note` = hujjat izohi. Tekshiruv T-405 / T-503 da.
- **B:** izoh ixtiyoriy qoladi; ro'yxatda izoh o'rniga hujjat raqami ko'rsatiladi.
T-403 da `debts.open` `SALE`/`PURCHASE` qarzda bo'sh izohni qabul qilardi — Prompt 36 da bu ham `NOTE_REQUIRED` ga o'zgartirildi.

### OQ-21 — Ochiq inventarizatsiya va ombor/sub-omborni arxivlash
**Javob (2026-10-23, Prompt 40): A** — T-304 dagi amalga oshirish o'zgarmaydi.
FR-2.2 faqat "bo'sh bo'lmagan ombor/sub-omborni arxivlab bo'lmaydi" deydi. Lekin ombor bo'sh bo'lsa-yu, unda ochiq (DRAFT) inventarizatsiya bo'lsa-chi? Sanoqda shu sub-ombor uchun "ortiqcha topilgan" qator bo'lishi mumkin — bajarilganda tovar arxivdagi joyga tushadi (BR-8).
- **A (tavsiya, qilingan):** arxivlash rad etiladi — `WAREHOUSE_IN_STOCK_COUNT { warehouseName, stockCountNumber }` (ombor uchun ham, uning sub-ombori uchun ham). Foydalanuvchi avval sanoqni bajaradi yoki bekor qiladi. Mavjud xato kodi va xabari ishlatiladi.
- **B:** arxivlashda ochiq sanoq avtomatik bekor qilinadi (`CANCEL`). Qulay, lekin foydalanuvchi kiritgan sanoq natijalari jimgina yo'qoladi.
- **C:** ruxsat beriladi, sanoqni bajarishda arxivdagi sub-ombor qatorlari rad etiladi (T-602 murakkablashadi).
B yoki C ga o'tish — `warehouses.service.ts` dagi `assertNoOpenStockCount`.
### OQ-22 — O'z login/parolini o'zgartirganda joriy sessiya
**Javob (2026-10-23, Prompt 39): A** — T-204 dagi amalga oshirish o'zgarmaydi. Xodim "Mening akkauntim" da o'z ma'lumotini o'zgartira olmasligi (architecture §11) ham tasdiqlandi.
architecture §11 va ADR-006: "login yoki parol o'zgarganda o'sha foydalanuvchining **barcha** sessiyalari darhol o'chiriladi". Bu xodim uchun (Egasi o'zgartiradi) aniq, lekin Egasi "Mening akkauntim"da **o'zinikini** o'zgartirganda joriy sessiya ham o'chsa, u darhol login sahifasiga tushadi.
- **A (tavsiya, T-204 da shunday):** joriy sessiya qoladi (u joriy parolni kiritib o'zini tasdiqladi), boshqa barcha qurilmalardagi sessiyalar o'chiriladi — o'g'irlangan sessiya bo'lsa, u yopiladi. Odatiy amaliyot.
- **B:** hammasi, shu jumladan joriy sessiya o'chiriladi; Egasi yangi login/parol bilan qayta kiradi. Hujjat matniga so'zma-so'z mos.
B ga o'tish — `users.changeOwnUsername` / `changeOwnPassword` ga `currentSessionToken` bermaslik (`features/users/actions.ts`) va keyin login sahifasiga yo'naltirish.
### OQ-20 — Qoldig'i bor mahsulotni arxivlash
**Javob (2026-10-23, Prompt 40): A** — T-303 dagi amalga oshirish o'zgarmaydi.
FR-1.2 mahsulotni o'chirish o'rniga arxivlashni aytadi, lekin qoldiq haqida hech narsa demaydi. Ombor/sub-ombor uchun esa bo'sh bo'lmaganini arxivlash taqiqlangan (FR-2.2, `ENTITY_NOT_EMPTY`). Arxivlangan mahsulot yangi hujjatlarda tanlanmaydi (database §6.1), ya'ni qoldig'i bo'lsa — uni sotib bo'lmaydi, qoldiq hisobotida esa ko'rinib turadi.
- **A (tavsiya, T-303 da shunday):** ruxsat beriladi. Tasdiqlash oynasi qolgan miqdorni ko'rsatadi ("Omborda hali 3 blok 2 dona bor — arxivlangan mahsulotni sotib bo'lmaydi"). Arxivdan chiqarish — bitta tugma, ma'lumot buzilmaydi.
- **B:** omborlar kabi — qoldiq > 0 bo'lsa `ENTITY_NOT_EMPTY`; avval sotish yoki inventarizatsiya bilan 0 ga tushirish kerak. Qat'iyroq, lekin singan/yaroqsiz 2 donani hisobdan chiqarish uchun ham avval inventarizatsiya o'tkazish kerak bo'ladi.
B ga o'tish — `products.archive` da `getProductTotals` bilan bitta tekshiruv (+ test).

### OQ-23 — Xarid qatorida 0 narx
**Javob (2026-10-23, Prompt 41): A** — T-404 dagi amalga oshirish o'zgarmaydi.
FR-4.1 xarid narxini so'raydi, lekin 0 ga ruxsat bor-yo'qligini aytmaydi. Ichimliklar savdosida yetkazib beruvchi ko'pincha "bonus" tovar beradi (masalan, 10 blokka 1 blok tekin).
- **A (tavsiya, T-404 da shunday):** `inputPrice ≥ 0`. Bonus tovar alohida qatorda 0 narx bilan kiritiladi: qoldiq oshadi, `unitCost = 0`, bajarishda (T-405) o'rtacha tannarx pasayadi — bu iqtisodiy jihatdan to'g'ri (tovar tekin kelgan).
- **B:** `inputPrice > 0` majburiy; bonus tovar narxi foydalanuvchi tomonidan boshqa qatorlarga taqsimlanadi (qo'lda, xatoga moyil).
B ga o'tish — `packages/shared/src/schemas/purchase.ts` da `.min(0)` → `.min(1)` (+ test).

### OQ-24 — Kassa jurnalining tartibi
**Javob (2026-10-23, Prompt 44): A.** FR-6.1 kassa jurnalini talab qiladi, lekin tartibini aytmaydi. Kassa yozuvida ikki vaqt bor: `tx_date` (hisobot sanasi — filtrlar va P&L shu bo'yicha, o'tgan sana bilan kiritilishi mumkin, BR-13) va `created_at` (kiritilgan payt). `balance_after` esa kiritilish tartibida hisoblanadi.
- **A (tavsiya, T-701 da shunday):** `tx_date` kamayish bo'yicha, teng bo'lsa `id` kamayish bo'yicha. Sana filtri bilan bir xil mantiq; lekin kecha sanasi bilan bugun kiritilgan yozuv kechagi yozuvlar orasida turadi va uning `balance_after` qo'shni qatorlardan "sakraydi" (jadvalda kiritilgan vaqt ham ko'rsatiladi).
- **B:** kiritilish tartibi (`id` kamayish) — `balance_after` doim ketma-ket, lekin sana ustuni tartibsiz ko'rinishi mumkin.
B ga o'tish — `cash.queries.ts` da `orderBy: [{ id: 'desc' }]` (+ test).
### OQ-25 — Audit jurnalida do'konsiz yozuvlar
**Javob (2026-10-23): B** — tavsiyadan farqli. Audit sahifasi faqat joriy do'kon yozuvlarini ko'rsatadi (`store_id = ctx.storeId`); `store_id IS NULL` bo'lgan muvaffaqiyatsiz kirishlar hozircha kerak emas. `audit.queries.ts` va `audit.int.test.ts` shunga moslandi, `LOGIN_FAILED` filtr/tarjimalardan olib tashlandi (yozuvchi o'zgarmadi — yozuvlar bazada qoladi).
T-901. `audit_log.store_id` ixtiyoriy: `LOGIN_FAILED` (`auth.service`) sessiyasiz yoziladi va `store_id = NULL`, `entity_id` — topilgan foydalanuvchi id'si yoki noma'lum bo'lsa terilgan login. Jurnal "do'kon darajasida" (database §2), lekin bu yozuvlar hech bir do'konga tegishli emas. BR-12 "har o'zgarish… faqat Egasi ko'radi" deydi, kirish urinishlari haqida aniq aytmaydi.
- **A (tavsiya):** Egasi o'z do'koni yozuvlarini **va** `store_id IS NULL`, `entity_type = 'user'` bo'lgan yozuvlarni ko'radi — boshqa tashkilot foydalanuvchisi haqidagilari bundan mustasno. Noma'lum login bilan urinishlar ham ko'rinadi (v1 da bitta tashkilot, ular kimga tegishli ekanini aniqlab bo'lmaydi). Egasi parolni taxmin qilish urinishlarini ko'ra oladi.
- **B (tanlandi, T-901 da shunday):** faqat `store_id = joriy do'kon` — muvaffaqiyatsiz kirishlar jurnalda ko'rinmaydi (faqat `login_attempt` blokida ishlaydi).
A ga qaytish — `audit.queries.ts` dagi `where` ga `store_id IS NULL`, `entity_type = 'user'` (o'z tashkiloti foydalanuvchilari) shartini `OR` bilan qo'shish, `LOGIN_FAILED` ni `AUDIT_ACTIONS` va tarjimalarga qaytarish (+ test).

### OQ-26 — Xarid storno'sidagi yozuvlar sanasi
**Javob (2026-10-23, Prompt 47): A — tavsiya bo'yicha.** T-406. §5.3 storno yozuvlarining (`stock_movement.doc_date`, `cash_transaction.tx_date`) sanasini aytmaydi. Bajarishda ikkalasi ham hujjat sanasi bilan yoziladi (§5.2, BR-13). Qo'lda kiritilgan qarzni bekor qilish (`MANUAL_REVERSAL`, OQ-08) esa joriy vaqt bilan yoziladi.
- **A (tavsiya, T-406 da shunday):** asl `doc_date`. Storno qilingan xarid har qanday sana bo'yicha filtrlangan hisobot va kassa jurnalida o'z kunida nolga tushadi — OQ-01 ("hujjat go'yo bo'lmagan") bilan bir xil mantiq. Kamchilik: o'tgan kunning kassa jurnali storno qilingan paytda o'zgaradi (jurnal `tx_date` bo'yicha tartiblangani uchun qaytim o'sha kunda ko'rinadi, OQ-24), `balance_after` ketma-ketligi "sakraydi".
- **B:** storno payti (`now()`). Pul haqiqatda bugun qaytadi — bugungi kassa sanog'i bilan mos; o'tgan kunlar jurnali o'zgarmaydi. Kamchilik: xarid kuni chiqim, storno kuni kirim bo'lib qoladi (sana bo'yicha hisobotlarda ikki kun bo'yicha "yoyiladi").
B ga o'tish — `purchases.reverse` da `inventory.issue({ docDate })` va `cash.record({ txDate })` ga `new Date()` (+ testdagi sana tekshiruvlari). T-503 (savdo storno'si) ham shu javobga ergashadi.

### OQ-27 — Qarz qaytarish sanasi qarz sanasidan oldin
**Javob (2026-10-23, Prompt 47): A — tavsiya bo'yicha.** T-704. Qaytarish ham, qarz ham o'tgan sana bilan kiritilishi mumkin (OQ-07: faqat kelajak taqiqlangan). Hujjatlar qaytarish sanasining qarz sanasiga nisbatini aytmaydi; o'tgan sana bilan kiritilgan qarzni undan ham oldingi sana bilan "qaytarish" mumkin bo'lib qoladi — kassa jurnali va P&L davrlarida mantiqsiz ketma-ketlik.
- **A (tavsiya, T-704 da shunday):** qaytarish kuni ≥ qarz kuni (do'kon vaqti bo'yicha, bir kun ichida ruxsat). Aks holda `VALIDATION_FAILED` (`params.reason = BEFORE_DEBT_DATE`, `fieldErrors.date`); formada sana maydoni `min` = qarz kuni.
- **B:** cheklov yo'q — faqat OQ-07 (kelajak emas).
B ga o'tish — `debts.commands.ts` dagi `BEFORE_DEBT_DATE` tekshiruvini olib tashlash (+ test).

### OQ-28 — Qoldiq hisobotidagi mahsulotlar va tannarx ustunlari
**Javob (2026-10-23, Prompt 47): 1-A, 2-A — tavsiya bo'yicha.** T-801. SRS §7.1 "har mahsulot dona va blokda; joylashuv bo'yicha" deydi; database §7.1 namunasi faqat `sb.qty > 0` qatorlarni oladi. Ikki narsa aniq emas:
1. **Qoldig'i 0 mahsulot.** Hammasi sotilgan yoki hech qachon kirmagan mahsulot `stock_balance` da `qty > 0` qatoriga ega emas — oddiy ro'yxatda chiqmaydi. Lekin minimal qoldig'i bo'lsa, u eng "kam qolgan" mahsulot (FR-1.3).
   - **A (tavsiya, T-801 da shunday):** oddiy ko'rinishda faqat qoldig'i borlar (database §7.1). "Kam qolganlar" filtri yoqilsa va ombor/sub-ombor tanlanmagan bo'lsa — `minStock > 0` va do'kon bo'yicha jami `< minStock` bo'lgan **barcha** mahsulotlar, qoldig'i 0 bo'lganlari ham (joylashuv "—"). Ombor tanlangan bo'lsa — faqat o'sha joyda qoldig'i borlar, "kam" belgisi esa doim do'kon bo'yicha jamiga qarab (business-logic §9).
   - **B:** "Qoldig'i 0 larni ham ko'rsatish" alohida almashtirgichi — barcha faol mahsulotlar 0 bilan.
2. **Tannarx ustunlari.** SRS §7.1 da tannarx yo'q, lekin Egasi uchun o'rtacha tannarx (1 dona) va qoldiq qiymati (`qty × avgCost`, so'mga yaxlitlangan, jami bilan) foydali. `permissions.ts` da alohida `report.stock.cost` yo'q.
   - **A (tavsiya, T-801 da shunday):** ustunlar `report.sales.cost` bilan (T-401 `getProductTotals` qoidasi) — STAFF javobida `avgCost`, `value`, `totals.value` kalitlari umuman yo'q (integratsiya testi JSON'ni tekshiradi).
   - **B:** yangi `report.stock.cost` ruxsati (OWNER) — architecture §5.5 jadvaliga qator.
   - **C:** tannarx ustunlarini olib tashlash — SRS matniga so'zma-so'z.
1-B ga o'tish — `stockReportQuerySchema` ga `withEmpty` va `stock-report.queries.ts` dagi `includeEmpty` shartini almashtirish (+ test). 2-B — `permissions.ts` + `getProductTotals` o'rniga alohida tekshiruv; 2-C — `reports.stock` dan `avgCost`/`value` ni olib tashlash.

### OQ-29 — Qoralamadan keyin narx o'zgarishi
**Javob (2026-10-23, Prompt 47): A — tavsiya bo'yicha.** T-501. Savdo qatori narxni qoralama **saqlanganda** mahsulotdan nusxalaydi (business-logic §4.1 4-qadam, OQ-05, OQ-15). Qoralama ochiq turganida Egasi/xodim mahsulot narxini o'zgartirsa, saqlangan `unit_price` eskirib qoladi. §4.2 bu holatni aytmaydi. Forma har doim joriy narxni ko'rsatadi va qayta saqlashda uni yozadi — savol faqat qayta saqlanmagan qoralamani bajarish haqida.
- **A (tavsiya):** bajarishda `line.unitPrice ≠ product.salePrice` bo'lsa → `SALE_PRICE_CHANGED { lines: [{ lineNo, product, unitPrice, salePrice }] }`; foydalanuvchi qoralamani qayta saqlaydi (yangi jami va to'lov qismlari ko'rinadi). BR-2 "bitta narx" saqlanadi, kassir pulni eski summada olmaydi. OQ-06 (`UNITS_PER_BLOCK_CHANGED`) bilan bir xil yo'l. Yangi xato kodi kerak.
- **B:** saqlangan narx bilan bajariladi — mijozga aytilgan summa o'zgarmaydi, lekin narx o'zgargandan keyin eski narxda sotish mumkin bo'ladi.
- **C:** bajarishda narx jimgina qayta hisoblanadi — jami o'zgaradi va to'lov qismlari mos kelmay `PAYMENT_SPLIT_MISMATCH` beradi (tushunarsiz xato), tavsiya etilmaydi.

### OQ-30 — Kassa yozuvi storno'sining sanasi
T-703. Xato kiritilgan yo'l kira/boshqa chiqim/o'tkazma storno qilinganda teskari `MANUAL_REVERSAL` yozuviga qaysi `tx_date` qo'yiladi? Hujjatlarda aytilmagan; `debts.cancel` (qo'lda qarz bekor qilish) hozir storno paytini yozadi.
- **A (tavsiya, qilingan):** asl yozuvning `tx_date` si. OQ-01/OQ-26 bilan bir xil: xato yozuv go'yo bo'lmagandek o'z kunida nolga tushadi; jurnal `tx_date` bo'yicha tartiblangani uchun teskari yozuv asl yozuv yonida turadi. O'tgan kunli yozuvlarda `balance_after` ketma-ket bo'lmasligi mumkin (OQ-24 da qabul qilingan), jurnal "Kiritilgan: …" vaqtini ko'rsatadi.
- **B:** storno payti (bugun). Pul aslida bugun "qaytgani" ko'rinadi, lekin asl kunning kassa jami noto'g'ri qoladi.
P&L ga ta'sir yo'q: storno qilingan yo'l kira sanadan qat'i nazar hisobga olinmaydi (§8).

### OQ-31 — Arxivlangan sub-omborga savdo storno'si
T-503. Savdo bajarilgach sub-ombor bo'sh qolishi mumkin; FR-2.2 bo'sh sub-omborni arxivlashga ruxsat beradi. Keyin savdo storno qilinsa, §4.3 tovarni o'sha sub-omborga qaytaradi — arxivlangan sub-omborda qoldiq paydo bo'ladi (u formalarda tanlanmaydi, sotib ham, arxivdan "bo'shatib" ham bo'lmaydi). §4.3 bu holatni aytmaydi.
- **A (tavsiya, T-503 da shunday):** storno bloklanadi — `ENTITY_ARCHIVED { entity: 'sub_warehouse' | 'warehouse', name }`, xabar: "avval uni tiklang". Bajarishdagi arxiv tekshiruvi bilan bir xil (`warehouses.lockActive`), arxivlangan joyda qoldiq bo'lmaydi.
- **B:** ruxsat — tovar arxivlangan sub-omborga qaytadi; Egasi keyin uni tiklab tovarni ko'chiradi. Kamchilik: arxivlangan joyda yashirin qoldiq.
- (Arxivlangan **mahsulot** xato emas — arxiv mahsulot qoldig'ini taqiqlamaydi, tovar qaytadi.)
B ga o'tish — `sales.reverse` da `warehouses.lockForPosting(..., { requireActive: false })` (xarid storno'sidagidek) va `sale-reverse.int.test.ts` dagi OQ-31 testi.

### OQ-32 — Inventarizatsiyada arxivlangan mahsulot
T-601. OQ-20 (A) qoldig'i bor mahsulotni arxivlashga ruxsat beradi — bunday mahsulotni sotib bo'lmaydi, lekin u omborda turadi. Inventarizatsiyada u nima bo'ladi? BR-8 "har sub-omborda har mahsulot sanaladi" deydi; arxiv haqida hech narsa yo'q.
- **A (tavsiya, T-601 da shunday):** arxivdagi mahsulot sanoq formasida qoldig'i bor sub-omborlarda chiqadi (belgi bilan) va sanaladi — masalan, singan/yaroqsiz tovarni 0 qilib hisobdan chiqarish shu yo'l bilan. Qoldig'i yo'q sub-omborga arxivdagi mahsulotni qo'shish → `ENTITY_ARCHIVED { entity: 'product', name }` (arxivdagi tovar yangi joyga "kirmaydi"). "Qo'shish" ro'yxatida faqat faol mahsulotlar.
- **B:** arxivdagi mahsulot umuman sanalmaydi — qoldig'i hisobotda abadiy qoladi, uni tushirish uchun avval arxivdan chiqarish kerak.
B ga o'tish — `stock-counts.service.ts` `computeLines` da arxivdagi mahsulotni har doim rad etish (+ test).

### OQ-33 — Sanalgan qatorsiz inventarizatsiya
T-602. §6.2 bo'sh sanoqni aytmaydi. Sanalmagan qator o'zgarmaydi (OQ-13), demak bo'sh sanoqni bajarish hech narsani o'zgartirmaydi — faqat "bajarilgan" hujjat va 0 so'mlik natija qoladi, ombor esa haqiqatda sanalmagan.
- **A (tavsiya, T-602 da shunday):** rad etiladi — `STOCK_COUNT_EMPTY`; UI'da "Bajarish" o'chiq ("kamida bitta qatorni sanang va saqlang"). Sanoq ochiq qoladi; kerak bo'lmasa "Bekor qilish" — bu ham blokni yechadi.
- **B:** ruxsat — hujjat `POSTED`, qoldiq o'zgarmaydi, kamomad/ortiqcha 0. Kamchilik: hisobotda "o'tkazilgan" inventarizatsiya, aslida sanoq bo'lmagan.
B ga o'tish — `stock-counts.service.ts` `post` dagi tekshiruvni olib tashlash (`inventory.adjust` bo'sh ro'yxatni qabul qilmaydi — undan oldin to'xtash kerak) va `stock-count-post.int.test.ts` dagi OQ-33 testi.

### OQ-34 — Inventarizatsiya banneri qachon yangilanadi
T-603. Banner ochiq sanoqlarni server'da, `(app)` layout bilan o'qiydi. Lekin Next.js layout'ni sahifadan sahifaga (client navigatsiya) o'tganda qayta render qilmaydi: faqat shunga tayansak, bir xodim sanoqni ochsa yoki yopsa, boshqa qurilmadagi xodim buni sahifani qayta yuklaguncha (F5) yoki o'zi biror inventarizatsiya amalini bajarguncha ko'rmaydi (brauzerda tasdiqlandi). BR-8 bannerdan "unutilib savdoni to'xtatib qo'ymaslik"ni kutadi; qanchalik tez yangilanishi aytilmagan.
- **A (tavsiya, T-603 da shunday):** birinchi ro'yxat layout bilan keladi, keyin banner har sahifa o'tishida va brauzer tabi qayta ko'ringanda `GET /api/stock-counts/open` ni o'qiydi (bitta kichik so'rov, taymer yo'q). Boshqa qurilmadagi o'zgarish keyingi bosishda ko'rinadi; bitta sahifada qimirlamay turgan xodim uni ko'rmaydi (savdoni bajarishda baribir `WAREHOUSE_IN_STOCK_COUNT` xabari chiqadi).
- **B:** faqat server render — qo'shimcha so'rov yo'q, lekin boshqa qurilmada banner F5 gacha eskirgan bo'lib qoladi.
- **C:** davriy so'rov (masalan, 30 soniyada) — ochiq sahifada ham deyarli darhol, lekin har ochiq tab doimiy yuklama beradi.
B ga o'tish — `open-stock-count-banner.tsx` dagi `useEffect` ni va `app/api/stock-counts/open/route.ts` ni olib tashlash; C ga — o'sha effektga `setInterval` qo'shish.

### OQ-35 — Savdo hisobotining standart davri va qatorlar tartibi
T-802. SRS §7.2 "sana oralig'i va mahsulot kesimida" deydi; database §7.2 namunasi `from`/`to` ni majburiy oladi, tartibni aytmaydi. Ikki narsa aniq emas:
1. **Davr tanlanmagan bo'lsa** (menyudan birinchi ochilganda, URL'da `from`/`to` yo'q).
   - **A (tavsiya, T-802 da shunday):** joriy oy — 1-sanadan bugungacha (Toshkent kunlari). "Bugun" va "Shu oy" tugmalari bor; bir chetini bo'shatsa, o'sha tomoni ochiq (`?to=…` — boshidan shu kungacha, `?from=…` — shu kundan keyin hammasi). Server ham ikkala chetni ixtiyoriy qabul qiladi (`from > to` → `VALIDATION_FAILED`; sahifa URL'dagi teskari oraliqni almashtirib yuboradi).
   - **B:** bugun (bir kun).
   - **C:** butun davr (filtrsiz).
2. **Qatorlar tartibi.**
   - **A (tavsiya, T-802 da shunday):** mahsulot nomi bo'yicha — qoldiq hisoboti (T-801) va kelgusi eksport (T-804) bilan bir xil, mahsulotni topish oson.
   - **B:** tushum bo'yicha kamayish tartibida ("eng ko'p sotilganlar" yuqorida).
1-B/1-C ga o'tish — `apps/web/src/features/reports/sales-params.ts` dagi `currentMonth` sukutini almashtirish (+ `sales-params.test.ts`). 2-B — `sales-report.queries.ts` da `items` ni `revenue` bo'yicha saralash (+ integratsiya testidagi tartib).

### OQ-36 — P&L davri
T-803. BR-11 / business-logic §8 filtrni "kun / oy / yil / ixtiyoriy oraliq (Toshkent vaqti)" deb belgilaydi, lekin ikki narsa aytilmagan:
1. **Davr tanlanmagan bo'lsa** (menyudan ochilganda).
   - **A (tavsiya, T-803 da shunday):** joriy oy — savdo hisoboti (OQ-35) bilan bir xil; Egasi odatda oyni yopadi. URL'da parametr yo'q.
   - **B:** bugun.
   - **C:** joriy yil.
2. **"Oy" va "Yil" chegarasi.**
   - **A (tavsiya, T-803 da shunday):** to'liq kalendar oy/yil (`?month=2026-10` → 01.10–31.10, `?year=2026` → 01.01–31.12), sarlavha ostida aniq kunlar ko'rsatiladi. Kelajakdagi hujjat bo'lmaydi (OQ-07), shuning uchun joriy oy/yil summasi "bugungacha" bilan bir xil, lekin o'tgan oy/yil to'liq va bir xil ko'rinishda. ‹ › — qo'shni kun/oy/yil, kelajakdagi davrga o'tilmaydi. Tur almashtirilganda joriy davr bugunni o'z ichiga olsa — bugungi kun/oy/yil, aks holda davrning birinchi kuni; "Oraliq" — joriy davr kunlari (bugun bilan kesilgan).
   - **B:** joriy oy/yil bugungacha (savdo hisobotidagi "Shu oy" kabi) — summa bir xil, faqat sarlavhadagi sana farq qiladi.
URL: `?day=YYYY-MM-DD` · `?month=YYYY-MM` · `?year=YYYY` · `?from=&to=` (birinchi to'g'ri tur ustun; oraliqning bir cheti bo'sh bo'lsa — o'sha tomoni ochiq, teskari oraliq almashtiriladi). Server faqat `from`/`to` (Toshkent kunlari) qabul qiladi — tur sahifada kunlarga aylantiriladi.
1-B/1-C ga o'tish — `apps/web/src/features/reports/pnl-params.ts` dagi `currentMonthPeriod` sukutini almashtirish (+ `pnl-params.test.ts`). 2-B — `pnlPeriodRange` da `to` ni bugun bilan cheklash.

### OQ-39 — Bosh sahifada arxivlangan kam qolgan mahsulotlar
T-902. business-logic §9 "dashboard'da «Kam qolgan mahsulotlar» bloki" deydi, arxivni aytmaydi. Mahsulotlar ro'yxati sukut bo'yicha faqat faollarni, qoldiq hisoboti esa (OQ-20, T-801) faol va arxivni birga ko'rsatadi. Arxivlangan mahsulot sotilmaydi va qayta xarid qilinmaydi — uning minimal qoldig'i amalda eskirgan.
- **A (tavsiya, T-902 da shunday):** faqat faol mahsulotlar. "Qoldiq hisobotida ko'rish" havolasi `/reports/stock?low=1&archived=0` — hisobotdagi son blokdagi jami bilan bir xil.
- **B:** arxivlanganlari ham (qoldiq hisobotining sukuti kabi), belgi bilan. Kamchilik: chiqarib tashlangan mahsulotlar har kuni ogohlantirish beradi, uni yo'qotish uchun minimal qoldiqni 0 ga tushirish kerak.
B ga o'tish — `dashboard.queries.ts` dagi `archivedAt: null` shartini olib tashlash, DTO'ga `archived` qo'shish, `features/dashboard/links.ts` dagi `archived: false` ni olib tashlash (+ `dashboard.int.test.ts` dagi OQ-39 testi, `links.test.ts`).

### OQ-40 — "Kam qolgan mahsulotlar" blokining hajmi va tartibi
T-902. Necha mahsulot ko'rsatilishi va tartibi aytilmagan; mahsulotlar soni o'sishi bilan to'liq ro'yxat bosh sahifani cho'zib yuboradi (to'liq ro'yxat — qoldiq hisobotida).
- **A (tavsiya, T-902 da shunday):** jami soni va eng ko'p kamaygan 10 tasi (`DASHBOARD_LOW_STOCK_LIMIT`): `qoldiq / minimal` o'sish tartibida — umuman qolmaganlari birinchi, teng bo'lsa nom bo'yicha (`compareStockShortage`, `@drinks/shared`); qolganlari uchun "Yana N ta" va hisobotga havola.
- **B:** nom bo'yicha (qoldiq hisoboti kabi), shu 10 ta.
- **C:** hammasi, cheklovsiz.
B ga o'tish — `dashboard.queries.ts` dagi `low.sort(compareStockShortage)` ni olib tashlash; C — `slice` ni olib tashlash (+ `dashboard.int.test.ts` dagi OQ-40 testi).
