# راه‌اندازی و استقرار

## پیش‌نیازها
- Node.js نسخه ۲۰ یا بالاتر، npm نسخه ۹ یا بالاتر
- حساب Cloudflare (Workers، D1، KV، Pages)

## اجرای محلی

```bash
git clone https://github.com/nos486/realrate.git
cd realrate
npm install
npm run dev        # API روی :8787 و وب روی :5173
```

اجرای جداگانه:

```bash
npm run api:dev    # فقط ورکر (wrangler dev)
npm run web:dev    # فقط وب (Vite)
npm test           # آزمون‌های Vitest
```

برای دیتابیس محلی D1:

```bash
cd api && npm run db:migrate:local
```

## Cloudflare D1 و KV

```bash
npx wrangler d1 create realrate-db
npx wrangler kv:namespace create REALRATE_KV
```

شناسه‌ها را در `api/wrangler.toml` قرار دهید:

```toml
[[d1_databases]]
binding = "DB"
database_name = "realrate-db"
database_id = "YOUR_DATABASE_ID"

[[kv_namespaces]]
binding = "REALRATE_KV"
id = "YOUR_KV_ID"
```

جداول با اولین درخواست به ورکر خودکار ساخته و به‌روز می‌شوند (`migration.repository.js`). اعمال دستی:

```bash
npx wrangler d1 execute realrate-db --remote --file=./api/schema.sql
```

## ورود با گوگل

1. در [Google Cloud Console](https://console.cloud.google.com/) یک **OAuth 2.0 Client ID (Web Application)** بسازید.
2. در **Authorized JavaScript origins** این آدرس‌ها را اضافه کنید: `http://localhost:5173`، `http://localhost:8787` و دامنه فرانت‌اند.
3. شناسه را تنظیم کنید:
   - `api/wrangler.toml`:
     ```toml
     [vars]
     GOOGLE_CLIENT_ID = "YOUR_CLIENT_ID.apps.googleusercontent.com"
     ADMIN_EMAIL = "your_admin_email@gmail.com"
     ```
   - `web/.env.local`:
     ```env
     VITE_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
     ```
4. `GOOGLE_CLIENT_SECRET` را به‌صورت secret ثبت کنید: `npx wrangler secret put GOOGLE_CLIENT_SECRET`

## ثبت‌نام با ایمیل (ارسال ایمیل)

ثبت‌نام بدون گوگل و بازیابی رمز عبور به ارسال ایمیل (لینک تأیید / بازیابی) نیاز دارد. ارسال از طریق API سرویس
[Resend](https://resend.com) انجام می‌شود (ورکرها SMTP ندارند):

1. در Resend دامنه ارسال (مثلاً `geekio.org`) را اضافه و رکوردهای DNS آن را در Cloudflare ثبت کنید تا تأیید شود.
2. یک API Key بسازید و به‌صورت secret ثبت کنید: `npx wrangler secret put RESEND_API_KEY`
3. فرستنده را در `api/wrangler.toml` تعیین کنید:
   ```toml
   [vars]
   EMAIL_FROM = "RealRate <no-reply@geekio.org>"
   # اختیاری: آدرس فرانت‌اند برای لینک‌ها وقتی درخواست Origin ندارد
   # FRONTEND_URL = "https://realrate.geekio.org"
   ```

تا وقتی ارسال ایمیل تنظیم نشده، ثبت‌نام و بازیابی رمز با پیام «ارسال ایمیل تنظیم نشده است» رد می‌شوند و ورود با گوگل
مثل قبل کار می‌کند. برای توسعه محلی بدون سرویس ایمیل: `npx wrangler dev --var EMAIL_DEBUG_LOG:true` — متن ایمیل‌ها
(همراه لینک) در لاگ ورکر نوشته می‌شود.

## استقرار

مرج در `main` هر دو بخش را خودکار منتشر می‌کند و در هر PR هم برای هر دو یک پیش‌نمایش ساخته می‌شود:

| بخش | سرویس | چک در GitHub |
| :--- | :--- | :--- |
| فرانت‌اند (`web/`) | Cloudflare Pages | `Cloudflare Pages` |
| بک‌اند (`api/`) | Cloudflare Workers Builds | `Workers Builds: realrate-api` |

### بک‌اند (Cloudflare Workers)

انتشار خودکار از طریق اتصال Git در پنل Cloudflare (Workers Builds) انجام می‌شود. انتشار دستی (مثلاً برای اولین بار یا بدون Git):

```bash
npm run api:deploy
# یا
cd api && npx wrangler deploy
```

جداول جدید با اولین درخواست پس از انتشار خودکار ساخته می‌شوند.

### فرانت‌اند (Cloudflare Pages)

در **Workers & Pages > Create Application > Pages > Connect to Git**:

| تنظیم | مقدار |
| :--- | :--- |
| Root directory | `web` |
| Framework preset | `Vite` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| `VITE_API_URL` | آدرس ورکر (مثلاً `https://realrate-api.geekio.org`) |
| `VITE_GOOGLE_CLIENT_ID` | شناسه کلاینت گوگل |

دامنه فرانت‌اند باید در `ALLOWED_ORIGINS` در `api/src/lib/helpers.js` باشد (CORS).
