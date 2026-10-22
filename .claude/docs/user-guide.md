# Foydalanuvchi qo'llanmasi

Versiya: 0.1 (qoralama — interfeys tayyor bo'lgach skrinshotlar bilan to'ldiriladi) · Sana: 2026-10-22
Kim uchun: do'kon **Egasi** va **Xodim**.

---

## 1. Tizim nima qiladi
- Omborda qancha tovar borligini **blok va donada** ko'rsatadi.
- Tovar **qaysi ombor / sub-omborda** turganini ko'rsatadi.
- **Sof foyda**ni hisoblaydi (faqat Egasi ko'radi).

## 2. Kirish va til
1. Brauzerda tizim manzilini oching → **Kirish** sahifasi.
2. Login va parolni kiriting. (Login/parolni Egasi beradi.)
3. Yuqori o'ng burchakda til: **O'zbekcha / Русский**. Tanlov eslab qolinadi.
4. Chiqish: foydalanuvchi menyusi → **Chiqish**.
5. **Mening akkauntim** (foydalanuvchi menyusi) — F.I.O, login va rolingiz. Xodim bu yerda faqat ko'radi; Egasi o'zgartiradi (12-bo'lim).

Parolni unutsangiz — Egasiga murojaat qiling, u yangi parol o'rnatadi.

## 3. Rollar — kim nimani ko'radi

| Bo'lim | Egasi | Xodim |
|---|:-:|:-:|
| Mahsulotlar, omborlar | ✅ | ✅ |
| Xarid narxlari | ✅ | ✅ |
| Savdo, xarid, inventarizatsiya (yaratish, bajarish) | ✅ | ✅ |
| Storno | ✅ | ❌ |
| Qoldiq hisoboti | ✅ | ✅ |
| Savdo hisoboti | ✅ (tannarx, foyda bilan) | ✅ (tannarx/foydasiz) |
| P&L (foyda-zarar) | ✅ | ❌ |
| Kassa, qarzlar | ✅ | ❌ |
| Foydalanuvchilar, audit jurnali | ✅ | ❌ |

Xodim menyusida unga yopiq bo'limlar ko'rinmaydi. Bunday bo'lim manzilini qo'lda ochsa — **Ruxsat yo'q** (403) sahifasi chiqadi.


## 4. Asosiy tushunchalar
- **Dona / Blok.** Har mahsulotda "blokdagi dona soni" bor. Masalan, Cola 0.5 L — blokda 12 dona. 27 dona = **2 blok 3 dona**.
- **Ombor → Sub-ombor.** Masalan: "Asosiy ombor" → "Javon A", "Muzlatgich". Tovar har doim sub-omborda turadi.
- **Qoralama** — saqlangan, lekin hali qoldiq va pulga ta'sir qilmagan hujjat. Tahrirlash va o'chirish mumkin, boshqa xodim yaratgan qoralamani ham.
- **Bajarish** — hujjat kuchga kiradi: tovar kiradi/chiqadi, pul harakati yoziladi. Bajarilgan hujjat o'zgartirilmaydi.
- **Storno** — bajarilgan hujjatni bekor qilish (hammasi teskari qaytadi). Hujjat o'chmaydi, "Storno qilingan" holatida qoladi.
- **Nasiya** — to'lanmagan qism; avtomatik qarzlar ro'yxatiga tushadi. Nasiya bo'lsa hujjat **izohi majburiy** (kim qarzdor/kimga qarz — qarzlar ro'yxatida shu izoh ko'rinadi).

## 5. Birinchi sozlash (Egasi)
1. **Omborlar** → "Ombor qo'shish" → nom. Ombor kartochkasida → "Sub-ombor qo'shish" (faqat 2 daraja: sub-ombor ichida yana sub-ombor bo'lmaydi). Ombor nomi takrorlanmaydi; sub-ombor nomi bitta ombor ichida takrorlanmaydi (katta-kichik harf farq qilmaydi). Kerak bo'lmay qolgan ombor/sub-omborni **arxivlang** — faqat u **bo'sh** bo'lsa (qoldiq 0) va omborda ochiq inventarizatsiya bo'lmasa. Arxivdagi ombor/sub-ombor hujjatlarda tanlanmaydi; "Arxiv" ro'yxatidan qaytarish mumkin (arxivdagi ombor ichidagi sub-omborni qaytarish uchun avval omborni qaytaring).
2. **Mahsulotlar** → **Toifalar** / **Brendlar** → "Toifa qo'shish" / "Brend qo'shish" (nom takrorlanmaydi, katta-kichik harf farq qilmaydi). Kerak bo'lmay qolganini **arxivlang** — u yangi mahsulotlarda tanlanmaydi, mavjud mahsulotlarda saqlanib qoladi; "Arxiv" ro'yxatidan qaytarish mumkin.
3. **Mahsulotlar** → "Mahsulot qo'shish": nom, blokdagi dona soni, sotuv narxi (1 dona), toifa, brend, SKU, shtrix-kod, rasm, minimal qoldiq, yaroqlilik muddati (ixtiyoriy, faqat ma'lumot).
4. **Foydalanuvchilar** → "Xodim qo'shish": F.I.O, login, parol. Xodimlar soni cheklanmagan, har biriga alohida login bering (umumiy akkaunt ishlatmang, aks holda audit kim nima qilganini ko'rsata olmaydi).
5. Boshlang'ich qoldiqni kiritish uchun — **Xarid** hujjati orqali (alohida import yo'q).

## 6. Xarid (tovar kirimi)
1. **Xaridlar** → "Yangi xarid".
2. Sana (default — bugun; o'tgan sanani tanlash mumkin, kelajak sanani — yo'q).
3. Qator qo'shish: mahsulot → **qaysi sub-omborga** → soni (dona yoki blok) → narx (tanlangan birlik uchun).
4. Pastda to'lov: **Naqd + Karta + Nasiya** — yig'indi jami summaga teng bo'lishi kerak.
5. **Saqlash** — qoralama. **Bajarish** — tovar omborga kiradi, kassadan pul chiqadi, nasiya qismi "Mendan qarz"ga tushadi.

Kassada pul yetmasa bajarilmaydi ("Kassada mablag' yetarli emas").

## 7. Savdo
1. **Savdolar** → "Yangi savdo".
2. Qator: mahsulot (nom yoki shtrix-kod) → **qaysi sub-ombordan** → soni (dona/blok). Narx mahsulot kartochkasidan avtomatik olinadi va savdoda o'zgartirilmaydi (narxni o'zgartirish — **Mahsulotlar** bo'limida).
3. Qatorda qoldiq ko'rinadi. Yetmasa qator **qizil** bo'ladi va **Bajarish** tugmasi o'chadi.
4. To'lov: Naqd + Karta + Nasiya = jami.
5. **Bajarish** — tovar chiqadi, pul kassaga tushadi, nasiya "Menga qarz"ga tushadi.

Bir vaqtda boshqa xodim shu tovarni sotib yuborgan bo'lsa, bajarishda tizim qayta tekshiradi va xato chiqaradi — qatorni to'g'irlang.

## 8. Inventarizatsiya (sanoq)
1. **Inventarizatsiya** → "Yangi" → omborni tanlang.
2. ⚠️ Shu paytdan boshlab **shu ombor bo'yicha savdo, xarid va storno bajarilmaydi** (qoralama yaratish mumkin). Barcha sahifalarda sariq ogohlantirish chiqadi. Sanoqni uzoq ochiq qoldirmang!
3. Har sub-ombor va mahsulot uchun haqiqiy sonni kiriting (blok + dona). Tizim farqni ko'rsatadi.
4. **Bajarish** — qoldiq haqiqiy songa tenglashadi. Ombor bo'yicha kamomad — yo'qotish, ortiqcha — daromad sifatida P&L'ga tushadi. Bir sub-omborda kam, boshqasida ortiq (jami teng) bo'lsa — faqat joylashuv tuzatiladi, foydaga ta'sir yo'q. (Tovarni bir joydan boshqasiga ko'chirish ham shu yo'l bilan qilinadi.)
5. Kerak bo'lmasa — **Bekor qilish** (blok yechiladi).

## 9. Kassa (faqat Egasi)
Ikkita kassa: **Naqd** va **Karta**, balanslari alohida. Kassa manfiy bo'lmaydi.

| Amal | Qayerda | Foydaga ta'siri |
|---|---|---|
| Yo'l kira | Kassa → "Chiqim" → Yo'l kira | Xarajat (foydani kamaytiradi) |
| Boshqa chiqim (masalan, egasi pul oldi) | Kassa → "Chiqim" → Boshqa (izoh majburiy) | Yo'q |
| Qarz berish / olish | Kassa → "Qarz berish" / "Qarz olish" (izoh majburiy) | Yo'q |
| Kassalar orasida o'tkazma | Kassa → "O'tkazma" | Yo'q |

Xato kiritilgan yozuv (masalan, yo'l kira summasi noto'g'ri) o'chirilmaydi: yozuv yonidagi **Storno** tugmasi teskari yozuv yaratadi, ikkalasi ham jurnalda qoladi.

## 10. Qarzlar (faqat Egasi)
- Ikki ro'yxat: **Menga qarz** (nasiya savdo, berilgan qarz) va **Mendan qarz** (nasiya xarid, olingan qarz).
- Ustunlar: summa, qaytarilgan, qoldiq, izoh, sana.
- "Qaytarish" → summa (qisman ham mumkin) → kassani tanlang. To'liq qaytsa qarz yopiladi.

## 11. Hisobotlar
Hammasi **PDF** va **Excel**ga yuklab olinadi.
1. **Mahsulotlar qoldig'i** — har mahsulot blok/donada, ombor → sub-ombor bo'yicha.
2. **Savdo hisoboti** — sana oralig'i, mahsulot kesimida: soni, tushum (+ Egasi uchun tannarx va yalpi foyda).
3. **P&L** (faqat Egasi) — kun / oy / yil / ixtiyoriy oraliq:
```
Tushum
− Sotilgan tovar tannarxi
= Yalpi foyda
− Yo'l kira
− Inventarizatsiya kamomadi (+ ortiqcha)
= SOF FOYDA
```
Xarid summasi, qarzlar, "boshqa chiqim" va o'tkazmalar foydaga kirmaydi.

## 12. Foydalanuvchilar (faqat Egasi)
Menyu → **Boshqaruv → Foydalanuvchilar**. Ro'yxatda F.I.O, login, rol, til, holat (Faol/Faolsiz) va oxirgi kirish vaqti. Egasining o'z qatorida faqat **Mening akkauntim** havolasi bor.
- **Xodim qo'shish** — F.I.O, login (lotin kichik harflar, raqamlar, `. _ -`; 3–32 belgi; katta harf bilan yozilsa ham kichik harfda saqlanadi), parol (kamida 8 belgi, ikki marta), interfeys tili. Yangi akkaunt doim **Xodim** rolida — Egasi tizimda bitta.
- **Tahrirlash** (qalam) — F.I.O, login, til. Login band bo'lsa — "Bu login band" (faolsiz akkauntlarning logini ham band).
- **Parol o'rnatish** (kalit) — xodim parolni unutsa, Egasi yangisini o'rnatadi. Xodim o'z parolini o'zi o'zgartira olmaydi.
- **Faolsizlantirish** — ishdan ketgan xodim darhol tizimdan chiqariladi va kira olmaydi ("Akkaunt faolsizlantirilgan"), lekin uning hujjatlari saqlanib qoladi. Akkaunt o'chirilmaydi; **Faollashtirish** bilan qaytariladi (xodim eski paroli bilan kiradi). Egasi o'zini faolsizlantira olmaydi.
- Xodimning logini yoki paroli o'zgarganda u barcha qurilmalarda tizimdan chiqariladi va qayta kirishi kerak bo'ladi.
- **Mening akkauntim** (foydalanuvchi menyusi) — Egasi o'z F.I.O sini, loginini va parolini o'zgartiradi. Login va parol uchun **joriy parol** kiritiladi; boshqa qurilmalardagi sessiyalar yopiladi, shu qurilmada tizimda qolasiz. Egasi parolini unutsa, tizimni o'rnatgan dasturchi uni serverda tiklaydi.

## 13. Audit jurnali (faqat Egasi)
Kim, qachon, nimani o'zgartirgani (eski va yangi qiymat). O'tgan sana bilan kiritilgan hujjatlar alohida belgilanadi. Jurnal o'zgartirilmaydi va o'chirilmaydi.

## 14. Tez-tez uchraydigan xabarlar

| Xabar | Sabab va yechim |
|---|---|
| "Qoldiq yetarli emas" | Sub-omborda tovar kam. Boshqa sub-ombordan soting yoki avval xarid kiriting |
| "Ombor inventarizatsiyada" | Shu omborda ochiq sanoq bor. Uni bajaring yoki bekor qiling (ombor/sub-omborni arxivlash ham shu paytda mumkin emas) |
| "…da qoldiq bor. Qoldiq nolga tushgach arxivlash mumkin" | Ombor/sub-omborda tovar bor. Avval uni soting (yoki inventarizatsiyada boshqa sub-omborga o'tkazing), keyin arxivlang |
| "Kassada mablag' yetarli emas" | Chiqim summasi kassa balansidan katta |
| "To'lov summasi hujjat summasiga teng emas" | Naqd + Karta + Nasiya ni tekshiring |
| "Avval tegishli savdoni storno qiling" | Xarid tovarining bir qismi sotilgan, xaridni bekor qilib bo'lmaydi |
| "Hujjat o'zgargan, sahifani yangilang" | Boshqa foydalanuvchi shu qoralamani tahrirlagan |
| "Kelajak sana tanlab bo'lmaydi" | Hujjat sanasi faqat bugun yoki o'tgan kun bo'lishi mumkin |
| "Blokdagi dona soni o'zgargan" | Mahsulot kartochkasi o'zgargan, qoralamani qayta saqlang |
| "Login yoki parol noto'g'ri" | Qayta urinib ko'ring. 5 ta xatodan keyin 15 daqiqa kutish kerak |
| "Akkaunt faolsizlantirilgan" | Egasi akkauntingizni faolsizlantirgan — unga murojaat qiling |
| "Joriy parol noto'g'ri" | Mening akkauntim sahifasida hozirgi parolingizni to'g'ri kiriting |
