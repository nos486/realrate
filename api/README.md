# 🛠️ مستندات فنی و راهنمای معماری بک‌اند (RealRate API)

این سند شامل توضیحات فنی جامع، معماری لایه‌ای، مدل داده، جریان‌های داده و راهنمای کامل توسعه بک‌اند سامانه **RealRate** است.

---

## ۱. نمای کلی و فناوری‌های پایه (Stack Architecture)

بک‌اند RealRate به صورت کاملاً Serverless و Edge-Native بر روی زیرساخت جهانی **Cloudflare Workers** مستقر است:

| مؤلفه | فناوری / بستر | کاربرد |
| :--- | :--- | :--- |
| **Edge Runtime** | Cloudflare Workers (V8 Isolate) | اجرای سرورلس Native REST API با تأخیر زیر ۱۰ میلی‌ثانیه |
| **پایگاه‌داده رابطه‌ای** | Cloudflare D1 (SQLite) | نگهداری کاربران، نشست‌ها، تنظیمات و پورتفولیوها |
| **حافظه سریع توزیع‌شده** | Cloudflare KV | دفتر قیمت (`prices`: آخرین قیمت همه اقلام) و خروجی هر سورس (`source_items:{sourceId}`) |
| **زمان‌بندی خودکار** | Cloudflare Cron Triggers | پولینگ منظم تک‌تیک بدون درخواست تکراری با `sourceSync.service.js` |
| **تست خودکار** | Vitest | آزمون‌های واحد فوق‌سریع برای فرمول‌های مالی، قرارداد ادپتورها و موتور نمایش |

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
│       ├── adaptersContract.test.js   # تست تطابق قرارداد خروجی تمامی ادپتورها ({items, datetime})
│       ├── displayEngine.test.js      # تست جامع موتور مرکزی نمایش برای تمام ۸ دسته‌بندی
│       ├── sourceItems.test.js        # تست ذخیره‌سازی یکدست در KV و D1
│       ├── sourceSync.test.js         # تست ارکستراسیون تک‌تیک و حذف درخواست‌های تکراری
│       ├── sourcesValidation.test.js  # اعتبارسنجی یکپارچگی کانفیگ سورس‌ها
│       ├── formulas.test.js           # تست فرمول‌های طلا، انس، عیار و حباب
│       ├── unifiedItemsRoute.test.js  # تست روت کاتالوگ جامع بازار
│       └── bourseMerge.test.js        # تست پایداری و ادغام تجمعی نمادهای بورس
└── src/
    ├── index.js                       # ورودی اصلی Worker، میدلورهای لاگ/خطا و روتینگ
    ├── config/                        # مراجع واحد پیکربندی (Single Sources of Truth)
    │   ├── sources.config.js          # کانفیگ مرکزی تمامی سورس‌های قیمت
    │   ├── categories.config.js       # تعریف دسته‌بندی‌ها، بج‌ها، رنگ‌ها و آیکون‌ها
    │   └── sourceRegistry.js          # رجیستری و متدهای کمکی جستجو و نگاشت
    ├── domain/                        # لایه هسته تجاری (Domain Core)
    │   ├── displayEngine.js           # موتور مرکزی نمایش (نام، واحد، دسته‌بندی، بج، رنگ، آیکون)
    │   ├── formulas.js                # فرمول‌های خالص ریاضی طلا، ارزش ذاتی و حباب
    │   └── specs/                     # رجیستری مشخصات فیزیکی طلا، سکه، نقره، فارکس و کریپتو
    ├── repositories/                  # لایه دسترسی به داده (Repository Layer)
    │   ├── sourceItems.repository.js  # مسیر واحد ذخیره‌سازی اقلام منابع در KV و D1
    │   ├── userRepository.js          # کوئری‌های کاربران، نقش‌ها و تنظیمات حساب
    │   ├── portfolioRepository.js     # مدیریت پورتفوها، اسلاگ‌های اشتراک و سالت‌های E2EE
    │   ├── holdingRepository.js       # افزودن، ویرایش، حذف و واکشی اقلام دارایی پورتفو
    │   ├── transactionRepository.js   # ذخیره، ویرایش و حذف تراکنش‌های خرید/فروش (E2EE)
    │   ├── priceSource.repository.js  # مدیریت رکوردهای سورس‌های قیمت در دیتابیس
    │   ├── migration.repository.js    # مایگریشن و سید پویا از روی sources.config.js
    │   └── auditRepository.js         # لاگ‌های امنیتی و حسابرسی سیستم
    ├── services/                      # سرویس‌های دامنه و اپلیکیشن
    │   └── market/
    │       ├── sourceSync.service.js  # ارکستریتور تک‌تیک پولینگ و همگام‌سازی منابع
    │       ├── priceAggregator.service.js # تجمیع و محاسبه نرخ‌های بازار
    │       └── sources/               # ادپتورهای منابع داده خارجی (ISourceAdapter)
    │           ├── ISourceAdapter.js  # قرارداد اینترفیس نهایی ادپتورها
    │           ├── index.js           # رجیستری و لیست ارزیابی ادپتورها
    │           ├── telegramSource.adapter.js # استخراج و پارس کانال‌های تلگرام
    │           ├── forexApi.source.adapter.js# دریافت برابری ارزهای جهانی از Open ER-API
    │           ├── bourseSymbols.source.adapter.js # دریافت و ادغام تجمعی نمادهای بورس تهران
    │           ├── emofidFunds.source.adapter.js  # صندوق‌های سرمایه‌گذاری کارگزاری مفید
    │           ├── charismaFunds.source.adapter.js# صندوق‌های سرمایه‌گذاری کاریزما
    │           ├── charismaPlans.source.adapter.js# طرح‌های سرمایه‌گذاری طلای کاریزما
    │           └── apiUrl.source.adapter.js       # وب‌سرویس‌های عمومی JSON و پارسرهای سفارشی
    ├── handlers/                      # کنترلرهای ورودی HTTP (Route Handlers)
    │   ├── unifiedItemsRoute.js       # کاتالوگ جامع /api/v1/market/items با displayEngine
    │   ├── apiRoutes.js               # اندپوینت‌های عمومی دریافت نرخ‌ها
    │   ├── authRoutes.js              # سشن و لاگین گوگل
    │   ├── portfolioRoutes.js         # مدیریت پورتفو و دارایی‌های کاربر
    │   ├── transactionRoutes.js       # مدیریت تراکنش‌های خرید/فروش با پی‌لود Zero-Knowledge
    │   └── adminRoutes.js             # پنل مدیریت، فیدها و آمار کاربران
    ├── jobs/                          # جاب‌های زمان‌بندی‌شده
    │   └── cronPolling.job.js         # اجرای تک‌تیک syncAllSources در هر دقیقه
    └── lib/                           # کتابخانه‌های کمکی و لاگر
```

---

## ۳. لایه‌های معماری (Architectural Layers)

### ۱. قرارداد یکپارچه ادپتورها (`ISourceAdapter`)
تمامی تأمین‌کنندگان نرخ قرارداد استاندارد `ISourceAdapter` را بدون استثنا پیاده‌سازی می‌کنند:
- خروجی متد `parse()` همواره دارای ساختار قطعی زیر است:
  ```javascript
  {
    items: [{ id: string, name: string, price: number }],
    datetime: string // ISO 8601
  }
  ```
- شناسه اقلام همواره با ساختار کانونیکال `\${sourceId}__\${itemKey}` ساخته می‌شود.
- سورس‌های تک‌مقداری (مانند دلار یا طلا) نیز آرایه‌ای تک‌عضوی بازمی‌گردانند.
- کلیه متدهای قدیمی دسترسی داده با متد واحد `getItems(env)` جایگزین شده‌اند.

### ۲. موتور مرکزی نمایش (`displayEngine.js`)
پل مشترک میان سرور و کلاینت:
- فرمت یکنواخت نام اقلام: `"{item.name} ({sourceName})"`.
- استخراج داده‌محور واحد، دسته‌بندی و بج از کانفیگ بدون هیچ شرط رشته‌ای هاردکد شده.
- نگاشت خودکار رنگ‌ها و آیکون‌های Lucide بر اساس `categories.config.js`.

### ۳. لایه ذخیره‌سازی یکدست (`sourceItems.repository.js`)
- مسیرهای موازی و دوگانه قبلی بازنشسته شدند.
- خروجی هر سورس فقط با یک کلید `source_items:{sourceId}` در Cloudflare KV ذخیره می‌شود و فقط وقتی تغییر کرده باشد دوباره نوشته می‌شود.
- آخرین قیمت همه اقلام یک JSON واحد در کلید `prices` است (دفتر قیمت)؛ همه مسیرها و صفحه‌ها فقط از همین می‌خوانند.

### ۴. ارکستراسیون تک‌تیک بدون درخواست تکراری (`sourceSync.service.js`)
- در هر بار اجرای جاب کرون، متد `syncAllSources(env)` فراخوانی می‌شود.
- در صورتی که چند سورس دارای اندپوینت مشترک باشند، درخواست شبکه فقط یک‌بار ارسال شده و نتیجه بین سورس‌ها به اشتراک گذاشته می‌شود.

---

## ۴. اجرای تست‌ها و استقرار (Testing & Deployment)

### اجرای آزمون‌های واحد خودکار با Vitest:
```bash
npm test
```
تمامی **۱۷ فایل آزمون** و **۱۴۶ تست** شامل تست قرارداد ادپتورها، موتور نمایش، ذخیره‌سازی، فرمول‌ها و همگام‌سازی را ارزیابی می‌کند.

### بیلد و تست کلاینت فرانت‌اند:
```bash
npm run build --workspace=web
```

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
