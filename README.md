# 🪙 RealRate — محاسبه‌گر طلا، سکه و ارزهای جهان

سامانه هوشمند و پیشرفته **RealRate** جهت تحلیل حباب طلا و سکه، محاسبه ارزش واقعی بر اساس دلار و انس جهانی، نمایش نرخ روز ارزهای مطرح جهان، محاسبه‌گر اجرت طلا و پنل مدیریت متصل به **Cloudflare KV Storage**.


---

## ✨ امکانات و ویژگی‌های اصلی

### 📊 ۱. تحلیل حباب طلا و سکه
- **محاسبه ارزش واقعی خام طلا**: محاسبه ارزش خالص طلای به‌کار رفته در سکه و طلا عیار ۱۸ بر اساس فرمول بین‌المللی انس طلا و نرخ دلار آزاد.
- **محاسبه قیمت برآوردی با حباب مصوب**: امکان تعریف درصد حباب هدف برای سکه تمام، نیم سکه و ربع سکه در پنل مدیریت.
- **تحلیل حباب دوگانه**:
  - نمایش میزان و درصد حباب نسبت به **ارزش خام طلا**.
  - نمایش انحراف قیمت روز بازار نسبت به **قیمت محاسباتی (با حباب مصوب)**.
- **شناسایی حباب منفی**: نمایش متمایز و متمایل به آبی برای اقلامی که قیمت بازار آن‌ها کمتر از ارزش واقعی یا محاسباتی است.
- **مدیریت اقلام ناموجود**: اقلامی که در بازار موجود نیستند بدون قیمت‌سازی کاذب به صورت «ناموجود در بازار» نشان داده می‌شوند.

### 💱 ۲. تب قیمت روز ارزهای جهان
- دریافت زنده نرخ برابری ارزهای جهانی از API معتبر بین‌المللی.
- محاسبه واکنش‌گرا و لحظه‌ای قیمت ارزها به تومان بر اساس دلار وارد شده:
  - 🇪🇺 **یورو (EUR)**
  - 🇦🇪 **درهم امارات (AED)**
  - 🇹🇷 **لیر ترکیه (TRY)**
  - 🇨🇳 **یوان چین (CNY)**
  - 🇬🇧 **پوند انگلیس (GBP)**
  - 🇨🇦 **دلار کانادا (CAD)**
- طراحی به صورت **لیست فشرده و مرتب (Compact List)** جهت بررسی سریع.

### 💎 ۳. محاسبه‌گر فاکتور طلا و اجرت
- محاسبه دقیق مبلغ نهایی فاکتور خرید طلا شامل:
  - وزن طلا (گرم)
  - درصد اجرت ساخت (٪)
  - درصد سود طلافروش (٪)
  - درصد مالیات بر ارزش افزوده (٪)

### 🔐 ۴. احراز هویت با گوگل (Google Sign-In) و جدول کاربران
- **ورود سریع با گوگل برای عموم کاربران**: هر کاربری می‌تواند با حساب گوگل خود در سایت وارد شود.
- **جدول کاربران (User Table)**: مشخصات کاربران لاگین کرده (نام، ایمیل، تصویر پروفایل، تاریخ اولین ورود، آخرین فعالیت و دفعات ورود) در Cloudflare KV ذخیره و نگهداری می‌شود.
- **حذف رمز عبور استاتیک و احراز مدیر با ADMIN_EMAIL**:
  - رمزهای پیش‌فرض و استاتیک حذف شده‌اند.
  - دسترسی به پنل مدیریت (`/admin`) تنها به ایمیل(های) تعیین‌شده در متغیر محیطی `ADMIN_EMAIL` داده می‌شود.
  - امکان تعیین چندین ایمیل مدیر با کاما وجود دارد (مانند: `admin@gmail.com,owner@gmail.com`).
- **تنظیمات عمومی پیش‌فرض در پنل مدیریت**:
  - قیمت پیش‌فرض دلار آزاد (تومان)
  - پیش‌فرض انس جهانی طلا ($)
  - درصد حباب مصوب سکه تمام، نیم سکه و ربع سکه
  - ارسال پیام یا اطلاعیه عمومی بالای سایت
- **مدیریت کاربران در پنل مدیریت**: مشاهده کامل لیست کاربران ثبت‌نام شده به همراه نقش و تاریخچه فعالیت.

### 👁️ ۵. سیستم آمارگیری بر اساس IP و کاربران
- **شمارش کاربران آنلاین**: محاسبه کاربران فعال طی ۵ دقیقه اخیر بر اساس IP اختصاصی.
- **بازدید کل**: شمارش بی‌همتای بازدیدکنندگان بر اساس IP به صورت ۲۴ ساعته.
- **مجموع کاربران ثبت‌شده**: نمایش تعداد کل حساب‌هایی که با گوگل وارد شده‌اند.

---

## 🏗️ ساختار Monorepo

پروژه به دو بخش کاملاً مجزا و ماژولار تقسیم شده است:
- `api/`: بک‌اند **Cloudflare Worker** (فقط JSON REST API، D1 Database، KV Storage، احراز هویت و کرون‌جاب‌ها)
- `web/`: فرانت‌اند **React 19 + Vite SPA** (رابط کاربری واکنش‌گرا و سریع، دیپلوی روی Cloudflare Pages)

```bash
realrate/
├── package.json          # مدیریت پکیج‌های monorepo (npm workspaces)
├── api/                  # Cloudflare Worker API
│   ├── wrangler.toml
│   ├── schema.sql
│   └── src/
└── web/                  # React + Vite Frontend
    ├── vite.config.js
    ├── .env.local
    └── src/
```

---

## 🚀 نحوه اجرا در محیط توسعه (Local Development)

برای اجرای همزمان بک‌اند و فرانت‌اند با یک دستور:
```bash
# نصب تمام وابستگی‌های monorepo
npm install

# اجرای همزمان API (پورت 8787) و Web (پورت 5173)
npm run dev
```

یا اجرای مجزای هر سرویس:
```bash
npm run api:dev   # اجرای Cloudflare Worker API روی localhost:8787
npm run web:dev   # اجرای فرانت‌اند Vite روی localhost:5173
```

---

## 🛠️ تکنولوژی‌های استفاده‌شده

- **Frontend (web/)**: React 19, Vite 8, React Router 7, Vanilla Modern CSS (Dark Mode & Glassmorphism)
- **Backend (api/)**: Cloudflare Workers (JavaScript ES Modules)
- **دیتابیس رابطه‌ای (SQL)**: Cloudflare D1 Serverless SQLite (`env.DB`)
- **احراز هویت (Auth)**: Google Identity Services (GIS) + JWT / Bearer Token & Session Cookie
- **حافظه کش و آمار (KV)**: Cloudflare KV Storage (`REALRATE_KV`)
- **منابع قیمت**: دریافت زنده قیمت‌های روز بازار طلا و نرخ برابری ارزها

---

## 🔑 راهنمای گام‌به‌گام راه‌اندازی ورود با گوگل (Google OAuth Setup)

برای فعال‌سازی ورود با گوگل روی سایت، مراحل زیر را در **Google Cloud Console** دنبال کنید:

### گام ۱: ساخت پروژه در گوگل کلود
1. وارد [Google Cloud Console](https://console.cloud.google.com/) شوید.
2. روی منوی انتخاب پروژه در بالای صفحه کلیک کرده و گزینه **New Project** را انتخاب کنید.
3. نام دلخواه (مثلاً `RealRate`) را وارد کرده و دکمه **Create** را بزنید.

### گام ۲: پیکربندی صفحه رضایت (OAuth Consent Screen)
1. از منوی سمت چپ به مسیر **APIs & Services** > **OAuth consent screen** بروید.
2. نوع کاربر را **External** انتخاب کرده و روی **Create** کلیک کنید.
3. فیلدهای مورد نیاز را پر کنید:
   - **App name**: نام برنامه (مثلاً `RealRate`)
   - **User support email**: ایمیل خودتان
   - **Developer contact information**: ایمیل شما
4. روی **Save and Continue** کلیک کنید.
5. در مرحله Scopes، موارد پیش‌فرض (`email` و `profile`) کافی هستند؛ روی **Save and Continue** کلیک کنید.
6. در بخش Audience یا Publishing status، دکمه **Publish App** را بزنید تا برنامه فعال شود و همه کاربران بتوانند لاگین کنند.

### گام ۳: ساخت شناسه کلاینت (Web Client ID)
1. از منوی سمت چپ به مسیر **APIs & Services** > **Credentials** بروید.
2. روی **+ CREATE CREDENTIALS** در بالای صفحه کلیک کرده و **OAuth client ID** را انتخاب کنید.
3. فیلد **Application type** را روی **Web application** قرار دهید.
4. در بخش **Authorized JavaScript origins**، آدرس‌های مجاز سایت خود را اضافه کنید:
    - برای محیط توسعه محلی:
      - `http://localhost:5173` (پورت پیش‌فرض فرانت‌اند React/Vite)
      - `http://localhost:8787` (پورت پیش‌فرض ورکر API)
      - `http://127.0.0.1:5173`
      - `http://127.0.0.1:8787`
    - برای محیط پروداکشن (Cloudflare Pages و Cloudflare Workers):
      - `https://realrate.pages.dev` (آدرس Cloudflare Pages فرانت‌اند)
      - `https://your-worker-subdomain.workers.dev`
      - دامنه اصلی اختصاصی شما (مانند `https://realrate.ir`)
   > ⚠️ **نکته**: در انتهای آدرس‌ها اسلش `/` قرار ندهید و برای آدرس‌های غیرلوکال حتماً پروتکل `https://` الزامی است.
5. روی دکمه **Create** کلیک کنید.
6. پنجره‌ای شامل **Client ID** به شما نمایش داده می‌شود (مثال: `1234567890-abcdefg.apps.googleusercontent.com`). این مقدار را کپی کنید.

### گام ۴: تنظیم مقادیر در `wrangler.toml` یا Cloudflare Secrets
شناسه کلاینت گوگل و ایمیل(های) مدیر را در فایل `wrangler.toml` وارد کنید:

```toml
[vars]
ADMIN_EMAIL = "your-admin-email@gmail.com"
GOOGLE_CLIENT_ID = "1234567890-abcdefg.apps.googleusercontent.com"
```

> 💡 **نکته امنیتی در پروداکشن**: می‌توانید مقادیر را به صورت Secret در کلاودفلر ذخیره کنید:
> ```bash
> npx wrangler secret put ADMIN_EMAIL
> npx wrangler secret put GOOGLE_CLIENT_ID
> ```

---

## 🚀 راه اندازی و اجرا روی محیط محلی (Local Development)

۱. **کلون کردن مخزن**:
```bash
git clone https://github.com/nos486/realrate.git
cd realrate
```

۲. **نصب وابستگی‌ها**:
```bash
npm install
```

۳. **اجرای سرور توسعه (Wrangler Dev)**:
```bash
npx wrangler dev --port 8787
```
سایت در آدرس `http://127.0.0.1:8787` و پنل مدیریت در `http://127.0.0.1:8787/admin` در دسترس خواهد بود.

---

## 🌐 انتشار روی Cloudflare Workers (Deploy)

برای انتشار نسخه نهایی روی حساب Cloudflare خود:

```bash
npx wrangler deploy
```

---

## 🔑 ساخت دیتابیس Cloudflare KV

در صورت عدم وجود دیتابیس KV، یک Namespace جدید بسازید و ID آن را در فایل `wrangler.toml` جایگزین کنید:

```bash
npx wrangler kv:namespace create REALRATE_KV
```

تنظیمات `wrangler.toml`:
```toml
name = "realrate"
main = "src/index.js"
compatibility_date = "2024-01-01"

[[kv_namespaces]]
binding = "REALRATE_KV"
id = "<YOUR_KV_NAMESPACE_ID>"
```

---

## 🗄️ ساخت و راه‌اندازی دیتابیس Cloudflare D1 (SQL)

سامانه RealRate از **Cloudflare D1 (SQLite)** برای ذخیره‌سازی داده‌های ساخت‌یافته کاربران، سشن‌ها و تنظیمات استفاده می‌کند.

### ۱. ساخت دیتابیس D1 در کلاودفلر:
```bash
npx wrangler d1 create realrate-db
```
پس از اجرای این دستور، کلاودفلر یک `database_id` به شما می‌دهد.

### ۲. اتصال دیتابیس در `wrangler.toml`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "realrate-db"
database_id = "<YOUR_D1_DATABASE_ID>"
```

### ۳. اعمال جداول دیتابیس (Schema Migration):
برای اعمال فایل `schema.sql`:
- **محیط محلی (Local)**:
  ```bash
  npx wrangler d1 execute realrate-db --local --file=./schema.sql
  ```
- **محیط آنلاین (Remote)**:
  ```bash
  npx wrangler d1 execute realrate-db --remote --file=./schema.sql
  ```

> 💡 **نکته**: ورکر RealRate مجهز به مکانیزم Auto-Bootstrap است؛ یعنی حتی اگر مایگریشن دستی اجرا نشود، جداول به صورت خودکار (`CREATE TABLE IF NOT EXISTS`) در اولین درخواست ایجاد می‌شوند.

---

## 📜 لایسنس
این پروژه تحت لایسنس MIT منتشر شده است.
