# راهنمای افزودن سورس قیمت جدید (معماری کد-محور / Code-First)

سامانه RealRate از معماری **کد-محور (Code-First)** برای تعریف و مدیریت تمامی سورس‌های قیمت استفاده می‌کند. تمامی فیدها به صورت اعلانی در کد تعریف شده و با گیت نسخه می‌شوند. قیمت‌های استخراج‌شده در حافظه سریع Cloudflare KV کش می‌شوند.

---

## ۱. فایل مرجع سورس‌ها (`api/src/config/sources.config.js`)

تمامی سورس‌ها (طلا، سکه، ارز، بورس و فارکس) در آرایه `PRICE_SOURCES_CONFIG` درون فایل [`api/src/config/sources.config.js`](file:///Users/sina/Projects/realrate/api/src/config/sources.config.js) تعریف می‌شوند.

### ساختار استاندارد یک سورس قیمت

```javascript
{
  id: "src_def_ons_gold",           // شناسه یکتا
  name: "انس طلا جهانی (XAU)",       // نام نمایشی فارسی
  priceType: "ons_gold",           // کلید متناظر در CANONICAL_ASSET_REGISTRY
  sourceType: "api_url",           // نوع آداپتور: 'telegram' | 'api_url' | 'forex' | 'bourse'
  endpoint: "https://api.gold-api.com/price/XAU", // آدرس وب‌سرویس یا یوزرنیم کانال تلگرام
  regex: "",                       // الگوی استخراج (برای تلگرام یا خروجی متنی)
  jsonPath: "price",               // کلید در خروجی JSON (برای api_url)
  fieldMapping: null,              // نگاشت فیلدهای چندگانه (اختیاری)
  excludedOutputs: [],             // کدهای مستثنی شده (اختیاری)
  displayConfig: { showOnHomePage: true }, // تنظیمات نمایش
  fetchIntervalSec: 60,            // بازه فراخوانی به ثانیه
  isActive: true,                  // وضعیت فعال/غیرفعال بودن
  isPrimary: true,                 // آیا سورس مرجع پیش‌فرض برای این دارایی است؟
}
```

---

## ۲. انواع آداپتورهای استاندارد موجود

آداپتورهای پیش‌فرض در مسیر `api/src/services/market/sources/` پیاده‌سازی شده‌اند:

1. **`telegram`** ([`telegramSource.adapter.js`](file:///Users/sina/Projects/realrate/api/src/services/market/sources/telegramSource.adapter.js)):
   - دریافت نرخ از کانال‌های تلگرامی معتبر بازار بدون نیاز به ربات.
   - پارامتر `endpoint`: آیدی کانال بدون `@` (مثال: `zarmagoldd` یا `tahran_sabza`).
2. **`api_url`** ([`apiUrl.source.adapter.js`](file:///Users/sina/Projects/realrate/api/src/services/market/sources/apiUrl.source.adapter.js)):
   - دریافت نرخ از هرگونه وب‌سرویس REST و JSON عمومی یا سفارشی.
   - پارامتر `jsonPath`: کلید استخراج نرخ (مثال: `price` یا `rates.USD`).
3. **`forex`** ([`forexApi.source.adapter.js`](file:///Users/sina/Projects/realrate/api/src/services/market/sources/forexApi.source.adapter.js)):
   - فید چندمقداری ارزهای معتبر بین‌المللی با نرخ برابری جهانی (Open ER-API).
4. **`bourse`** ([`bourseSymbols.source.adapter.js`](file:///Users/sina/Projects/realrate/api/src/services/market/sources/bourseSymbols.source.adapter.js)):
   - فید تجمیعی نمادها و صندوق‌های بورس اوراق بهادار تهران (TSETMC / BRS API).

---

## ۳. افزودن سورس جدید به سیستم

### مثال ۱: افزودن سورس جدید از طریق API عمومی
اگر می‌خواهید قیمت بیت‌کوین یا نقره را از یک وب‌سرویس جدید دریافت کنید، کافی است به انتهای آرایه `PRICE_SOURCES_CONFIG` در `sources.config.js` اضافه کنید:

```javascript
{
  id: "src_my_silver_api",
  name: "نقره جهانی (سورس پشتیبان)",
  priceType: "ons_silver",
  sourceType: "api_url",
  endpoint: "https://api.example.com/silver",
  jsonPath: "data.rate",
  fetchIntervalSec: 120,
  isActive: true,
  isPrimary: false,
}
```

### مثال ۲: افزودن کانال تلگرامی جدید
```javascript
{
  id: "src_tg_tala_channel",
  name: "طلای ۱۸ عیار (کانال پشتیبان)",
  priceType: "gold_18k",
  sourceType: "telegram",
  endpoint: "my_gold_channel",
  regex: "طلای ۱۸ عیار[\\s\\S]*?([\\d,]+)",
  fetchIntervalSec: 60,
  isActive: true,
  isPrimary: false,
}
```

### مثال ۳: سورس چندمقداری (Multi-Output) با مشخص کردن اقلام صفحه اصلی
برای سورس‌هایی که خروجی چند آیتمی دارند (مانند فارکس، رمزارزها، بورس و...)، می‌توانید اقلام مشخصی را برای نمایش در صفحه اصلی تعیین کنید:

```javascript
{
  id: "src_def_forex",
  name: "نرخ‌های جهانی فارکس (Open ER-API)",
  priceType: "forex",
  sourceType: "forex_api",
  endpoint: "https://open.er-api.com/v6/latest/USD",
  jsonPath: "rates",
  displayConfig: {
    showOnHomePage: true,
    // لیست دقیق نمادهایی که می‌خواهید در صفحه اصلی (لیست ارزها) نمایش داده شوند:
    homePageOutputs: ["EUR", "AED", "TRY", "GBP", "CHF", "CAD", "AUD", "CNY", "JPY"],
  },
  fetchIntervalSec: 300,
  isActive: true,
  isPrimary: true,
}
```
> [!TIP]
> اگر `homePageOutputs` تعیین نشود و `showOnHomePage: true` باشد، کلیه اقلام فید مجاز خواهند بود. در صورت تعیین آرایه، تنها نمادهای موجود در این آرایه در صفحه اول قرار می‌گیرند و سایر اقلام برای تبدیل ارز و پورتفوی فعال باقی می‌مانند.

---

## ۴. راستی‌آزمایی و تست سورس

1. **اجرای تست‌های واحد:**
   ```bash
   npm test
   ```
2. **تست و مشاهده در پنل مدیریت (`/admin`):**
   - به تب **«سورس‌های قیمت»** بروید.
   - سورس تعریف‌شده در کد به‌صورت خودکار در جدول ظاهر می‌شود.
   - با کلیک روی دکمه **«بروزرسانی نرخ»**، صحت اتصال و نرخ استخراج‌شده را به‌صورت زنده مشاهده کنید.
