# راهنمای افزودن سورس قیمت جدید (معماری کد-محور / Code-First)

سامانه RealRate از معماری **کد-محور (Code-First)** و اصل **تنها مرجع حقیقت (Single Source of Truth)** برای تعریف و مدیریت تمامی سورس‌های قیمت استفاده می‌کند. 

> [!IMPORTANT]
> تمامی تعاریف، نوع‌ها، دسته‌بندی‌ها، واحدها و نشان‌های سورس‌ها منحصراً در فایل مرجع [`api/src/config/sources.config.js`](file:///Users/sina/Projects/realrate/api/src/config/sources.config.js) قرار دارند. برای افزودن یک سورس جدید (تک‌نرخی یا کاتالوگ چندنرخی)، **هیچ نیازی به ویرایش سایر فایل‌های سیستم (مانند `registry.js` یا `catalogFeeds.service.js`) نیست**. تمامی بخش‌های سامانه (جستجوی سراسری، پورتفو، رصد لحظه‌ای و پنل ادمین) مشخصات را به صورت خودکار و داده‌محور از همین فایل می‌خوانند.

---

## ۱. فایل مرجع سورس‌ها (`api/src/config/sources.config.js`)

تمامی سورس‌ها در آرایه `PRICE_SOURCES_CONFIG` تعریف می‌شوند.

### فیلدهای استاندارد هر سورس:

| فیلد | نوع | توضیحات |
| :--- | :--- | :--- |
| `id` | `string` | شناسه یکتای سورس با پیشوند `src_def_` (مثال: `src_def_ons_gold`) |
| `name` | `string` | نام نمایشی کامل و رسمی سورس به فارسی |
| `priceType` | `string` | کلید متناظر در دارایی‌ها یا نام اختصاصی فید (مثال: `gold_18k`, `bourse`, `charisma_plans`) |
| `sourceType` | `string` | نوع آداپتور مصرفی: `api_url` \| `telegram` \| `forex_api` \| `bourse_symbols` \| `charisma_plans` \| ... |
| `category` | `string` | دسته‌بندی پورتفو: `bourse_fund` \| `bourse` \| `gold` \| `coin` \| `silver` \| `currency` \| `crypto` |
| `badge` | `string` | برچسب نمایشی در نتایج جستجو و جداول (مثال: `صندوق`، `طرح`، `بورس`، `طلا`، `ارز`) |
| `unit` | `string` | واحد اندازه‌گیری و ثبت در پورتفو (مثال: `واحد`، `برگ سهم`، `گرم`، `تومان`) |
| `isFund` | `boolean` | آیا ماهیت صندوق یا طرح سرمایه‌گذاری دارد؟ (`true` / `false`) |
| `isCatalog` | `boolean` | آیا سورس حاوی چند نماد یا کاتالوگ نمادها است؟ (`true` / `false`) |
| `endpoint` | `string` | آدرس وب‌سرویس REST/Webhook یا آیدی کانال تلگرام بدون `@` |
| `regex` | `string` | الگوی RegEx استخراج برای تلگرام یا خروجی‌های متنی |
| `jsonPath` | `string` | مسیر کلید در خروجی JSON (برای `api_url`) |
| `knownSymbols` | `Array` | لیست نمادهای شاخص این سورس جهت تفکیک و جستجوی هوشمند (اختیاری) |
| `customParser` | `function` | تابع پارسر اختصاصی در صورت پیچیده بودن ساختار داده ورودی (اختیاری) |
| `displayConfig`| `object` | تنظیمات نمایش (`showOnHomePage`, `homePageOutputs`) |
| `fetchIntervalSec` | `number` | بازه فراخوانی خودکار به ثانیه |
| `isActive` | `boolean` | وضعیت فعال/غیرفعال بودن در سیستم |
| `isPrimary` | `boolean` | آیا سورس مرجع پیش‌فرض برای این دارایی است؟ |

---

## ۲. مثال‌های کاربردی افزودن سورس

### مثال ۱: افزودن سورس تک‌نرخی از طریق API عمومی
```javascript
{
  id: "src_my_silver_api",
  name: "نقره جهانی (سورس کمکی)",
  priceType: "ons_silver",
  sourceType: "api_url",
  category: "silver",
  badge: "نقره",
  unit: "اونس",
  endpoint: "https://api.example.com/silver",
  jsonPath: "data.rate",
  fetchIntervalSec: 120,
  isActive: true,
  isPrimary: false,
}
```

### مثال ۲: افزودن کانال تلگرامی جدید برای طلا یا ارز
```javascript
{
  id: "src_tg_tala_channel",
  name: "طلای ۱۸ عیار (کانال تستی)",
  priceType: "gold_18k",
  sourceType: "telegram",
  category: "gold",
  badge: "طلا",
  unit: "گرم",
  endpoint: "my_gold_channel",
  regex: "طلای ۱۸ عیار[\\s\\S]*?([\\d,]+)",
  fetchIntervalSec: 60,
  isActive: true,
  isPrimary: false,
}
```

### مثال ۳: افزودن فید کاتالوگی صندوق‌های سرمایه‌گذاری یا طرح‌ها (Multi-Item Catalog)
برای افزودن یک فید تجمیعی جدید (مانند صندوق‌های کارگزاری فارابی یا طرح‌های سرمایه‌گذاری جدید):
```javascript
{
  id: "src_def_farabi_funds",
  name: "صندوق‌های سرمایه‌گذاری فارابی (Farabi)",
  priceType: "farabi_funds",
  sourceType: "api_url",
  category: "bourse_fund",       // به صورت خودکار زیر «صندوق‌های سرمایه‌گذاری» در پورتفو قرار می‌گیرد
  badge: "صندوق",
  unit: "واحد",
  isFund: true,
  isCatalog: true,
  endpoint: "https://api.irfarabi.com/v1/funds",
  jsonPath: "data",
  fetchIntervalSec: 1800,
  isActive: true,
  isPrimary: true,
  customParser: (data, sourceConfig) => {
    const rawList = Array.isArray(data) ? data : (data?.data || []);
    return {
      isCatalog: true,
      totalCount: rawList.length,
      items: rawList.map(item => ({
        symbol: item.symbol,
        name: item.title || item.name,
        priceToman: Number(item.nav),
        priceRial: Number(item.nav) * 10,
        unit: "واحد",
        isFund: true,
        category: "bourse_fund",
        badge: "صندوق",
      })),
      compactList: rawList,
      sampleItems: rawList.slice(0, 50),
      datetime: new Date().toISOString(),
    };
  },
}
```

---

## ۳. چرخه حیات داده و نحوه مصرف خودکار در سیستم

وقتی یک سورس در `sources.config.js` تعریف می‌شود:
1. **سرویس کاتالوگ ([catalogFeeds.service.js](file:///Users/sina/Projects/realrate/api/src/services/market/catalogFeeds.service.js)):**
   مقادیر `category`، `badge` و `unit` را مستقیماً از فیلدهای همان آبجکت استخراج کرده و به دارایی‌ها نسبت می‌دهد.
2. **ثبت و تشخیص در پورتفو ([registry.js](file:///Users/sina/Projects/realrate/api/src/domain/specs/registry.js)):**
   تابع `getSourceCategoryConfig` به صورت خودکار پیشوند شناسه دارایی (مثلاً `farabi_funds__...`) را با شناسه سورس مطابقت داده و دسته‌بندی تعریف‌شده در کانفیگ (مثلاً `bourse_fund`) را بدون هیچ شروط هاردکد شده اعمال می‌کند.
3. **جستجوی سراسری ([UniversalAssetSearch.jsx](file:///Users/sina/Projects/realrate/web/src/components/UniversalAssetSearch.jsx)):**
   فیلترهای دسته‌بندی و بج‌های رنگی را مستقیماً بر اساس متادیتای سورس نمایش می‌دهد.
4. **پنل مدیریت سورس‌ها (`/admin`):**
   سورس بلافاصله در جدول فیدها قرار گرفته و امکان تست نرخ زنده یا فعال/غیرفعال کردن آن در دسترس است.

---

## ۴. راستی‌آزمایی سورس جدید

1. **اجرای تست‌های پروژه:**
   ```bash
   npm test
   ```
2. **بررسی بیلد فرانت‌اند:**
   ```bash
   cd web && npm run build
   ```
3. **بررسی در پنل مدیریت:**
   در مسیر `/admin` به تب «سورس‌های قیمت» مراجعه کرده و با کلیک روی «بروزرسانی نرخ»، دریافت درست داده‌ها را بررسی کنید.
