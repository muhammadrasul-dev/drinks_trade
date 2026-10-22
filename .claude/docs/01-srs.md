# Ichimliklar do'koni uchun mini-ERP — Texnik topshiriq (SRS)

Versiya: 1.0 (biznes talablar) · Sana: 2026-10-22
Holat: biznes savollarning hammasiga javob berilgan, ochiq biznes savol yo'q. Texnik masalalar `open-questions.md` da.

**1.0 da o'zgarganlar (0.2 ga nisbatan):** Xodim xarid narxini ko'radi, lekin foyda, kassa va qarzlarni ko'rmaydi; o'tgan sana bilan hujjatni Xodim ham kirita oladi; inventarizatsiya hujjati ochiq turganda shu ombor bo'yicha savdo/xarid/storno bajarilmaydi.

---

## 1. Maqsad

Bitta ichimliklar do'koni egasiga uchta narsani aniq ko'rsatish:
1. Omborda qancha tovar bor (dona va blok ko'rinishida).
2. Tovar qayerda turibdi (ombor → sub-ombor).
3. Biznes qancha **sof foyda** keltirmoqda (P&L).

## 2. Ko'lam

**Kiradi (v1):** mahsulot, ombor/sub-ombor, savdo, xarid, inventarizatsiya, kassa (naqd/karta), qarzlar, hisobotlar (qoldiq, savdo, P&L), audit log, uz/ru interfeys, PDF/Excel eksport.

**Kirmaydi (v1):** filiallar/ko'p do'kon, mijoz va ta'minotchi ro'yxati, chegirma, optom narx, kun yopish (smena), ko'chirish hujjati, manfiy qoldiq, valyuta (faqat so'm), soliq, ish haqi, partiya/yaroqlilik muddati bo'yicha hisob, kassa va qarz hisobotlari, boshlang'ich ma'lumot importi.

**Kengayish talabi:** tizim bitta do'kon uchun quriladi, lekin ma'lumotlar bazasi keyinchalik filial/ko'p do'kon qo'shishga tayyor bo'lishi shart (arxitektura bosqichida hal qilinadi).

## 3. Rollar

| Rol | Huquqlari |
|---|---|
| **Egasi** | Hamma narsa: P&L, kassa, qarzlar, foydalanuvchilar, audit log |
| **Xodim** | Mahsulot, qoldiq va xarid narxlarini ko'rish; savdo, xarid, inventarizatsiya hujjatlarini yaratish va bajarish (o'tgan sana bilan ham); qoldiq va savdo hisobotlari (tannarx/foyda ustunlarisiz). **Ko'rmaydi:** foyda (P&L, yalpi foyda, tannarx), kassa, qarzlar, to'lov ma'lumotlari, audit log |

## 4. Glossariy

| Atama | Ma'nosi |
|---|---|
| Blok | Mahsulotning o'rami; ichida N dona bor (N har mahsulotda belgilanadi) |
| Dona | Eng kichik birlik. Qoldiq tizim ichida **doim donada** saqlanadi, ekranda blok + dona ko'rinadi |
| Ombor / Sub-ombor | 2 darajali joylashuv. Mahsulot qoldig'i sub-ombor darajasida saqlanadi |
| Bajarish | Hujjatni qoralamadan haqiqiy holatga o'tkazish (qoldiq/kassa o'zgaradi) |
| Storno | Bajarilgan hujjatni teskari yozuv bilan bekor qilish |
| Tannarx (COGS) | Sotilgan tovarning o'rtacha tortilgan xarid narxi |
| Nasiya | To'lanmagan qism; qarzlar ro'yxatiga tushadi |

## 5. Biznes qoidalari

**BR-1 Birliklar.** `qoldiq_dona = blok_soni × blokdagi_dona + dona`. Ekranda `qoldiq_dona` blok va qoldiq dona ko'rinishiga ajratiladi (masalan, 20 dona, blok=6 → "3 blok 2 dona").

**BR-2 Narx.** Har mahsulotda bitta sotuv narxi (optom/chakana farqi yo'q, chegirma yo'q). Xarid narxi har xarid hujjatida kiritiladi.

**BR-3 Hujjat holatlari.** Qoralama → Bajarilgan → (Storno qilingan). Qoralamani tahrirlash va o'chirish mumkin. Bajarilgan hujjat o'zgartirilmaydi, faqat storno qilinadi. Storno audit logga yoziladi.
- Savdo storno qilinsa tovar sub-omborga **savdodagi tannarx bilan** qaytadi.
- Xarid storno qilinsa, undan chiqib ketadigan tovar hozir omborda yetarli bo'lmasa, storno **bloklanadi**; xato xabarida sababi ko'rsatiladi (avval tegishli savdoni storno qilish kerak).

**BR-4 Xarid bajarilganda:** tanlangan sub-omborga tovar kiradi; o'rtacha tannarx qayta hisoblanadi; to'lov qismlariga qarab kassa(lar)dan chiqim va/yoki qarz (kreditor) yoziladi.

**BR-5 Savdo bajarilganda:** tanlangan sub-ombordan tovar chiqadi; tushum va tannarx (savdo paytidagi o'rtacha) qayd etiladi; to'lov qismlariga qarab kassa(lar)ga kirim va/yoki qarz (debitor) yoziladi.

**BR-6 O'rtacha tortilgan tannarx** (mahsulot bo'yicha, barcha omborlar yig'indisida):
`yangi_tannarx = (eski_qoldiq × eski_tannarx + kirim_soni × xarid_narxi) / (eski_qoldiq + kirim_soni)`.
Savdo tannarxga ta'sir qilmaydi. Savdo paytidagi tannarx savdo qatorida muzlatib saqlanadi. Tannarx hujjat sanasi bilan emas, **bajarilgan vaqt tartibi** bilan hisoblanadi (o'tgan sana bilan kiritilgan hujjat ham shu qoidaga bo'ysunadi, sana faqat hisobot davrini belgilaydi).

**BR-7 Qoldiq nazorati.** Qoldiq yetmasa savdoni **bajarib bo'lmaydi** (hech kim, Egasi ham). Qoldiq manfiy bo'lishi mumkin emas. Tekshiruv: tanlangan sub-omborda mahsulot yetarlimi. Savdo qatorini kiritishda ham, bajarishda ham tekshiriladi. Bajarishda qayta tekshirish majburiy (bir vaqtda boshqa savdo qoldiqni kamaytirgan bo'lishi mumkin).

**BR-8 Inventarizatsiya.** Butun ombor bo'yicha o'tkaziladi: har sub-omborda har mahsulot sanaladi. Tizim qoldig'i haqiqiy qoldiqqa tenglashtiriladi.
- Mahsulotning **ombor bo'yicha umumiy** kamomadi → yo'qotish = kamomad × o'rtacha tannarx (P&L da alohida qator).
- Umumiy ortiqcha → ortiqcha daromad = ortiqcha × o'rtacha tannarx (P&L ga qo'shiladi).
- Sub-omborlar orasidagi farq (bittasida kam, boshqasida ortiq, umumiy teng) P&L ga **ta'sir qilmaydi**, faqat joylashuv tuzatiladi. Ko'chirish hujjati yo'qligi uchun joylashuv xatolari shu yo'l bilan tuzatiladi.
- Inventarizatsiya hujjati ochiq (qoralama) turganda shu ombor bo'yicha **savdo, xarid va storno bajarilmaydi** (qoldiq sanoq paytida o'zgarmasligi uchun). Hujjatlarni qoralama sifatida yaratish mumkin, faqat bajarish bloklanadi; xato xabarida sababi ("X ombor inventarizatsiyada") ko'rsatiladi. Boshqa omborlar bloklanmaydi.
- Inventarizatsiyani bajarish yoki qoralamani bekor qilish bloklashni darhol olib tashlaydi. Bir ombor uchun bir vaqtda faqat bitta ochiq inventarizatsiya bo'ladi. Ochiq inventarizatsiya ro'yxatda yaqqol ko'rinadi (unutilib savdoni to'xtatib qo'ymasligi uchun).

**BR-9 To'lov va kassa.** Ikkita kassa: **Naqd** va **Karta**. Faqat so'm. Kassalar orasida o'tkazma bor. Kun yopish yo'q.
- Savdo va xarid to'lovi qismlarga bo'linishi mumkin: Naqd + Karta + Nasiya. Yig'indi hujjat summasiga teng bo'lishi shart. Nasiya qismi qarzlarga tushadi.
- Chiqim kassadagi balansdan oshmasligi kerak (kassa manfiy bo'lmaydi). Bu savdo storno'si, xarid to'lovi, qarz berish va boshqa barcha chiqimlarga tegishli.

Kassa harakati turlari:

| Tur | Yo'nalish | P&L ga ta'siri |
|---|---|---|
| Savdodan tushum (avto) | Kirim | Tushum (savdo orqali) |
| Xariddan to'lov (avto) | Chiqim | Yo'q (zaxira) |
| Qarz olish | Kirim | Yo'q |
| Qarz berish | Chiqim | Yo'q |
| Qarz qaytarish (olingan/berilgan) | Chiqim / Kirim | Yo'q |
| Yo'l kira | Chiqim | **Xarajat** |
| Boshqa chiqim (egasi pul olishi va h.k.), **izoh majburiy** | Chiqim | **Yo'q** (xarajat emas) |
| Kassalar orasida o'tkazma | Chiqim + Kirim | Yo'q |

Boshqa kirim turlari v1 da yo'q.

**BR-10 Qarzlar.** Kontragent ro'yxati yo'q, har qarz **izoh** bilan yuritiladi. Ikki yo'nalish: *Menga qarz* (debitor: qarz berildi, nasiya savdo) va *Mendan qarz* (kreditor: qarz olindi, nasiya xarid). Qarz qoldig'i = summa − qaytarilgan. Qisman qaytarish mumkin.

**BR-11 Sof foyda formulasi** (hisoblash usuli, tanlangan davr uchun):

```
Tushum                         = bajarilgan savdolar summasi (nasiya ham kiradi, storno ayiriladi)
− Sotilgan tovar tannarxi      = Σ (sotilgan soni × savdo paytidagi o'rtacha tannarx)
= Yalpi foyda
− Yo'l kira
− Inventarizatsiya kamomadi    (+ ortiqcha bo'lsa qo'shiladi)
= SOF FOYDA
```
Kirmaydi: xarid summasi (u zaxira), qarz berish/olish/qaytarish, boshqa chiqim (egasi olishi), kassalar orasida o'tkazma.

**BR-12 Audit.** Har o'zgarish yoziladi: kim, qachon, nima, eski va yangi qiymat. Audit yozuvlari o'zgartirilmaydi va o'chirilmaydi. Faqat Egasi ko'radi.

**BR-13 O'tgan sana.** Hujjat sanasini o'tgan sana qilib kiritish mumkin (Egasi ham, Xodim ham). Barcha holat audit logda ko'rinadi. Hisobot davri hujjat sanasi bo'yicha, tannarx esa BR-6 bo'yicha.

## 6. Funksional talablar

### 6.1 Mahsulot
- FR-1.1 Yaratish/tahrirlash: nom, **blokdagi dona soni**, sotuv narxi, toifa, brend, SKU, shtrix-kod, rasm, minimal qoldiq, yaroqlilik muddati (**oddiy ma'lumot maydoni**, hisobda ishtirok etmaydi).
- FR-1.2 Mahsulotni o'chirish o'rniga arxivlash (hujjatlarda bor mahsulot o'chirilmaydi).
- FR-1.3 Qoldiq minimaldan pastga tushsa ogohlantirish.

### 6.2 Ombor
- FR-2.1 Ombor yaratish; ichida sub-ombor yaratish (faqat 2 daraja).
- FR-2.2 Bo'sh bo'lmagan ombor/sub-omborni o'chirib bo'lmaydi (arxivlanadi).

### 6.3 Savdo
- FR-3.1 Savdo hujjati: sana, qatorlar (mahsulot, **qaysi sub-ombordan**, soni — dona yoki blok, narx), to'lov qismlari (Naqd / Karta / Nasiya), izoh.
- FR-3.2 "Yaratish" (qoralama) va "Bajarish" — alohida tugmalar.
- FR-3.3 BR-7 bo'yicha qoldiq nazorati: yetarli bo'lmasa qatorda xato ko'rsatiladi va bajarish tugmasi o'chiq.

### 6.4 Xarid
- FR-4.1 Xarid hujjati: sana, qatorlar (mahsulot, **qaysi sub-omborga**, soni, xarid narxi), to'lov qismlari (Naqd / Karta / Nasiya), izoh.
- FR-4.2 Yaratish va bajarish — alohida.

### 6.5 Inventarizatsiya
- FR-5.1 Butun ombor uchun hujjat ochiladi; har (sub-ombor, mahsulot) uchun haqiqiy qoldiq kiritiladi (blok + dona).
- FR-5.2 Tizim farqni ko'rsatadi; "Bajarish"da qoldiq tenglashadi, BR-8 bo'yicha kamomad/ortiqcha yoziladi.

### 6.6 Kassa
- FR-6.1 Ikki kassa balansi alohida ko'rinadi (faqat Egasi).
- FR-6.2 Kirim/chiqim kiritish (BR-9 turlari); "Boshqa chiqim" da izoh majburiy.
- FR-6.3 Kassalar orasida o'tkazma.

### 6.7 Qarzlar
- FR-7.1 Qarz ro'yxati (yo'nalish, summa, qaytarilgan, qoldiq, izoh) — faqat Egasi.
- FR-7.2 Qarz qaytarish → tanlangan kassada harakat yaratadi.

## 7. Hisobotlar

Hammasi **PDF va Excel** ga eksport qilinadi. Faqat quyidagi uchta hisobot (qo'shimchalar yo'q).

1. **Mahsulotlar qoldig'i** — har mahsulot dona va blokda; joylashuv bo'yicha (ombor → sub-ombor → qancha).
2. **Savdo hisoboti** — bajarilgan savdolar; sana oralig'i va **mahsulot kesimida**: soni, tushum, **tannarx, yalpi foyda**. Mijoz, sotuvchi, toifa kesimlari yo'q. Tannarx va foyda ustunlarini faqat Egasi ko'radi; Xodim bu hisobotni shu ustunlarsiz ko'radi.
3. **P&L** — BR-11 formulasi; filtr: kun / oy / yil / ixtiyoriy oraliq. Faqat Egasi.

## 8. Nofunksional talablar

- **Til:** interfeys o'zbek (lotin) va rus tilida, almashtiriladi.
- **Pul:** faqat so'm, butun son sifatida saqlanadi.
- **Yaxlitlik:** bajarish operatsiyasi atomik; bir vaqtda ikki foydalanuvchi bir qoldiqni buzmasligi kerak (BR-7).
- **Audit:** BR-12.
- **Kengayish:** ma'lumotlar modeli keyin filial qo'shishga tayyor.
- Texnologiya, joylashtirish, platforma (web/mobil) — keyingi bosqichda (texnik talablar alohida beriladi).
