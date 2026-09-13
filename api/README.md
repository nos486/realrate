# 🛠️ مستندات فنی و راهنمای معماری بک‌اند (RealRate API)

این سند شامل توضیحات فنی جامع، معماری سرویس‌ها، مدل داده، جریان‌های داده و راهنمای کامل توسعه بک‌اند سامانه **RealRate** است.

---

## ۱. نمای کلی و فناوری‌های پایه (Stack Architecture)

بک‌اند RealRate به صورت کاملاً Serverless و Edge-Native بر روی زیرساخت جهانی **Cloudflare Workers** مستقر است و از اجزای زیر تشکیل شده است:

| مؤلفه | فناوری / بستر | کاربرد |
| :--- | :--- | :--- |
| **Edge Runtime** | Cloudflare Workers (V8 Isolate) | اجرای سرورلس REST API با تأخیر زیر ۱۰ میلی‌ثانیه |
| **پایگاه‌داده رابطه‌ای** | Cloudflare D1 (SQLite) | نگهداری کاربران، نشست‌ها، تنظیمات، پورتفولیوها و سورس‌های قیمت |
| **حافظه سریع توزیع‌شده** | Cloudflare KV | کش فوق‌سریع آخرین نرخ‌های زنده (`latest_rates`) و نمادهای بورس |
| **زمان‌بندی خودکار** | Cloudflare Cron Triggers | پولینگ زمان‌بندی‌شده فیدهای تلگرام، وب‌سرویس‌های فارکس و بورس |

---

## ۲. درخت ساختار فایل‌های پروژه (`api/`)

```text
api/
├── schema.sql                     # اسکیمای کامل دیتابیس Cloudflare D1
├── wrangler.toml                  # پیکربندی بایندینگ‌های Workers، D1 و KV
├── package.json                   # تنظیمات ماژول و دستورات اجرا
└── src/
    ├── index.js                   # ورودی اصلی ورکر، مسیریابی و کنترلر Cron Trigger
    ├── handlers/                  # کنترلرهای ورودی (Route Handlers)
    │   ├── adminRoutes.js         # مدیریت سورس‌های قیمت، تنظیمات و کاربران ادمین
    │   ├── apiRoutes.js           # روت عمومی /api/prices برای دریافت نرخ‌های بازار
    │   ├── authRoutes.js          # احراز هویت با گوگل (GIS) و مدیریت نشست‌ها
    │   ├── portfolioRoutes.js     # ساخت، ویرایش و مدیریت دارایی‌های پورتفولیو
    │   └── unifiedItemsRoute.js   # روت مرجع /api/market/items (Single Source of Truth)
    ├── lib/                       # کتابخانه‌ها و توابع زیرساختی
    │   ├── db.js                  # لایه اتصال و کوئری‌های SQL پایگاه‌داده D1
    │   ├── financialSpecs.js      # سورس مرجع واحد تمام مشخصات، دارایی‌ها و فرمول‌ها
    │   ├── helpers.js             # پاسخ‌های استاندارد JSON و خطایابی CORS
    │   └── settings.js            # مدیریت تنظیمات سراسری سیستم (نرخ‌های پیش‌فرض)
    └── services/                  # سرویس‌های جمع‌آوری و تحلیل نرخ‌ها
        ├── bourseSymbols.js       # دریافت تجمعی، ادغام و کش نمادهای بورس (TSETMC)
        ├── forexRates.js          # دریافت نرخ برابری ارزهای جهانی از Open ER-API
        ├── priceSources.js        # هسته مرکزی تجمیع قیمت‌ها، پولینگ و پکیج نرخ‌ها
        └── telegramPrices.js      # استخراج و پارس قیمت‌های تلگرامی (سبزه میدان و زرما)
```

---

## ۳. هسته محاسباتی مرجع واحد (`financialSpecs.js`)

فایل [financialSpecs.js](file:///Users/sina/Projects/realrate/api/src/lib/financialSpecs.js) به عنوان **Single Source of Truth** کل پروژه (هم در API و هم در Web از طریق Symlink) عمل می‌کند.

### وظایف و محتویات:
1. **مشخصات فیزیکی طلا و سکه**:
   - `GOLD_SPECS`: مشخصات طلای ۱۸ عیار، طلای ۲۴ عیار، آبشده، مثقال و انس جهانی ($XAU$).
   - `COIN_SPECS`: سکه تمام طرح جدید (امامی)، بهار آزادی (طرح قدیم)، نیم‌سکه، ربع‌سکه و سکه گرمی (شامل عیار، وزن به گرم و حباب استاندارد).
   - `SILVER_SPECS`: نقره خام، نقره ۹۲۵ و انس جهانی نقره ($XAG$).
2. **متادیتای کامل ارزهای جهانی (`FOREX_SPECS`)**:
   - شامل بیش از ۶۵ ارز بین‌المللی همراه با کد ایزو، نام فارسی، نماد، پرچم و نرخ برابری پیش‌فرض.
3. **فرمول‌های ریاضی استاندارد**:
   - `calculateGold24kGram(gold18kPrice)`: تبدیل نرخ طلای ۱۸ به ۲۴ عیار:
     $$\text{Gold}_{24k} = \text{Gold}_{18k} \times \frac{750}{999.9}$$
   - `calculateIntrinsicValue(goldUsd, usdPrice, weightGram, fineness)`: محاسبه ارزش ذاتی طلا و سکه:
     $$\text{Intrinsic} = \left(\frac{\text{Gold}_{\$}}{31.1034768}\right) \times \text{USD}_{\text{Toman}} \times \text{Weight}_{\text{g}} \times \left(\frac{\text{Fineness}}{1000}\right)$$
   - `calculateForexTomanPrice(usdPrice, crossRate)`: محاسبه قیمت تومانی ارزها:
     $$\text{Price}_{\text{Toman}} = \text{USD}_{\text{Toman}} \times \text{CrossRate}$$
   - `calculateBubble(marketPrice, intrinsicValue)`: محاسبه حباب اسمی و درصدی.

---

## ۴. لایه پایگاه‌داده و ذخیره‌سازی (`D1` و `KV`)

### پایگاه‌داده Cloudflare D1 (SQLite)
جداول اصلی در [schema.sql](file:///Users/sina/Projects/realrate/api/schema.sql) تعریف شده‌اند:
1. **`users`**: ذخیره اطلاعات حساب کاربران (ایمیل، نام، تصویر پروفایل، نقش `admin`/`user`).
2. **`sessions`**: توکن‌های نشست احراز هویت با طول عمر ۳۰ روز.
3. **`settings`**: تنظیمات تک‌ردیفی سراسری سیستم (نرخ‌های پیش‌فرض دلار و انس برای زمان اختلال فیدها، درصدهای حباب مصوب).
4. **`portfolios`**: نگهداری پورتفوهای چندگانه کاربر، تنظیمات اشتراک‌گذاری عمومی (`share_slug`).
5. **`portfolio_holdings`**: سطرهای دارایی‌های کاربر با فیلدهای مقدار (`amount`)، قیمت خرید (`buy_price`)، تاریخ خرید و یادداشت.
6. **`price_sources`**: ثبت مشخصات فیدها (آدرس اندپوینت، نوع سورس تلگرامی یا API، فیلد مپینگ، آخرین قیمت `last_price` و داده‌های چندگانه `last_multi_data`).
7. **`source_types`**: رجیستری دسته‌بندی سورس‌های سیستم.

> **نکته بهینه‌سازی:** جدول بلااستفاده `price_history` به طور کامل حذف شد تا از ثبت کوئری‌های تکراری و پرهزینه در D1 جلوگیری شود.

### حافظه توزیع‌شده Cloudflare KV
برای دسترسی فوق‌العاده سریع (زیر ۵ میلی‌ثانیه):
- **`latest_rates`**: پکیج یکپارچه آخرین قیمت‌های بازار (دلار، طلا، سکه، ارزها و کریپتو).
- **`bourse_symbols_toman_v3`**: کش دائمی و ادغام‌شده کل نمادهای بورس و صندوق‌ها (بدون TTL انقضا جهت جلوگیری از پاک شدن اطلاعات در تعطیلات بازار).
- **`source_price:{source_id}`**: کش سریع قیمت هر سورس به صورت اختصاصی.

---

## ۵. سرویس‌های داده (Services Deep-Dive)

### ۱. بورس اوراق بهادار تهران ([bourseSymbols.js](file:///Users/sina/Projects/realrate/api/src/services/bourseSymbols.js))
- **ادغام تجمعی پایدار (`mergeBourseSymbols`)**:
  - از وب‌سرویس BRS API (`AllSymbols.php`) دیتای نمادها را دریافت می‌کند.
  - **حفظ ۱۰۰٪ نمادهای غایب**: اگر نمادی به مدت ۱۰ روز یا بیشتر در پاسخ API نباشد (به دلیل توقف نماد یا تعلیق)، هرگز حذف نمی‌شود و آخرین قیمت معتبر و برچسب زمانی آن محفوظ می‌ماند.
  - **عدم بازنویسی با قیمت صفر**: در صورت ارسال قیمت صفر توسط API، قیمت معتبر پیشین حفظ می‌شود.
  - **تشخیص خودکار صندوق‌ها**: با بررسی نام و تگ‌ها، صندوق‌های سرمایه‌گذاری (`isFund`) علامت‌گذاری می‌شوند.

### ۲. تجمیع سورس‌ها ([priceSources.js](file:///Users/sina/Projects/realrate/api/src/services/priceSources.js))
- اجرای چرخه پولینگ فیدها طبق فاصله زمانی تعیین‌شده (`fetch_interval_sec`).
- پشتیبانی از سورس‌های تلگرام (وب اسکرپینگ کانال‌های عمومی) و وب‌سرویس‌های JSON.
- **سورس تجمیعی فارکس (`src_def_forex`)**: دریافت نرخ تمام ارزها از `open.er-api.com` در یک ریکوئست، ذخیره در `last_multi_data` و استخراج تک‌تک ارزها در `compileLatestMarketRates`.

### ۳. کانال‌های تلگرامی ([telegramPrices.js](file:///Users/sina/Projects/realrate/api/src/services/telegramPrices.js))
- تبدیل و نرمال‌سازی اعداد فارسی و عربی به ارقام استاندارد (`normalizeDigits`).
- استفاده از رجکس‌های پیشرفته برای استخراج قیمت‌های دلار سبزه میدان، طلای ۱۸ عیار و انواع سکه از کانال‌های خبری معتبر تلگرام بدون نیاز به ربات.

---

## ۶. روت‌های اصلی API (Endpoints Reference)

### روت‌های عمومی:
- `GET /api/market/items`: کاتالوگ مرجع واحد شامل تمام اقلام طلا، سکه، نقره، ارزهای جهان و نمادهای بورس به همراه قیمت‌های زنده و پارامترهای حباب.
- `GET /api/prices`: آبجکت فشرده آخرین نرخ‌های بازار جهت استفاده در محاسبات سریع.
- `GET /api/portfolio/shared?slug=...`: دریافت اطلاعات پورتفوی اشتراک‌گذاری‌شده به صورت عمومی (فقط خواندنی).

### روت‌های پورتفولیو (نیاز به احراز هویت):
- `GET /api/portfolios`: لیست پورتفوهای کاربر.
- `POST /api/portfolios`: ایجاد پورتفوی جدید.
- `PUT /api/portfolios`: ویرایش مشخصات یا فعال‌سازی اشتراک‌گذاری.
- `DELETE /api/portfolios`: حذف پورتفو و دارایی‌های آن.
- `GET /api/portfolio/holdings?portfolioId=...`: دریافت لیست اقلام دارایی پورتفوی جاری.
- `POST /api/portfolio/holdings`: ثبت دارایی جدید (خرید طلا، سکه، ارز، سهم یا کریپتو).
- `PUT /api/portfolio/holdings`: ویرایش دارایی ثبت‌شده.
- `DELETE /api/portfolio/holdings`: حذف دارایی.

### روت‌های ادمین:
- `GET /api/admin/price-sources`: لیست سورس‌های تعریف‌شده.
- `POST /api/admin/price-sources`: افزودن یا ویرایش سورس قیمت.
- `DELETE /api/admin/price-sources`: حذف یک سورس.
- `POST /api/admin/price-sources/test`: تست زنده خواندن قیمت از یک فید بدون ذخیره.
- `POST /api/admin/price-sources/fetch-all`: اجبار به اجرای فوری پولینگ تمام سورس‌ها.

---

## ۷. چرخه تست و استقرار (Build & Deploy)

### اجرای لوکال با Wrangler:
```bash
cd api
npm install
npx wrangler dev
```

### اجرای تست‌های خودکار:
```bash
# تست منطق مرجع واحد و فرمول‌ها
node ../.gemini/antigravity-ide/brain/7f8d2e6f-2582-48c0-8af9-465e854da484/scratch/test_single_source_of_truth.js

# تست سیستم ادغام تجمعی نمادهای بورس
node ../.gemini/antigravity-ide/brain/7f8d2e6f-2582-48c0-8af9-465e854da484/scratch/test_bourse_incremental_merge.js
```

### استقرار نهایی در شبکه ابری Cloudflare:
```bash
npx wrangler deploy
```
