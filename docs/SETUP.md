# راه‌اندازی و استقرار

## پیش‌نیازها
- Node.js نسخه ۲۲ (همان نسخه‌ی CI)، npm نسخه ۹ یا بالاتر
- حساب Cloudflare (Workers، Hyperdrive، Pages) و یک پایگاه‌داده Postgres

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

برای اجرای محلی یک Postgres لازم است (بخش Postgres را ببینید).

## Postgres (Hyperdrive)

داده‌های برنامه و تاریخچه قیمت‌ها در Postgres است و Worker از طریق Cloudflare Hyperdrive به آن وصل می‌شود (binding: `HYPERDRIVE` در `api/wrangler.toml`). جدول‌ها خودکار ساخته می‌شوند. همه‌چیز در Postgres است — Workers KV استفاده نمی‌شود: قیمت‌ها، لیست سورس‌ها و شمارنده‌ها در جدول `app_state`، نشست‌ها در `sessions` و تنظیمات سایت در `settings`.

کش کوئری Hyperdrive باید خاموش باشد، وگرنه ممکن است بعد از ذخیره، داده قدیمی خوانده شود:

```bash
npx wrangler hyperdrive update <HYPERDRIVE_ID> --caching-disabled true
```

برای اجرای محلی، `localConnectionString` را به یک Postgres محلی بدهید.

جداول با اولین درخواست به ورکر خودکار ساخته می‌شوند (`api/src/repositories/pgSchema.js`). برای دیدن SQL آن‌ها: `cd api && npm run db:schema`.

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

## رمز گاوصندوق حساب دمو

داده‌های حساب دمو با همان معماری رمزنگاری سرتاسری (E2EE) گاوصندوق نگهداری می‌شوند تا هیچ‌کدام از گیت‌ها یا جریان‌های داده دور زده نشوند. چون داده‌های دمو محرمانه نیستند، رمز گاوصندوق دمو عمومی است و سرور آن را فقط به نشست‌های دمو برمی‌گرداند تا مرورگر گاوصندوق را خودکار باز کند.

برای تنظیم رمز گاوصندوق دمو در محیط پروداکشن:

```bash
npx wrangler secret put DEMO_VAULT_PASSPHRASE
```

در صورت تنظیم نشدن این secret، ورکر از مقدار پیش‌فرض داخلی استفاده می‌کند.

## اسکن چک با هوش مصنوعی (Gemini)

اسکن چک تصویر را با **Gemini 3.8 Flash** گوگل می‌خواند. کلید API را (رایگان از [Google AI Studio](https://aistudio.google.com))
به‌صورت secret ثبت کنید؛ کلید در کد نوشته نمی‌شود:

```bash
cd api
npx wrangler secret put GEMINI_API_KEY
```

اگر گوگل بگوید مدل شلوغ است یا سهمیه‌اش تمام شده (خطای 503 یا 429)، اسکن به ترتیب با مدل‌های بعدی فهرست (Gemini 3.7، 3.6 و 3.5 Flash) امتحان می‌شود؛
سهمیه هر مدل در گوگل جداست. هر درخواست به گوگل، حتی ناموفق، ممکن است از سهمیه روزانه گوگل کم شود.

بدون این کلید، اسکن به کاربران «فعلاً در دسترس نیست» می‌گوید و به مدیر نام secret را. مدل در `api/src/config/ai.config.js` است.

**محدودیت استفاده:** هر کاربر روزانه ۱۰ اسکن دارد و مدیر بی‌محدودیت است (`api/src/config/usageLimits.js`؛ بخش
«محدودیت استفاده» در `docs/ARCHITECTURE.md`).

## استقرار

مرج در `main` هر دو بخش را خودکار منتشر می‌کند و در هر PR هم برای هر دو یک پیش‌نمایش ساخته می‌شود:

| بخش | سرویس | چک در GitHub |
| :--- | :--- | :--- |
| فرانت‌اند (`web/`) | Cloudflare Pages | `Cloudflare Pages` |
| بک‌اند (`api/`) | Cloudflare Workers Builds | `Workers Builds: realrate-api` |
| اپ اندروید (`web/android`) | GitHub Actions (`.github/workflows/android.yml`) | `apk` |

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

## اپ اندروید

هر مرج در `main` یک APK امضاشده را همراه توضیحات استخراج‌شده از `CHANGELOG.md` به‌عنوان Release منتشر می‌کند
(`v1.0.<شماره‌ی اجرا>`، فایل `realrate.apk`؛ لینک ثابت: `https://github.com/nos486/realrate/releases/latest/download/realrate.apk`).

برای امضا، این secretها را در GitHub (Settings → Secrets and variables → Actions) بگذارید — کلید و رمزها هرگز در مخزن نوشته نمی‌شوند:

| Secret | مقدار |
| :--- | :--- |
| `ANDROID_KEYSTORE_BASE64` | فایل keystore به base64 |
| `ANDROID_KEYSTORE_PASSWORD` | رمز keystore |
| `ANDROID_KEY_ALIAS` | نام کلید (مثلاً `realrate`) |
| `ANDROID_KEY_PASSWORD` | رمز کلید |

نسخه‌ی اپ (`versionName`) در بیلد وب به‌صورت `VITE_APP_VERSION` در خود اپ قرار می‌گیرد و با سرآیند `X-RealRate-Client` به سرور می‌رسد (آمار «کاربران اپ» در پنل مدیریت).
ساخت روی سیستم خودتان، ساختن کلید و جزئیات: [ANDROID.md](ANDROID.md).

## صفحه‌های ایستای SEO

`npm run build` در `web/` پس از Vite، `scripts/build-seo.mjs` را اجرا می‌کند که صفحه‌های ایستا (لندینگ بدون جاوااسکریپت، صفحه‌های ویژگی‌ها، `/android`، sitemap) را از `web/src/seo/pages.js` می‌سازد. آزمون‌ها: `npm test --workspace=web`.
