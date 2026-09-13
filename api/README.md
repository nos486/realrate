# 🛠️ مستندات فنی و راهنمای معماری بک‌اند (RealRate API)

این سند شامل توضیحات فنی جامع، معماری لایه‌ای، مدل داده، جریان‌های داده و راهنمای کامل توسعه بک‌اند سامانه **RealRate** است.

---

## ۱. نمای کلی و فناوری‌های پایه (Stack Architecture)

بک‌اند RealRate به صورت کاملاً Serverless و Edge-Native بر روی زیرساخت جهانی **Cloudflare Workers** مستقر است:

| مؤلفه | فناوری / بستر | کاربرد |
| :--- | :--- | :--- |
| **Edge Runtime** | Cloudflare Workers (V8 Isolate) | اجرای سرورلس Native REST API با تأخیر زیر ۱۰ میلی‌ثانیه |
| **پایگاه‌داده رابطه‌ای** | Cloudflare D1 (SQLite) | نگهداری کاربران، نشست‌ها، تنظیمات، پورتفولیوها و اقلام دارایی |
| **حافظه سریع توزیع‌شده** | Cloudflare KV | کش فوق‌سریع آخرین نرخ‌های زنده (`latest_rates`) و نمادهای بورس |
| **زمان‌بندی خودکار** | Cloudflare Cron Triggers | پولینگ زمان‌بندی‌شده فیدهای تلگرام، وب‌سرویس‌های فارکس و بورس |
| **تست خودکار** | Vitest | آزمون‌های واحد سریع برای فرمول‌های مالی و منطق ادغام داده‌ها |

---

## ۲. درخت ساختار فایل‌های پروژه (`api/`)

پروژه بر اساس الگوهای Clean Architecture و Separation of Concerns به لایه‌های مجزا تفکیک شده است:

```text
api/
├── schema.sql                         # اسکیمای کامل دیتابیس Cloudflare D1
├── wrangler.toml                      # پیکربندی بایندینگ‌های Workers، D1، KV و متغیرها
├── package.json                       # اسکریپت‌های اجرایی و وابستگی‌ها
├── vitest.config.js                   # کانفیگ تست‌های واحد Vitest
├── tests/                             # آزمون‌های خودکار
│   └── unit/
│       ├── formulas.test.js           # تست فرمول‌های طلا، انس، عیار و حباب
│       └── bourseMerge.test.js        # تست پایداری و ادغام تجمعی نمادهای بورس
└── src/
    ├── index.js                       # ورودی اصلی Worker، میدلورهای لاگ/خطا و روتینگ
    ├── infrastructure/                # زیرساخت مشترک
    │   ├── errors.js                  # خطاهای سفارشی استاندارد (AppError, ValidationError...)
    │   ├── logger.js                  # لاگر ساختاریافته JSON با سطوح DEBUG/INFO/WARN/ERROR
    │   └── config.js                  # اعتبارسنجی و دسترسی تایپ‌سیف به متغیرهای محیطی
    ├── domain/                        # لایه هسته تجاری (Domain Core)
    │   ├── specs/registry.js          # رجیستری کانونی مشخصات فیزیکی طلا، سکه و ارزها
    │   └── formulas/financialFormulas.js # فرمول‌های خالص ریاضی طلا، ارزش ذاتی و حباب
    ├── repositories/                  # لایه انتزاع داده (Data Access Layer)
    │   ├── userRepository.js          # کوئری‌های کاربران، نقش‌ها و تنظیمات حساب
    │   ├── portfolioRepository.js     # مدیریت پورتفوها، اسلاگ‌های اشتراک و E2EE
    │   ├── holdingRepository.js       # افزودن، ویرایش، حذف و واکشی اقلام دارایی
    │   ├── priceRepository.js         # کش و ذخیره‌سازی آخرین نرخ‌های بازار در D1/KV
    │   └── auditRepository.js         # لاگ‌های امنیتی و حسابرسی سیستم
    ├── adapters/                      # الگوی Adapter برای منابع داده بالادستی
    │   ├── base.js                    # اینترفیس استاندارد ISourceAdapter
    │   ├── index.js                   # رجیستری مرکزی آداپتورها
    │   ├── telegram/telegramAdapter.js# استخراج و پارس کانال‌های خبری تلگرام
    │   ├── forex/forexAdapter.js      # دریافت نرخ برابری ارزهای فیات از open.er-api
    │   └── bourse/bourseAdapter.js    # دریافت و ادغام تجمعی نمادهای بورس تهران
    ├── services/                      # سرویس‌های کاربردی (Application Services)
    │   └── priceIngestionService.js   # ارکستریتور پولینگ و تجمیع نرخ‌های ورودی
    ├── handlers/                      # کنترلرهای ورودی HTTP (Route Handlers)
    │   ├── apiRoutes.js               # اندپوینت‌های عمومی دریافت نرخ‌ها
    │   ├── unifiedItemsRoute.js       # کاتالوگ جامع /api/market/items
    │   ├── authRoutes.js              # سشن و لاگین گوگل
    │   ├── portfolioRoutes.js         # مدیریت پورتفو و دارایی‌های کاربر
    │   └── adminRoutes.js             # پنل مدیریت، فیدها و آمار کاربران
    └── lib/                           # کتابخانه‌های کمکی و پل سازگاری
```

---

## ۳. لایه‌های معماری (Architectural Layers)

### ۱. زیرساخت خطا و لاگ (`infrastructure/`)
- **مدیریت خطای متمرکز**: تمام خطاهای برنامه از `AppError` مشتق شده و دارای `statusCode` و کد خطای معین هستند. میدلور سراسری `errorHandler` تمام پاسخ‌های خطای سرور را با فرمت یکنواخت `{ success: false, error: { message, code } }` ارسال می‌کند.
- **لاگر ساختاریافته**: کلیه لاگ‌ها در قالب JSON با متادیتای شناسه درخواست، مسیر، مدت‌زمان پردازش و سطح اهمیت چاپ می‌شوند.

### ۲. لایه Repository (`repositories/`)
کوئری‌های مستقیم SQL (`env.DB.prepare`) و کدهای خواندن/نوشتن KV به طور کامل از هندلرها جدا شده و درون مخازن مربوطه قرار گرفته‌اند:
- ایزوله‌سازی کامل پایگاه داده از منطق تجاری.
- جلوگیری از خطاهای اسکریپت‌نویسی SQL یا دسترسی مستقیم نامعتبر.

### ۳. الگوی Adapter برای منابع نرخ (`adapters/`)
تمام تأمین‌کنندگان قیمت قرارداد `ISourceAdapter` را پیاده‌سازی می‌کنند:
- متد `fetchPrices(env, options)` برای دریافت و نرمال‌سازی داده‌ها.
- متد `healthCheck(env)` برای اطمینان از سلامت منبع.
- امکان افزودن هر سورس جدید (مانند صرافی‌های کریپتو یا وب‌سرویس‌های طلا) بدون دستکاری در هسته سیستم (طبق اصل Open/Closed).

### ۴. لایه دامنه و فرمول‌های مالی (`domain/`)
- **مشخصات کانونی (`specs/registry.js`)**: تعاریف بدون تغییر اوزان، عیار، دسته‌بندی و نشان‌ها برای انواع طلا، سکه‌ها و ارزها.
- **فرمول‌های ریاضی (`formulas/financialFormulas.js`)**: توابع کاملاً خالص (`Pure Functions`) بدون وابستگی جانبی:
  - محاسبه گرم طلای ۲۴ عیار:
    $$\text{Gold}_{24k} = \frac{\text{Gold}_{\$} \times \text{USD}_{\text{Toman}}}{31.1034768}$$
  - محاسبه ارزش ذاتی طلا و سکه:
    $$\text{Intrinsic} = \text{Gold}_{24k} \times \text{Weight}_{\text{g}} \times \left(\frac{\text{Karat}}{24}\right)$$
  - محاسبه درصد حباب:
    $$\text{Bubble}_{\%} = \frac{\text{MarketPrice} - \text{IntrinsicValue}}{\text{MarketPrice}} \times 100$$

---

## ۴. لایه پایگاه‌داده و ذخیره‌سازی (`D1` و `KV`)

### پایگاه‌داده Cloudflare D1 (SQLite)
جداول اصلی در [schema.sql](file:///Users/sina/Projects/realrate/api/schema.sql) تعریف شده‌اند:
1. **`users`**: حساب کاربران، نام، ایمیل، تصویر پروفایل و نقش دسترسی (`admin`/`user`).
2. **`sessions`**: نشست‌های فعال احراز هویت با طول عمر ۳۰ روز.
3. **`settings`**: تنظیمات تک‌ردیفی سراسری نرخ‌های پایه و درصدهای حباب.
4. **`portfolios`**: پورتفوهای چندگانه کاربر، لینک‌های اشتراک عمومی و سالت‌های رمزنگاری E2EE.
5. **`portfolio_holdings`**: اقلام دارایی پورتفو (مقدار، قیمت خرید، تاریخ شمسی، یادداشت و داده‌های رمزگذاری‌شده).
6. **`price_sources`**: فیدهای فعال، زمان‌بندی و نگاشت فیلدها.

### حافظه توزیع‌شده Cloudflare KV
- **`latest_rates`**: کش نرخ‌های تجمیعی بازار جهت بارگذاری لحظه‌ای.
- **`bourse_symbols_toman_v3`**: کش دائمی و ادغام‌شده کل نمادهای بورس تهران و صندوق‌ها.

---

## ۵. روت‌های اصلی API (Endpoints Reference)

### ۱. روت‌های عمومی بازار:
- `GET /api/market/items`: کاتالوگ مرجع واحد کل اقلام طلا، سکه، نقره، ارزها و بورس به همراه قیمت‌های زنده و پارامترهای حباب.
- `GET /api/prices`: آبجکت آخرین نرخ‌های استخراج‌شده بازار.
- `GET /api/portfolio/shared?slug=...`: دریافت اطلاعات پورتفوی اشتراک‌گذاری‌شده (فقط خواندنی).

### ۲. روت‌های پورتفولیو (نیاز به توکن لاگین):
- `GET /api/portfolios`: لیست تمام پورتفوهای کاربر.
- `POST /api/portfolios`: ایجاد پورتفوی جدید.
- `PUT /api/portfolios`: ویرایش مشخصات یا تنظیمات اشتراک‌گذاری.
- `DELETE /api/portfolios`: حذف پورتفو و تمام اقلام آن.
- `GET /api/portfolio/holdings?portfolioId=...`: دریافت اقلام پورتفو.
- `POST /api/portfolio/holdings`: ثبت دارایی جدید در پورتفو.
- `PUT /api/portfolio/holdings`: ویرایش دارایی ثبت‌شده.
- `DELETE /api/portfolio/holdings`: حذف دارایی از پورتفو.

### ۳. روت‌های احراز هویت:
- `GET /api/auth/me`: بررسی سشن و نقش کاربر جاری.
- `POST /api/auth/google`: ورود با توکن گوگل (Google GIS).
- `POST /api/auth/logout`: خروج و باطل‌سازی سشن.

### ۴. روت‌های ادمین:
- `GET /api/admin/stats`: آمار زنده سیستم و کاربران آنلاین.
- `GET /api/admin/users`: لیست کاربران ثبت‌شده.
- `PUT /api/admin/users/role`: تغییر نقش کاربر.
- `GET /api/admin/price-sources`: لیست و وضعیت فیدهای قیمت.
- `POST /api/admin/price-sources/fetch-all`: اجرای فوری پولینگ تمام سورس‌ها.

---

## ۶. اجرای تست‌ها و استقرار (Testing & Deployment)

### اجرای تست‌های واحد خودکار با Vitest:
```bash
# از ریشه پروژه یا پوشه api
npm test
```
این دستور کلیه فرمول‌های تبدیل طلا، سکه، حباب و رفتار ادغام تجمعی بورس را اعتبارسنجی می‌کند.

### اجرای سرور در محیط محلی (Local Development):
```bash
cd api
npx wrangler dev
```

### استقرار بر روی شبکه Cloudflare Workers:
```bash
cd api
npx wrangler deploy
```

---

## ۷. مستندات تکمیلی
- [معماری جامع سیستم](../../docs/ARCHITECTURE.md)
- [راهنمای افزودن دارایی جدید](../../docs/ADDING_NEW_ASSET.md)
- [راهنمای افزودن سورس قیمت جدید](../../docs/ADDING_NEW_PRICE_SOURCE.md)
- [مشخصات کامل اندپوینت‌ها (API Spec)](../../docs/API.md)
