# 🎨 مستندات فنی و راهنمای معماری فرانت‌اند (RealRate Web)

این سند شامل راهنمای جامع فنی، معماری کامپوننت‌ها، مدیریت وضعیت (State Management)، سیستم فرمول‌ها و محاسبات کلاینت، و استانداردهای طراحی فرانت‌اند سامانه **RealRate** است.

---

## ۱. نمای کلی و استک فناوری (Frontend Tech Stack)

فرانت‌اند RealRate به عنوان یک Single Page Application (SPA) فوق‌سریع و مدرن با تمرکز بر طراحی پرمیوم مالی (Fintech Dark Glassmorphism) پیاده‌سازی شده است:

| مؤلفه | فناوری / کتابخانه | هدف و مزایا |
| :--- | :--- | :--- |
| **فریم‌ورک پایه** | React 19 | مدیریت کامپوننت‌ها، رندرینگ بهینه، هوک‌های پیشرفته |
| **ابزار بیلد و توسعه** | Vite 8 | بیلد آنی با ESM، راه‌اندازی فوق‌سریع محیط توسعه و باندلینگ فشرده |
| **استایل‌دهی** | Vanilla CSS + CSS Variables | انعطاف‌پذیری ۱۰۰٪، عملکرد بدون سربار فریم‌ورک‌های سنگین، تم‌پذیری مدرن |
| **سیستم تاریخ شمسی** | `jalaali-js` | تبدیل‌های دقیق میلادی و جلالی جهت ثبت تاریخ‌های خرید و محاسبات دارایی |
| **احراز هویت** | Google Identity Services (GIS) | ورود امن بدون رمز با اکانت گوگل |
| **میزبانی ابری** | Cloudflare Pages | استقرار سرورلس روی شبکه لبه کلودفلر با تأخیر نزدیک به صفر |

---

## ۲. ساختار دایرکتوری فیچرمحور (`web/src/`)

معماری فرانت‌اند طبق الگوی **Feature-Based Architecture** بازطراحی شده است:

```text
web/src/
├── config/                            # کانفیگ‌های اشتراکی مرجع واحد (Symlinked با بک‌اند)
│   ├── displayEngine.js               # موتور مرکزی نمایش (نام، واحد، آیکون، رنگ، دسته‌بندی)
│   ├── categories.config.js           # تعاریف کاتالوگ دسته‌ها، رنگ‌ها و آیکون‌های لوسید
│   └── sources.config.js              # رجیستری کامل کدهای سورس‌های قیمت‌گذاری
├── features/                          # ماژول‌های مستقل بر اساس فیچر
│   ├── market/                        # فیچر نرخ‌های بازار و تحلیل حباب
│   │   ├── api/marketApi.js           # کلاینت اختصاصی API بازار
│   │   ├── components/                # AnalysisCards, CurrenciesList, QuickCurrencies
│   │   └── index.js                   # اکسپورت عمومی فیچر
│   ├── portfolio/                     # فیچر مدیریت سبد دارایی و رمزنگاری
│   │   ├── api/portfolioApi.js        # کلاینت پورتفو، دارایی‌ها و اشتراک‌گذاری
│   │   ├── components/                # HoldingsTable, AddHoldingForm, ShamsiDatePicker,
│   │   │                              # PortfolioSwitcher, PrivacyToggle, CsvExportButton...
│   │   ├── hooks/                     # usePortfolio, useHoldings (با مایگریشن خودکار)
│   │   ├── utils/holdingHelpers.js    # نرمال‌سازی دارایی، اتصال به displayEngine
│   │   └── index.js
│   ├── transactions/                  # فیچر ثبت تراکنش‌ها و موتور محاسبه خودکار دارایی‌ها
│   │   ├── api/transactionApi.js      # کلاینت CRUD تراکنش‌های پورتفو
│   │   ├── components/                # TransactionsPage, TransactionForm
│   │   ├── hooks/                     # useTransactions (E2EE), useComputedHoldings
│   │   ├── utils/calculationEngine.js # موتور میانگین موزون قیمت خرید (WAC)
│   │   └── index.js
│   ├── auth/                          # فیچر ورود و احراز هویت
│   │   ├── api/authApi.js             # سشن، گوگل OAuth، خروج
│   │   ├── context/AuthContext.jsx    # کانتکست و هوک useAuth
│   │   └── index.js
│   └── admin/                         # فیچر پنل ادمین
│       ├── api/adminApi.js            # آمار، مدیریت کاربران، منابع قیمت
│       ├── components/AdminPanel.jsx
│       └── index.js
├── shared/                            # مؤلفه‌های مشترک و با قابلیت استفاده مجدد
│   ├── api/httpClient.js              # Fetch Wrapper، مدیریت توکن Bearer و خطاها
│   ├── components/                    # Header, Navigation, Footer
│   └── ui/                            # Modal, NumericInput, AlertBanner, FilterPills, AppLayout
├── context/                           # PricingContext سراسری
├── utils/                             # financialSpecs, pricingEngine, calculator
└── pages/                             # صفحات اصلی (MainPage, SharedPortfolioPage, AdminPage)
```

---

## ۳. پیوند‌های نمادین مرجع واحد (Single Source of Truth Symlinks)

یکی از مهم‌ترین تصمیمات معماری RealRate، جلوگیری از تکرار تعاریف، کانفیگ‌ها و فرمول‌ها میان فرانت‌اند و بک‌اند است. تمامی منابع داده و قواعد نمایش از طریق **پیوندهای نمادین مستقیم (Symlink)** به اشتراک گذاشته شده‌اند:

1. **`web/src/utils/financialSpecs.js`** $\rightarrow$ `api/src/lib/financialSpecs.js`  
   مشخصات فیزیکی طلا، سکه‌ها، ارزهای بین‌المللی و فرمول‌های حباب و عیار.
2. **`web/src/config/sources.config.js`** $\rightarrow$ `api/src/config/sources.config.js`  
   رجیستری کدبیس سورس‌های قیمت با اولویت‌ها، بازه‌های اعتبارسنجی و نگاشت دسته‌بندی‌ها.
3. **`web/src/config/categories.config.js`** $\rightarrow$ `api/src/config/categories.config.js`  
   تعریف دسته‌بندی‌های کانونیکال دارایی‌ها (`gold`, `coin`, `silver`, `currency`, `crypto`, `bourse`, `funds`) به همراه بج، رنگ و شناسه آیکون Lucide.
4. **`web/src/config/displayEngine.js`** $\rightarrow$ `api/src/domain/displayEngine.js`  
   موتور مرکزی تولید عنوان، واحد، بج، برچسب منبع و آیکون دارایی در سراسر فرانت‌اند و بک‌اند بدون هیچ شرط سخت‌کدشده.

### دارایی‌های پشتیبانی‌شده:
- **طلا و فلزات**: طلای ۱۸ عیار، طلای ۲۴ عیار، آبشده، مثقال، انس جهانی طلا ($XAU$)، نقره خام، نقره ۹۲۵ و انس جهانی نقره ($XAG$).
- **سکه‌ها**: تمام بهار آزادی طرح جدید (امامی)، طرح قدیم، نیم‌سکه، ربع‌سکه، سکه گرمی.
- **ارزهای بین‌المللی**: بیش از ۶۵ ارز معتبر جهان (USD, EUR, GBP, AED, TRY, CHF, CNY, CAD, AUD, JPY, ...) با پرچم و نام‌های فارسی استاندارد.
- **بورس اوراق بهادار**: بیش از ۷۰۰ نماد سهام و کلیه صندوق‌های سرمایه‌گذاری (طلا، اهرمی، سهامی، درآمد ثابت).
- **طرح‌های سرمایه‌گذاری نقره**: طرح‌های نقره کاریزما و سایر ابزارهای متمرکز.
- **کریپتوکارنسی‌ها**: تتر (USDT)، بیت‌کوین (BTC)، اتریوم (ETH).

---

## ۴. موتورهای محاسباتی و نمایشی فرانت‌اند (Engines Layer)

### ۱. موتور مرکزی نمایش ([displayEngine.js](file:///Users/sina/Projects/realrate/web/src/config/displayEngine.js))
قلب تپنده لایه پرزنتیشن فرانت‌اند که تمامی منطق‌های هاردکدشده، سوییچ‌های پراکنده و نگاشت‌های دستی را منسوخ کرده است:
- **نام‌گذاری استاندارد (`getItemDisplayName`)**: ساخت خودکار فرمت `"{نام دارایی} ({نام سورس})"` (برای نمونه: `طرح نقره کاریزما (کاریزما)`، `فولاد (بورس تهران)`، `سکه امامی (بن‌بست)`).
- **استخراج واحد (`getItemUnit`)**: تشخیص دقیق واحد بر اساس سورس و متادیتا (`گرم`، `برگ سهم`، `تومان`، `واحد`، `دلار`).
- **دسته‌بندی و بج (`getItemCategory`, `getItemBadge`)**: تخصیص دسته‌بندی و برچسب کانونیکال از روی `categories.config.js`.
- **نگاشت آیکون‌های لوسید و پالت رنگی (`getCategoryIcon`, `getCategoryColor`)**: تطبیق داینامیک نام آیکون (مانند `TrendingUp`, `Coins`, `CircleDot`) با کامپوننت‌های بصری Lucide بدون هیچ شرط `switch/case`.

### ۲. موتور نرخ‌ها ([pricingEngine.js](file:///Users/sina/Projects/realrate/web/src/utils/pricingEngine.js))
وظیفه این ماژول تبدیل نرخ‌های خام بک‌اند به مدل غنی‌شده برای مصرف کامپوننت‌های فرانت‌اند است:
- محاسبه نرخ مشتق‌شده طلای ۲۴ عیار از روی طلای ۱۸ عیار بر اساس فرمول مصوب اتحادیه طلا.
- محاسبه گرم نقره و نقره ۹۲۵ بر پایه انس جهانی نقره و نرخ دلار.
- تعیین ارزش ذاتی (Intrinsic Value) و حباب اسمی/درصدی تمام سکه‌ها.
- ادغام کاتالوگ نمادها و صندوق‌ها با بهره‌گیری از `displayEngine` جهت نمایش دقیق واحدها و عناوین.

### ۳. ماشین حساب و پراکسی‌های متادیتا ([calculator.js](file:///Users/sina/Projects/realrate/web/src/utils/calculator.js))
- حذف کامل آرایه‌ها و دیکشنری‌های هاردکدشده قدیمی.
- استفاده از **پراکسی‌های دینامیک** `CURRENCY_METADATA_MAP` و `WORLD_FOREX_NAMES` که به صورت بلادرنگ از تعاریف سورس واحد تغذیه می‌کنند.
- تابع `calculateMarketData` جهت تولید تحلیل جامع اقلام بازار و پیشنهاد خرید کم‌حباب‌ترین دارایی.

---

## ۵. مدیریت وضعیت (State Management Architecture)

### ۱. `PricingContext.jsx`
- نگهداری آخرین قیمت‌های زنده بازار و کاتالوگ یکپارچه اقلام (`unifiedItems`).
- امکان تغییر دستی یا سفارشی‌سازی نرخ دلار مبنا توسط کاربر (`customUsdRate`).
- مدیریت پولینگ خودکار پس‌زمینه (هر ۶۰ ثانیه) و دکمه نوسازی آنی داده‌ها (`refreshPrices`).
- کنترل وضعیت بارگذاری سراسری (Loading Guard).

### ۲. `AuthContext.jsx`
- برقراری ارتباط با سرویس ورود گوگل (Google Identity Services).
- ذخیره و نگهداری امن توکن جلسه (`realrate_token`) در LocalStorage.
- استخراج نقش کاربر (`role: 'admin' | 'user'`) و کنترل دسترسی به تب تنظیمات و سورس‌ها.

### ۳. `usePortfolioData.js`
- مدیریت ساخت پورتفوهای متعدد کاربر و سوییچ سریع میان آن‌ها.
- افزودن، ویرایش و حذف دارایی‌ها و ارسال تغییرات به دیتابیس D1.
- محاسبه سود و زیان (PnL) تحقق‌نیافته هر سطر و مجموع پورتفولیو به تفکیک تومان و درصد.

---

## ۶. کامپوننت‌های کلیدی (Key Components)

### ۱. مدیریت پورتفولیو چندگانه ([PortfolioTracker.jsx](file:///Users/sina/Projects/realrate/web/src/features/portfolio/components/PortfolioTracker.jsx))
- **نمایش دوگانه مجزا**: تفکیک پورتفو به دو بخش تمیز بدون بوردر با مارجین متناسب: «دارایی‌های ثبت‌شده دستی» و «دارایی‌های حاصل از تراکنش‌ها (محاسبه خودکار)».
- **سوئیچر هوشمند پورتفوها ([PortfolioSwitcher.jsx](file:///Users/sina/Projects/realrate/web/src/features/portfolio/components/PortfolioSwitcher.jsx))**: نمایش بج‌های تفکیک‌شده بر اساس تب فعال (`mode="portfolio"` برای نمایش تعداد دارایی‌ها و `mode="transactions"` برای نمایش تعداد تراکنش‌ها).
- **انتخاب‌گر تاریخ شمسی (Jalali Date Picker)**: شامل منوهای کشویی سال، ماه و روز به همراه دکمه سریع **«⚡ امروز»**.
- **حالت حریم خصوصی (Privacy Mode)**: امکان مخفی‌کردن مبالغ و ارزش سرمایه‌گذاری با کلید سراسری هدر (`****`) در هر دو بخش پورتفو و تراکنش‌ها با رویداد سفارشی `realrate_privacy_change`.
- **خروجی اکسل/CSV**: دانلود مستقیم گزارش استاندارد سازگار با نرم‌افزارهای آفیس.
- **اشتراک‌گذاری پورتفو**: ایجاد لینک اختصاصی عمومی (`/p/:slug`) برای نمایش سبد به دیگران بدون امکان ویرایش.
- **فرم ثبت دارایی ([AddHoldingForm.jsx](file:///Users/sina/Projects/realrate/web/src/features/portfolio/components/AddHoldingForm.jsx))**: تشخیص کاملاً خودکار واحد و دسته دارایی با `displayEngine.getItemUnit` و `getItemCategory` بدون هیچ شرط هاردکدشده.

### ۲. سیستم ثبت تراکنش‌ها و موتور محاسبه خودکار ([TransactionsPage.jsx](file:///Users/sina/Projects/realrate/web/src/features/transactions/components/TransactionsPage.jsx))
- **ثبت معاملات خرید و فروش ([TransactionForm.jsx](file:///Users/sina/Projects/realrate/web/src/features/transactions/components/TransactionForm.jsx))**: ثبت آسان هر تراکنش با تشخیص خودکار نام و واحد دارایی از روی `displayEngine`.
- **موتور میانگین موزون قیمت خرید ([calculationEngine.js](file:///Users/sina/Projects/realrate/web/src/features/transactions/utils/calculationEngine.js))**:
  - مرتب‌سازی کرونولوژیکال تراکنش‌ها و اعمال فرمول WAC (Weighted Average Cost) روی خریدها.
  - کسر دارایی و محاسبه سود/زیان محقق‌شده در هنگام فروش و هشدار خودکار در صورت بیش‌فروش (Overselling).
  - انتقال و ادغام خودکار نتایج حاصل به پورتفوی کاربر بدون نیاز به ورود دستی دارایی.
- **کارت‌های آماری بلادرنگ**: نمایش کارت‌های مجموع خرید، مجموع فروش و گردش مالی کل.
- **رمزنگاری سرتاسری Zero-Knowledge**: رمزگذاری کلاینت‌محور تراکنش‌ها در پورتفوهای E2EE با الگوریتم AES-256-GCM.

### ۳. جستجوی سراسری دارایی‌ها ([UniversalAssetSearch.jsx](file:///Users/sina/Projects/realrate/web/src/components/UniversalAssetSearch.jsx))
- جستجوی سریع و بدون لگ در میان تمام دارایی‌های طلا، سکه، ارزها و ۷۰۰ نماد بورس.
- **پشتیبانی از نام‌های مستعار غنی**: جستجوی «امامی» برای سکه طرح جدید، «طرح قدیم» برای بهار آزادی، «آبشده» برای مثقال و نام‌های اختصاری سهام.
- فیلتر سریع بر اساس دسته‌بندی‌ها (طلا، سکه، ارز، بورس، صندوق‌ها).
- بهره‌گیری ۱۰۰٪ از `displayEngine` برای ساخت عناوین مرکب و استخراج رنگ‌ها و بج‌ها.

### ۴. تیکر سریع ارزها ([QuickCurrencies.jsx](file:///Users/sina/Projects/realrate/web/src/components/QuickCurrencies.jsx))
- نمایش کارت‌های ارزهای کلیدی با پرچم رسمی، نام فارسی، قیمت تومانی و نرخ برابری جهانی به صورت کاملاً داینامیک.

---

## ۷. سیستم استایل و طراحی (Design System)

- **رنگ‌بندی اختصاصی**:
  - پس‌زمینه: تم تیره گرادیانی مدرن (`#0b0f17` تا `#0f172a`).
  - رنگ‌های اکستنت: طلایی متالیک برای طلا (`#f59e0b`)، آبی نئونی برای ابزارها (`#3b82f6`)، سبز زمردی برای سود (`#10b981`) و رز برای زیان/حباب بالا (`#f43f5e`).
- **جلوه‌های بصری**: ترکیب Glassmorphism با `backdrop-filter: blur(12px)`، حاشیه‌های نرم و ترنزیشن‌های انیمیشنی ۱۸۰ میلی‌ثانیه‌ای.
- **تایپوگرافی**: استفاده از خانواده فونت متن‌باز و استاندارد **وزیرمتن (Vazirmatn)** با وزن‌های متنوع و اعداد فارسی خوانا.
- **واکنش‌گرایی**: سازگاری کامل با نمایشگرهای موبایل، تبلت و دسکتاپ.

---

## ۸. دستورات اجرایی، بیلد و استقرار (Commands)

### اجرای در محیط لوکال:
```bash
cd web
npm install
npm run dev
```
آدرس دسترسی لوکال: `http://localhost:5173`

### بیلد بهینه‌سازی‌شده برای پروداکشن:
```bash
npm run build
```
خروجی فشرده در دایرکتوری `web/dist/` تولید می‌شود (زمان کامپایل معمولاً کمتر از ۴۰۰ میلی‌ثانیه است).

### استقرار روی Cloudflare Pages:
```bash
npm run deploy
```
یا از طریق اتصال گیت‌هاب با مسیر ریشه `web` و دستور بیلد `npm run build`.
