# 🪙 RealRate — Real-Time Gold, Coin, Forex & Cloud Portfolio Platform

<div align="center">

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Cloudflare D1](https://img.shields.io/badge/Database-Cloudflare_D1_(SQLite)-blue?style=for-the-badge&logo=sqlite&logoColor=white)](https://developers.cloudflare.com/d1/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

</div>

---

### 🌐 Overview (English)

**RealRate** is a modern, high-performance financial analysis suite and cloud portfolio tracker designed for the Iranian gold, coin, and foreign exchange markets. It calculates intrinsic values and market bubbles using global spot gold prices and open-market USD rates, provides instantaneous currency conversions, generates gold jewelry invoice breakdowns, and allows authenticated users to manage their investment holdings in a serverless relational database with real-time profit and loss (PnL) analytics.

#### 🚀 Key Features
- **🪙 Gold & Coin Bubble Analysis**: Calculates pure gold intrinsic value for Emami, Bahar Azadi, Half, and Quarter coins and 18K gold based on international ounce prices and free-market USD exchange rates. Includes comparative bubble metrics and smart buy recommendations.
- **💱 Global Forex Rates**: Instant conversion of major currencies (USD, EUR, AED, TRY, GBP, CAD, etc.) into Tomans using live cross-rates.
- **💎 Gold Jewelry Invoice Calculator**: Accurate calculation of final purchase prices including artisan wage presets, jeweler profit margin, and VAT, complete with a digital receipt.
- **💼 Cloud Portfolio Tracker (NEW)**: Secure, authenticated personal asset tracking for gold, coins, currencies, and USDT. Persisted in Cloudflare D1 (SQLite) database with purchase dates, buy prices, custom notes, and live calculation of total net worth and profit/loss (PnL in Tomans & %).
- **🔐 Google OAuth (GIS)**: Seamless authentication with Google Identity Services, 30-day secure session management, and role-based access control.
- **📊 Admin Panel & Analytics**: Real-time traffic monitoring, active users within the last 5 minutes, registered user management, and dynamic system-wide configuration without redeploying.

#### 🏗️ Architecture
RealRate is structured as an **npm workspaces monorepo**:
- **`api/`**: Pure JSON REST API running on Cloudflare Workers, integrated with Cloudflare D1 (SQLite) and Cloudflare KV.
- **`web/`**: Modern Single Page Application (SPA) built with React 19, Vite, and custom dark glassmorphism CSS, hosted on Cloudflare Pages.

---

# 🪙 راهنمای جامع فارسی سامانه RealRate

سامانه هوشمند و پیشرفته **RealRate**، پلتفرم تحلیل بازار طلا، سکه، ارزهای مطرح جهان و **مدیریت پورتفوی ابری سرمایه‌گذاری** با تمرکز بر شفافیت قیمت‌ها و رابط کاربری مدرن (Fintech Dark Glassmorphism) است.

---

## ✨ امکانات و قابلیت‌های اصلی

### 💼 ۱. پورتفوی هوشمند دارایی‌های من (Cloud Portfolio Tracker)
- **ذخیره‌سازی ابری در پایگاه داده Cloudflare D1**: اطلاعات دارایی‌های کاربر به صورت کاملاً امن در دیتابیس ابری ذخیره شده و از هر دستگاه و گوشی در دسترس است.
- **فیلدهای کامل برای هر دارایی**:
  - **نوع دارایی**: انواع سکه بهار آزادی (تمام طرح جدید/قدیم، نیم، ربع، گرمی)، طلای ۱۸ عیار خام، دلار، یورو، درهم، لیر، تتر (USDT) و ...
  - **مقدار یا وزن**: به عدد یا گرم با پشتیبانی از ارقام فارسی و اعشار.
  - **قیمت خرید واحد**: ثبت قیمت تمام‌شده خرید به ازای هر واحد به تومان.
  - **تاریخ یا زمان خرید**: ثبت زمان خرید (مثلاً `۱۴۰۳/۱۱/۲۰` یا `آبان ۱۴۰۳`) جهت شفافیت سرمایه‌گذاری.
  - **توضیحات و یادداشت**: یادداشت اختصاصی برای هر قلم دارایی (مثلاً «خرید از طلافروشی پاساژ»، «پله اول»).
- **محاسبه آنلاین و زنده سود و زیان (PnL)**:
  - محاسبه آنی ارزش روز دارایی‌ها بر اساس آخرین قیمت‌های بازار.
  - نمایش سود/زیان تومانی و درصدی برای تک‌تک اقلام.
  - نمایش ارزش کل پورتفو، مجموع سود یا زیان و درصد بازدهی کل سبد دارایی.
- **احراز هویت اختصاصی (Auth Gating)**: دسترسی به بخش پورتفو نیازمند ورود با حساب کاربری گوگل است.
- **انتقال خودکار داده‌ها (Auto-Migration)**: چنانچه کاربری دارایی‌های پیشین خود را در حافظه مرورگر داشته باشد، در اولین ورود به طور خودکار به دیتابیس ابری منتقل می‌شود.

---

### 📊 ۲. تحلیل حباب طلا و انواع سکه
- **محاسبه ارزش ذاتی و واقعی خام طلا**: محاسبه ارزش ریاضی طلای خالص بر پایه انس جهانی ($) و نرخ دلار آزاد (تومان).
- **تحلیل دوگانه حباب**:
  - سنجش حباب نسبت به **ارزش طلای خام**.
  - سنجش انحراف نسبت به **قیمت انتظاری با حباب مصوب**.
- **پیشنهاد هوشمند اقتصادی (Smart Recommendation)**: شناسایی خودکار کم‌حباب‌ترین و باارزش‌ترین قلم طلا/سکه جهت خرید.
- **شناسایی حباب منفی و وضعیت اقلام**: تفکیک بصری وضعیت حباب و مدیریت اقلام ناموجود در بازار بدون قیمت‌سازی کاذب.

---

### 💱 ۳. نرخ لحظه‌ای ارزهای جهان
- دریافت زنده نرخ‌های برابری از مراجع بین‌المللی و تبدیل خودکار به تومان:
  - 🇺🇸 **دلار آمریکا (USD)**
  - 🇪🇺 **یورو اروپا (EUR)**
  - 🇦🇪 **درهم امارات (AED)**
  - 🇹🇷 **لیر ترکیه (TRY)**
  - 🇬🇧 **پوند انگلیس (GBP)**
  - 🇨🇦 **دلار کانادا (CAD)**
  - 🇨🇳 **یوان چین (CNY)**
  - 🇸🇦 **ریال عربستان (SAR)** و سایر ارزهای رایج
- قابلیت جستجوی سریع در نام و کد اختصاری ارزها.

---

### 💎 ۴. محاسبه‌گر پیشرفته فاکتور طلا و اجرت
- محاسبه دقیق مبلغ نهایی خرید طلا با اجرت ساخت و مالیات:
  - وزن طلا به گرم
  - دکمه‌های سریع و دستی برای درصد اجرت ساخت (٪۷، ٪۱۰، ٪۱۵، ٪۱۸، ٪۲۲)
  - درصد سود طلافروش (پیش‌فرض ٪۷ اتحادیه)
  - درصد مالیات بر ارزش افزوده (پیش‌فرض ٪۹)
  - صدور فاکتور و رسید دیجیتال با تفکیک اجزا.

---

### 🔐 ۵. سیستم احراز هویت و پنل مدیریت
- **ورود سریع با حساب گوگل (Google GIS)**: بدون نیاز به رمز عبور، با توکن‌های امن و نشست ۳۰ روزه.
- **مدیریت سطح دسترسی (RBAC)**: شناسایی مدیر سیستم بر اساس ایمیل تعیین‌شده در `ADMIN_EMAIL`.
- **پنل مدیریت پیشرفته (`/admin`)**:
  - آمار زنده تعداد کاربران آنلاین طی ۵ دقیقه گذشته بر پایه IP.
  - تعداد کل بازدیدها و شمارش کاربران ثبت‌نام شده.
  - لیست کاربران به همراه تصویر پروفایل، تاریخ اولین و آخرین ورود و تعداد دفعات لاگین.
  - تغییر پویای درصد حباب مصوب و ارسال پیام/اطلاعیه همگانی در بالای سایت.

---

## 🏗️ ساختار مخزن (Monorepo Architecture)

```text
realrate/
├── package.json               # تنظیمات اصلی Workspaces و اسکریپت‌های مشترک
├── README.md                  # راهنمای جامع پروژه
│
├── api/                       # سرویس بک‌اند (Cloudflare Worker REST API)
│   ├── wrangler.toml          # پیکربندی کلاودفلر (Bindings: D1, KV, Vars)
│   ├── schema.sql             # ساختار جداول پایگاه داده SQLite/D1
│   ├── package.json
│   └── src/
│       ├── index.js           # روتر اصلی و ورودی ورکر
│       ├── handlers/          # کنترلرهای مسیرها (api, auth, admin, portfolio)
│       │   ├── apiRoutes.js
│       │   ├── authRoutes.js
│       │   ├── adminRoutes.js
│       │   └── portfolioRoutes.js
│       ├── lib/               # ابزارهای پایگاه داده، احراز هویت و تنظیمات
│       │   ├── db.js          # ارتباط با D1 و KV به همراه Auto-Migration
│       │   ├── auth.js        # احراز هویت سشن و بررسی ادمین
│       │   ├── settings.js
│       │   ├── analytics.js
│       │   └── helpers.js     # پاسخ‌های JSON و هدرهای داینامیک CORS
│       └── services/          # دریافت داده‌های خارجی (انس طلا، ارزها، تلگرام)
│
└── web/                       # سرویس فرانت‌اند (React 19 + Vite SPA)
    ├── vite.config.js         # کانفیگ بیلد و پروکسی توسعه
    ├── package.json
    ├── .env.production        # آدرس API پروداکشن (VITE_API_URL)
    └── src/
        ├── App.jsx            # روتینگ برنامه با React Router
        ├── main.jsx
        ├── api/client.js      # کلاینت متمرکز فراخوانی APIها با توکن احراز هویت
        ├── context/           # کانتکست احراز هویت (AuthContext)
        ├── hooks/             # هوک‌های داده بازار و محاسبات
        ├── components/        # کامپوننت‌های رابط کاربری
        │   ├── Header.jsx
        │   ├── QuickCurrencies.jsx
        │   ├── AnalysisCards.jsx
        │   ├── CurrenciesList.jsx
        │   ├── JewelryCalc.jsx
        │   ├── PortfolioTracker.jsx # ردیاب پورتفو با گیت احراز هویت
        │   ├── AdminPanel.jsx
        │   └── Footer.jsx
        ├── pages/
        │   ├── MainPage.jsx   # صفحه اصلی با تب‌بندی مدرن
        │   └── AdminPage.jsx  # صفحه پنل مدیریت
        └── styles/
            └── index.css      # سیستم طراحی دارک و گلس‌مورفیسم فین‌تک
```

---

## 🚀 راهنمای نصب و اجرای محلی (Local Development)

### پیش‌نیازها
- Node.js نسخه 20 یا بالاتر
- npm نسخه 9 یا بالاتر

### ۱. دریافت پروژه و نصب پکیج‌ها
```bash
git clone https://github.com/nos486/realrate.git
cd realrate
npm install
```

### ۲. اجرای همزمان بک‌اند و فرانت‌اند
با اجرای یک دستور، سرور ورکر (پورت `8787`) و فرانت‌اند Vite (پورت `5173`) اجرا می‌شوند:
```bash
npm run dev
```

آدرس‌های محلی:
- فرانت‌اند: `http://localhost:5173`
- بک‌اند API: `http://localhost:8787`

همچنین می‌توانید هر کدام را به صورت مجزا اجرا کنید:
```bash
npm run api:dev   # اجرای فقط بک‌اند ورکر
npm run web:dev   # اجرای فقط فرانت‌اند ری‌اکت
```

---

## 🗄️ راه‌اندازی پایگاه‌داده Cloudflare D1 و KV

پروژه از دیتابیس **Cloudflare D1 (SQLite)** برای ذخیره کاربران، نشست‌ها، تنظیمات و دارایی‌های پورتفو استفاده می‌کند.

### ۱. ساخت دیتابیس D1 در کلاودفلر
```bash
npx wrangler d1 create realrate-db
```
شناسه برگشتی (`database_id`) را در فایل `api/wrangler.toml` قرار دهید:
```toml
[[d1_databases]]
binding = "DB"
database_name = "realrate-db"
database_id = "<شناسه_دیتابیس_شما>"
```

### ۲. ساخت فضای KV
```bash
npx wrangler kv:namespace create REALRATE_KV
```
شناسه برگشتی را در `api/wrangler.toml` بخش `kv_namespaces` وارد کنید.

### ۳. اعمال مایگریشن جداول
جداول پایگاه داده به صورت خودکار با قابلیت **Auto-Bootstrap** در اولین درخواست ورکر ساخته می‌شوند، اما می‌توانید فایل `schema.sql` را دستی نیز اعمال کنید:
```bash
# محیط آنلاین
npx wrangler d1 execute realrate-db --remote --file=./api/schema.sql
```

---

## 🔑 تنظیم ورود با گوگل (Google OAuth Setup)

1. وارد [Google Cloud Console](https://console.cloud.google.com/) شوید و یک پروژه بسازید.
2. از مسیر **APIs & Services > Credentials** یک **OAuth 2.0 Client ID** از نوع **Web application** بسازید.
3. در بخش **Authorized JavaScript origins** آدرس‌های مجاز را اضافه کنید:
   - `http://localhost:5173`
   - `http://localhost:8787`
   - `https://realrate.pages.dev` (یا دامنه اختصاصی فرانت‌اند شما)
4. شناسه کلاینت دریافت شده (`Client ID`) را در تنظیمات وارد کنید:
   - در `api/wrangler.toml` زیر `[vars]`:
     ```toml
     GOOGLE_CLIENT_ID = "YOUR_CLIENT_ID.apps.googleusercontent.com"
     ADMIN_EMAIL = "your-email@gmail.com"
     ```
   - در فرانت‌اند برای بیلد محلی در فایل `web/.env.local`:
     ```env
     VITE_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
     ```

---

## 🌐 راهنمای استقرار در سرور ابری (Deployment)

### استقرار بک‌اند (Cloudflare Worker)
```bash
npm run api:deploy
```
یا از داخل دایرکتوری `api`:
```bash
cd api
npx wrangler deploy
```

### استقرار فرانت‌اند (Cloudflare Pages)
در پنل Cloudflare Dashboard به بخش **Workers & Pages > Create application > Pages > Connect to Git** بروید:
- **Project name**: `realrate`
- **Framework preset**: `Vite`
- **Root directory**: `web`
- **Build command**: `npm run build`
- **Build output directory**: `dist`
- **Environment variables**:
  - `VITE_API_URL`: آدرس ورکر بک‌اند شما (مثلاً `https://realrate-api.geekio.org`)
  - `VITE_GOOGLE_CLIENT_ID`: شناسه کلاینت گوگل

---

## 📜 لایسنس
این پروژه تحت مجوز [MIT License](LICENSE) منتشر شده است و استفاده از آن آزاد می‌باشد.
