# راهنمای افزودن منبع قیمت جدید (Price Source) و معماری SourceRegistry

در RealRate تمام متادیتا مربوط به منابع قیمت بر اساس اصل **تنها مرجع حقیقت (Single Source of Truth)** در یک فایل متمرکز تعریف می‌شوند:

```js
// api/src/config/sources.config.js
export const PRICE_SOURCES_CONFIG = [
  {
    id: "src_def_my_new_source",
    name: "نام فارسی منبع",
    priceType: "my_new_source",
    sourceType: "telegram",          // یا "api_url", "charisma_plans", "bourse_symbols" و غیره
    endpoint: "my_endpoint",
    category: "bourse_fund",         // یا "custom", "bourse", "gold", "silver" و غیره
    badge: "طرح",                    // (اختیاری) برچسب نمایشی
    unit: "واحد",                    // (اختیاری) واحد پیش‌فرض
    isFund: false,                   // آیا ماهیت صندوق یا طرح دارد؟
    isCatalog: true,                 // اگر خروجی کاتالوگی از آیتم‌هاست
    knownSymbols: ["gold", "silver"],// (اختیاری) نمادهای شناخته‌شده
    knownItems: {
      gold:   { name: "طرح طلا",   unit: "واحد", badge: "طرح" },
      silver: { name: "طرح نقره", unit: "واحد", badge: "طرح" },
    },
    customParser: (data, cfg) => {
      // در صورت نیاز به پردازش خاص خروجی کاتالوگ
      return { isCatalog: true, items: [...] };
    },
    fetchIntervalSec: 1800,
    isActive: true,
    isPrimary: false,
    displayConfig: { showOnHomePage: true },
  },
];
```

---

## جریان داده در سامانه (Architecture Data Flow)

```
┌──────────────────────────────────────┐
│     api/src/config/sources.config.js │ (تعریف پیکربندی و متادیتای سورس‌ها)
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│     api/src/config/sourceRegistry.js │ (رجیستری مرکزی و متدهای Resolve)
└──────┬────────────────────────┬──────┘
       │                        │
       ▼                        ▼
┌──────────────┐         ┌──────────────┐
│ Backend APIs │         │ Web Frontend │
│ & Adapters   │         │ (UI/Holdings)│
└──────────────┘         └──────────────┘
```

---

## مراحل افزودن منبع قیمت جدید

1. **افزودن شی منبع به `PRICE_SOURCES_CONFIG`**:
   یک شی جدید مطابق ساختار بالا به آرایه `PRICE_SOURCES_CONFIG` در فایل [`sources.config.js`](file:///Users/sina/Projects/realrate/api/src/config/sources.config.js) اضافه کنید.
2. **سفارشی‌سازی پارسر (اختیاری)**:
   اگر منبع ساختار داده متفاوتی دارد، تابع `customParser` را در همان شی تعریف کنید؛ در غیر این صورت نیازی به آن نیست.
3. **ثبت تغییرات (Git Commit)**:
   تمام بخش‌های UI و Backend (پورتفو، فرم ثبت دارایی، فرم تراکنش، فیدها و پنل مدیریت سورس‌ها) به طور خودکار از این تنظیمات استفاده می‌کنند و **هیچ نیازی به دستکاری سایر فایل‌ها نیست**.

---

## نحوه استفاده از رجیستری در کدها

تمامی بخش‌های سامانه به طور یکپارچه از متدهای کمکی [`sourceRegistry.js`](file:///Users/sina/Projects/realrate/api/src/config/sourceRegistry.js) (یا نسخه Re-export شده در وب [`web/src/utils/sourceRegistry.js`](file:///Users/sina/Projects/realrate/web/src/utils/sourceRegistry.js)) استفاده می‌کنند:

```javascript
import {
  resolveAssetDisplayName,
  resolveAssetUnit,
  resolveCategory,
  getSourceConfig,
} from "./sourceRegistry.js";

// استخراج نام فارسی دارایی
const name = resolveAssetDisplayName("charisma_plans__gold"); // 'طرح طلا'

// استخراج واحد شمارش دارایی
const unit = resolveAssetUnit("charisma_plans__gold");        // 'واحد'

// استخراج دسته‌بندی
const category = resolveCategory("charisma_plans__gold");    // 'bourse_fund'

// دریافت تنظیمات کامل سورس
const config = getSourceConfig("charisma_plans");
```

---

## فیلدهای متادیتای هر سورس

| فیلد | نوع | توضیحات |
| :--- | :--- | :--- |
| `id` | `string` | شناسه یکتای سورس با پیشوند `src_def_` |
| `name` | `string` | نام نمایشی کامل و رسمی سورس به فارسی |
| `priceType` | `string` | کلید متناظر در دارایی‌ها یا نام فید |
| `sourceType` | `string` | نوع آداپتور: `api_url`, `telegram`, `forex_api`, `bourse_symbols`, `charisma_plans`, ... |
| `category` | `string` | دسته‌بندی پورتفو: `bourse_fund`, `bourse`, `gold`, `coin`, `silver`, `currency`, `crypto` |
| `badge` | `string` | برچسب نمایشی در نتایج و جداول (مثال: `صندوق`, `طرح`, `طلا`, `ارز`) |
| `unit` | `string` | واحد اندازه‌گیری دارایی (مثال: `واحد`, `برگ سهم`, `گرم`, `تومان`) |
| `isFund` | `boolean` | آیا ماهیت صندوق یا طرح سرمایه‌گذاری دارد؟ |
| `isCatalog` | `boolean` | آیا سورس حاوی کاتالوگی از آیتم‌های مجزاست؟ |
| `endpoint` | `string` | آدرس وب‌سرویس REST/Webhook یا آیدی کانال تلگرام بدون `@` |
| `knownSymbols` | `Array` | لیست نمادهای شاخص این سورس |
| `knownItems` | `object` | نگاشت مشخصات نمادها به نام فارسی، واحد و برچسب |
| `customParser` | `function` | تابع پارسر اختصاصی اختیاری |
| `fetchIntervalSec` | `number` | بازه فراخوانی خودکار به ثانیه |
| `isActive` | `boolean` | وضعیت فعال/غیرفعال بودن سورس |
| `isPrimary` | `boolean` | آیا سورس مرجع پیش‌فرض برای این نوع دارایی است؟ |
