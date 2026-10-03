# راه‌اندازی و استقرار

## پیش‌نیازها
- Node.js نسخه ۲۲ (همان نسخه‌ی CI)، npm نسخه ۹ یا بالاتر
- حساب Cloudflare با پلن پولی Workers (Workers، D1، KV، Pages)

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

اجرای محلی از D1 و KV محلی wrangler استفاده می‌کند (بخش D1 و KV را ببینید).

## D1 و KV

داده‌ها در Cloudflare است (پلن پولی Workers، ۵ دلار، لازم است):
- **D1** (binding: `DB`): داده‌های برنامه، نشست‌ها، تنظیمات، تاریخچه‌ی روزانه‌ی قیمت (`price_daily`: آخرین قیمت هر قلم در هر روز به وقت تهران) و وضعیت‌هایی که باید همیشه درست خوانده شوند (`app_state`: شمارنده‌ها، تنظیمات سورس‌ها، وضعیت همگام‌سازی سورس‌ها).
- **KV** (binding: `KV`): داده‌های بزرگِ پرخواندن — دفتر قیمت (`prices`) و اقلام هر سورس (`source_items:*`). KV تا حدود ۶۰ ثانیه دیر به‌روز می‌شود، که برای قیمت‌ها اشکالی ندارد.

ساخت (یک بار):

```bash
cd api
npx wrangler d1 create realrate
npx wrangler kv namespace create realrate-prices
```

شناسه‌هایی که چاپ می‌شود را در `api/wrangler.toml` (`database_id` و `id`) بگذارید. جدول‌ها با اولین درخواست به ورکر خودکار ساخته می‌شوند (`api/src/repositories/d1Schema.js`)؛ برای دیدن SQL آن‌ها: `cd api && npm run db:schema`. اجرای محلی (`npm run api:dev`) از D1 و KV محلی wrangler استفاده می‌کند و چیزی لازم ندارد.

### انتقال از Postgres (یک بار، خودکار)

تا وقتی binding `HYPERDRIVE` در `api/wrangler.toml` هست، ورکر خودش داده‌ها را از Postgres به D1 منتقل می‌کند (`api/src/services/pgMigration.service.js`): هر اجرای cron (هر دقیقه) هر چقدر بتواند صفحه‌به‌صفحه کپی می‌کند و تا تمام شدن، همه‌ی درخواست‌های API پیام «در حال انتقال داده‌ها» (503، صفحه‌ی تعمیر) می‌گیرند تا چیزی ثبت نشود که از قلم بیفتد. پیشرفت: `GET /api/migration-status`. وقتی `phase` شد `done`، سایت خودش باز می‌شود؛ بعد binding `HYPERDRIVE` را از `wrangler.toml` حذف کنید.

همه‌ی جدول‌ها منتقل می‌شوند؛ `price_history` به `price_daily` تبدیل می‌شود (آخرین قیمت هر روز)، و از `app_state` فقط تنظیمات سورس‌ها — دفتر قیمت و اقلام سورس‌ها با اولین اجراهای cron بعد از انتقال در KV ساخته می‌شوند. ردیفی بزرگ‌تر از ۲ مگابایت منتقل نمی‌شود و در `oversized` گزارش می‌شود.

راه دستی (اگر به Postgres دسترسی مستقیم دارید): `DATABASE_URL=… node api/scripts/pg-to-d1.mjs d1-import` و بعد `wrangler d1 execute realrate --remote --file` برای هر فایل.

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

## اعلان‌های مرورگر (Web Push با VAPID)

برای ارسال اعلان‌های مرورگر (وب‌سایت، دسکتاپ و PWA آیفون)، سرور از استاندارد VAPID (RFC 8292) و رمزنگاری وب‌پوش (RFC 8291) استفاده می‌کند. جفت‌کلید VAPID را یک‌بار بسازید و به‌صورت secret در ورکر ذخیره کنید:

```bash
# تولید جفت‌کلید VAPID با ابزار استاندارد
npx web-push generate-vapid-keys

# سپس کلیدها را در Cloudflare Workers ذخیره کنید:
cd api
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
# ایمیل پشتیبانی برای فیلد sub در VAPID (اختیاری؛ پیش‌فرض: mailto:support@realrate.ir)
npx wrangler secret put VAPID_SUBJECT
```

بدون این کلیدها، اعلان مرورگر غیرفعال می‌ماند و کلاینت‌ها پیام عدم پیکربندی سرور را دریافت می‌کنند.

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
