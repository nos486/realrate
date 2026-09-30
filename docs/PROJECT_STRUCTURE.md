# ساختار پروژه

مخزن یک **npm workspaces monorepo** با دو بخش است: `api/` (Cloudflare Worker) و `web/` (React 19 + Vite، که اپ اندروید هم از آن ساخته می‌شود).
فایل‌های پیکربندی و منطق مشترک فقط در `api/` نوشته می‌شوند و `web/` از طریق **symlink** همان فایل‌ها را استفاده می‌کند.

```text
realrate/
├── package.json                  # اسکریپت‌های مشترک (dev، test، deploy)
├── README.md / README.en.md      # معرفی (فارسی / انگلیسی)
├── docs/                         # مستندات فارسی؛ docs/en انگلیسی؛ docs/screenshots تصاویر
├── .github/workflows/android.yml # ساخت APK دیباگ (PR) و انتشار APK امضاشده (main → Releases)
│
├── api/                          # بک‌اند: Cloudflare Worker (Postgres از طریق Hyperdrive + KV)
│   ├── wrangler.toml             # بایندینگ‌ها، متغیرها و Cron
│   ├── tests/
│   │   ├── helpers/              # ابزار تست (دیتابیس شبیه‌سازی‌شده و ...)
│   │   └── unit/                 # آزمون‌های Vitest
│   └── src/
│       ├── index.js              # روتینگ و ورودی Worker (fetch + scheduled)
│       ├── config/               # مراجع واحد: سورس‌ها، دسته‌بندی‌ها، بانک‌ها، ویژگی‌ها، محدودیت استفاده، هوش مصنوعی
│       ├── domain/               # منطق خالص و مشترک با وب: دفتر قیمت، فرمول‌ها، موتور نمایش، وام،
│       │                         #   چک، هزینه، حساب، پیامک بانک، مصرف وام، اطلاعات کلاینت، ...
│       ├── handlers/             # کنترلرهای HTTP (بازار، احراز هویت، پورتفو، تراکنش، وام، درآمد،
│       │                         #   چک، اسکن چک، بانک، گاوصندوق، دمو، ادمین)
│       ├── repositories/         # دسترسی به داده Postgres/KV (الگوی Repository)؛ جدول‌ها در pgSchema.js
│       ├── services/             # market/ (ادپتورهای سورس و همگام‌سازی قیمت)، ai/ (Gemini)
│       ├── jobs/                 # جاب کرون (همگام‌سازی قیمت‌ها)
│       ├── lib/                  # احراز هویت، گیت‌های رمزنگاری/دمو/تعمیر، ایمیل، CORS، لاگ، Postgres
│       └── middlewares/          # مدیریت خطا
│
└── web/                          # فرانت‌اند: React SPA (سایت + PWA + اپ اندروید)
    ├── capacitor.config.json     # شناسه و تنظیمات اپ اندروید (ir.realrate.app)
    ├── android/                  # پروژه‌ی اندروید (Gradle) و افزونه‌های بومی Java (پیامک، اثر انگشت)
    ├── scripts/build-seo.mjs     # ساخت صفحه‌های ایستای SEO (/android، صفحه‌های ویژگی‌ها، sitemap)
    ├── tests/seo/                # آزمون‌های صفحه‌های SEO (node --test)
    └── src/
        ├── App.jsx, main.jsx     # روت‌ها و مونت برنامه
        ├── pages/                # MainPage (همه بخش‌های برنامه)، لندینگ، پورتفوی عمومی، ادمین، تعمیر
        ├── components/           # هدر، فوتر، منوی موبایل، جستجوی دارایی، تنظیمات حساب
        ├── features/             # ماژول‌های قابلیت‌محور:
        │                         #   home، market، portfolio، transactions، expenses، accounts، loans،
        │                         #   incomes، cheques، sms-inbox، app-settings، auth، demo، admin
        ├── shared/
        │   ├── ui/               # کامپوننت‌های پایه (Modal، Button، DonutChart، Skeleton، ...)
        │   ├── api/              # httpClient (توکن، سرآیند X-RealRate-Client، خطاها)
        │   ├── app/              # قاب اپ اندروید: نوار پایین، ثبت سریع، «بیشتر»
        │   ├── native/           # پل‌های بومی: پیامک، اثر انگشت، لرزش، تشخیص اپ
        │   ├── offline/          # نسخه‌ی رمزشده‌ی محلی (IndexedDB)، همگام‌سازی و صف آفلاین
        │   ├── vault/            # رمزنگاری سرتاسری (وضعیت، مهاجرت، ذخیره‌ی رمزشده‌ی هر نوع رکورد)
        │   ├── banks/            # انتخاب‌گر و لوگوی بانک، بانک‌های سفارشی
        │   ├── features/         # Feature Flags (useFeature، <Feature>)
        │   ├── hooks/, utils/    # هوک‌ها و ابزارهای مشترک (تاریخ، CSV، ...)
        │   └── pwa/              # نصب و به‌روزرسانی PWA
        ├── seo/pages.js          # محتوای صفحه‌های ایستای SEO
        ├── lib/e2ee.js           # توابع رمزنگاری (Web Crypto)
        ├── config/               # symlink به api/src/config و موتور نمایش
        ├── utils/                # symlink به منطق مشترک api/src/domain (+ ابزارهای خود وب)
        └── styles/               # توکن‌ها و استایل‌ها (تم تیره، app-shell.css برای اپ)
```

## فایل‌های مشترک (symlink)

| فایل در `web/src` | منبع در `api/src` |
| :--- | :--- |
| `config/banks.config.js`، `categories.config.js`، `features.js`، `sourceRegistry.js`، `sources.config.js` | `config/` |
| `config/displayEngine.js` | `domain/displayEngine.js` |
| `utils/priceBook.js`، `priceBookViews.js`، `priceIds.js` | `domain/` — دفتر قیمت و شناسه‌ها |
| `utils/loanCalculator.js`، `loanDocument.js` | `domain/` — محاسبه و سند وام |
| `utils/loanFunding.js` | `domain/loanFunding.js` — مصرف وام و بازده خریدها |
| `utils/chequeDocument.js`، `chequeScan.js` | `domain/` — اعتبارسنجی و اسکن چک |
| `utils/expenseDocument.js`، `accountDocument.js` | `domain/` — هزینه‌ها و حساب‌ها |
| `utils/bankSms.js`، `bankSmsTemplates.js` | `domain/` — خواندن پیامک بانک |
| `utils/clientInfo.js` | `domain/clientInfo.js` — سرآیند کلاینت (اپ/وب و نسخه) |
| `utils/homeLayout.js`، `portfolioLayout.js` | `domain/` — چیدمان صفحه اصلی و دسته‌های پورتفو |
| `utils/recurringIncome.js` | `domain/recurringIncome.js` |
| `utils/financialSpecs.js` | `lib/financialSpecs.js` |

برای تغییر هر کدام، فایل مبدأ در `api/` را ویرایش کنید. `utils/calculator.js` و `utils/pricingEngine.js` مال خود وب‌اند (ماشین‌حساب «نرخ مبنا»).
