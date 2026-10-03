# بک‌اند RealRate (`api/`)

یک Cloudflare Worker بدون فریم‌ورک که API برنامه، همگام‌سازی قیمت‌ها و ذخیره‌ی داده‌ی رمزشده را انجام می‌دهد.
English: [docs/en/PROJECT_STRUCTURE.md](../docs/en/PROJECT_STRUCTURE.md) · [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)

| مؤلفه | فناوری | کاربرد |
| :--- | :--- | :--- |
| اجرا | Cloudflare Workers | REST API (`/api/...` و `/api/v1/...`) و جاب کرون |
| پایگاه‌داده | Cloudflare D1 (`DB`) | کاربران، نشست‌ها، گاوصندوق و رکوردهای رمزشده، تاریخچه‌ی قیمت |
| کش | Workers KV (`KV`) | دفتر قیمت (`prices`) و خروجی هر سورس (`source_items:*`)؛ شمارنده‌ها و سهمیه‌ها در D1 (`app_state`) |
| زمان‌بندی | Cron Triggers | همگام‌سازی قیمت‌ها هر دقیقه (`jobs/cronPolling.job.js`) |
| هوش مصنوعی | Gemini (`GEMINI_API_KEY`) | اسکن چک |
| ایمیل | Resend (`RESEND_API_KEY`) | تأیید ایمیل و بازیابی رمز |
| تست | Vitest | آزمون‌های واحد و یکپارچه در `tests/unit` |

## ساختار `src/`

```text
src/
├── index.js         # ورودی Worker: CORS، CSRF، گیت‌ها (تعمیر، دمو، رمزنگاری) و روتینگ؛ scheduled برای کرون
├── config/          # سورس‌های قیمت، دسته‌ها، بانک‌ها، ویژگی‌ها (features.js)، محدودیت استفاده، هوش مصنوعی، env
├── domain/          # منطق خالص، بیشترش مشترک با وب (symlink): دفتر قیمت (priceBook، priceGuard، priceIds)،
│                    #   فرمول‌ها و موتور نمایش، وام (loanCalculator، loanDocument، loanFunding)، چک،
│                    #   هزینه و حساب، پیامک بانک (bankSms، bankSmsTemplates)، clientInfo، چیدمان‌ها
├── handlers/        # کنترلرهای HTTP هر بخش (auth، portfolio، transaction، loan، income، cheque،
│                    #   chequeScan، bank، vault، homeLayout، demo، admin، adminUser، market)
├── repositories/    # دسترسی به D1 و KV؛ جدول‌ها در d1Schema.js و خودکار ساخته می‌شوند
├── services/        # market/ (ادپتورهای سورس، sourceSync.service.js) و ai/ (Gemini)
├── jobs/            # جاب کرون
├── lib/             # auth، appAuth (ورود اپ)، encryptionGate، demoGate، maintenance، features، usageQuota،
│                    #   email، security، logger، AppError
└── middlewares/     # withErrorHandler
```

## اصول

- **قیمت‌ها**: هر سورس (کد-محور در `config/sources.config.js`) با یک ادپتور `ISourceAdapter` خوانده می‌شود؛ `sourceSync.service.js` در هر تیک سورس‌های سررسیده را می‌گیرد، قیمت‌های نامعقول را نگه می‌دارد (`priceGuard`) و **دفتر قیمت** یکپارچه (`domain/priceBook.js`) را در KV (کلید `prices`) می‌نویسد. همه‌ی مسیرها و صفحه‌ها فقط از همین دفتر می‌خوانند.
- **داده‌ی مالی فقط رمزشده**: `lib/encryptionGate.js` هیچ ذخیره‌ی بدون رمزی را نمی‌پذیرد؛ رکوردها در `vault_records` با فقط تاریخ و والد بدون رمز ([E2EE_VAULT.md](../docs/E2EE_VAULT.md)).
- **همگام‌سازی افزایشی** برای نسخه‌ی آفلاین اپ: `GET /api/vault/sync` با سنگ‌قبر حذف‌ها.
- **ویژگی‌ها** با `requireFeature` و **سهمیه‌ها** با `consumeQuota`.
- مرجع کامل مسیرها: [docs/API.md](../docs/API.md).

## دستورها

```bash
npm run dev          # wrangler dev روی :8787 (D1 و KV محلی wrangler)
npm test             # Vitest
npm run db:schema    # چاپ SQL جدول‌ها
npm run deploy       # انتشار دستی (معمولاً Workers Builds با مرج در main منتشر می‌کند)
```

برای توسعه بدون سرویس ایمیل: `npx wrangler dev --var EMAIL_DEBUG_LOG:true` (متن ایمیل‌ها در لاگ). راه‌اندازی کامل: [docs/SETUP.md](../docs/SETUP.md).
