# ساختار پروژه

مخزن یک **npm workspaces monorepo** با دو بخش است: `api/` (Cloudflare Worker) و `web/` (React 19 + Vite، که اپ اندروید هم از آن ساخته می‌شود).
فایل‌های پیکربندی و منطق مشترک فقط در `api/` نوشته می‌شوند و `web/` از طریق **symlink** همان فایل‌ها را استفاده می‌کند.

```text
realrate/
├── package.json                  # اسکریپت‌های مشترک (dev، test، deploy)
├── README.md / README.en.md      # معرفی (فارسی / انگلیسی)
├── CHANGELOG.md                  # یادداشت‌های تغییرات نسخه‌ها جهت درج در Release
├── .github/workflows/android.yml # ساخت و انتشار APK امضاشده اندروید (main → Releases)
│
├── api/                          # بک‌اند: Cloudflare Worker (D1 و KV)
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
│       ├── repositories/         # دسترسی به داده D1 و KV (الگوی Repository)؛ جدول‌ها در d1Schema.js
│       ├── services/             # market/ (ادپتورهای سورس و همگام‌سازی قیمت)، ai/ (Gemini)
│       ├── jobs/                 # جاب کرون (همگام‌سازی قیمت‌ها)
│       ├── lib/                  # احراز هویت، گیت‌های رمزنگاری/دمو/تعمیر، ایمیل، CORS، لاگ
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
        │                         #   incomes، cheques، subscriptions، reports، news، alerts، sms-inbox،
        │                         #   app-settings، auth، demo، admin
        ├── shared/
        │   ├── ui/               # کامپوننت‌های پایه (Modal، Button، DonutChart، Skeleton، RowCard، BlockingOverlay، ...)
        │   ├── form/             # قطعه‌های فرم ثبت (AmountField، CategoryGrid، PickerRow، DateField، MoreDetails)
        │   ├── refresh/          # تازه‌سازی تب: scopeها، دکمه‌ی تازه‌سازی، TabLoadingGate
        │   ├── currency/         # useDayRate و DayRateHint: نرخ ارز در روز فرم (نمایش، بدون ذخیره)
        │   ├── links/            # CategoryLinkField: رکوردی که درآمد یا هزینه با دسته‌اش به آن وصل است
        │   ├── categories/       # دسته‌های هزینه و درآمد کاربر
        │   ├── api/              # httpClient (توکن، سرآیند X-RealRate-Client، خطاها)
        │   ├── app/              # قاب اپ اندروید: نوار پایین، ثبت سریع، «بیشتر»
        │   ├── native/           # پل‌های بومی: پیامک، اثر انگشت، لرزش، تشخیص اپ
        │   ├── offline/          # نسخه‌ی رمزشده‌ی محلی (IndexedDB)، همگام‌سازی و صف آفلاین
        │   ├── vault/            # رمزنگاری سرتاسری (وضعیت، مهاجرت، ذخیره‌ی رمزشده‌ی هر نوع رکورد)،
        │   │                     #   پیوند رکوردها، ثبت خرج‌ها، recordRates.js (نرخ رکورد از تاریخچه)
        │   ├── banks/            # انتخاب‌گر و لوگوی بانک، بانک‌های سفارشی
        │   ├── features/         # Feature Flags (useFeature، <Feature>)
        │   ├── hooks/, utils/    # هوک‌ها و ابزارهای مشترک (تاریخ، CSV، ...)
        │   └── pwa/              # نصب و به‌روزرسانی PWA
        ├── seo/pages.js          # محتوای صفحه‌های ایستای SEO
        ├── lib/e2ee.js           # توابع رمزنگاری (Web Crypto)
        ├── config/               # symlink به api/src/config و موتور نمایش
        ├── utils/                # symlink به منطق مشترک api/src/domain (+ ابزارهای خود وب)
        └── styles/               # توکن‌ها و استایل‌ها (تم تیره، app-shell.css برای اپ، row-card.css برای RowCard)
```

## فایل‌های مشترک (symlink)

| فایل در `web/src` | منبع در `api/src` |
| :--- | :--- |
| `config/banks.config.js`، `categories.config.js`، `features.js`، `sourceRegistry.js`، `sources.config.js` | `config/` |
| `config/displayEngine.js` | `domain/displayEngine.js` |
| `utils/priceBook.js`، `priceBookViews.js`، `priceIds.js` | `domain/` — دفتر قیمت و شناسه‌ها |
| `utils/loanCalculator.js`، `loanDocument.js` | `domain/` — محاسبه و سند وام |
| `utils/loanFunding.js` | `domain/loanFunding.js` — مصرف وام و بازده خریدها |
| `utils/chequeDocument.js` | `domain/` — اعتبارسنجی چک (دسته، حساب و تسویه‌ی چک) |
| `utils/subscriptionDocument.js` | `domain/` — اشتراک‌ها: اعتبارسنجی، تمدیدها، جمع ماهانه |
| `utils/categoryLinks.js` | `domain/` — رکوردی که درآمد یا هزینه با دسته‌اش به آن وصل می‌شود (چک، قسط وام، اشتراک، پورتفو، اعتبار) |
| `utils/expenseDocument.js`، `accountDocument.js`، `creditAccount.js` | `domain/` — هزینه‌ها، حساب‌ها و اعتبار بانکی |
| `utils/currencies.js` | `domain/` — ارزهایی که پول با آن‌ها ثبت می‌شود (تومان، دلار، یورو، لیر، درهم) و تبدیل به تومان |
| `utils/incomeDocument.js` | `domain/` — اعتبارسنجی درآمد (به هر ارز) و ارزش آن به تومان و دلار |
| `utils/categoryDocument.js`، `transferDocument.js` | `domain/` — دسته‌های هزینه و درآمد کاربر؛ جابه‌جایی پول بین حساب‌های خود کاربر |
| `utils/dollarValue.js`، `portfolioLink.js` | `domain/` — مبلغی در روزی گذشته به دلار؛ هزینه یا درآمدی که ثبت پورتفو هم هست |
| `utils/alerts.js`، `reminders.js`، `sealedPush.js` | `domain/` — هشدارها، یادآوری سررسیدها و وب‌پوش مهرشده |
| `utils/news.js`، `riskProfile.js` | `domain/` — قواعد بخش اخبار؛ آزمون ریسک‌پذیری |
| `utils/bankSms.js`، `bankSmsTemplates.js` | `domain/` — خواندن پیامک بانک |
| `utils/clientInfo.js` | `domain/clientInfo.js` — سرآیند کلاینت (اپ/وب و نسخه) |
| `utils/userGroups.js` | `domain/userGroups.js` — گروه‌های کاربران (شناسه، اعتبارسنجی) |
| `utils/homeLayout.js`، `portfolioLayout.js` | `domain/` — چیدمان صفحه اصلی و دسته‌های پورتفو |
| `utils/cardMetrics.js`، `priceAverages.js`، `cardFormula.js` | `domain/` — آنچه کارت صفحه اصلی نشان می‌دهد (مقدارها، جایگاه‌ها، دارایی‌های مرتبط)، میانگین‌های دفتر قیمت و کارت‌های ترکیبی با فرمول |
| `utils/financialSpecs.js` | `lib/financialSpecs.js` |

برای تغییر هر کدام، فایل مبدأ در `api/` را ویرایش کنید. `utils/calculator.js` و `utils/pricingEngine.js` مال خود وب‌اند (ارزش ذاتی و حباب با نرخ زنده).
