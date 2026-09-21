# راهنمای افزودن منبع قیمت جدید (Price Source) و قرارداد یکپارچه ادپتورها

در RealRate تمامی منابع قیمت بر اساس اصل **تنها مرجع حقیقت (Single Source of Truth)** به صورت ساختاریافته (Code-First) تعریف و مدیریت می‌شوند.

---

## ۱. ساختار کانفیگ سورس در `sources.config.js`

برای افزودن یک منبع جدید، کافی است آن را به آرایه `PRICE_SOURCES_CONFIG` در فایل [`api/src/config/sources.config.js`](file:///Users/sina/Projects/realrate/api/src/config/sources.config.js) اضافه کنید:

```javascript
// api/src/config/sources.config.js
export const PRICE_SOURCES_CONFIG = [
  {
    id: "src_def_my_source",
    name: "نام رسمی سورس (مثال: صندوق‌های سرمایه‌گذاری کاریزما)",
    brand: "کاریزما",               // برند کوتاه سورس جهت نمایش در پرانتز نام آیتم‌ها
    priceType: "my_source_type",
    sourceType: "api_url",          // یا "telegram", "forex_api", "bourse_symbols", "charisma_funds", ...
    endpoint: "https://api.example.com/rates",
    category: "bourse_fund",        // دسته‌بندی از روی categories.config.js
    unit: "واحد",                   // واحد شمارش دارایی (تومان، گرم، عدد، برگ سهم، واحد، دلار، تتر)
    isFund: true,                   // آیا ماهیت صندوق یا طرح دارد؟
    fetchIntervalSec: 60,           // دوره پولینگ به ثانیه
    isActive: true,
    isPrimary: false,
    displayConfig: { showOnHomePage: true },

    // در صورت نیاز به پردازش سفارشی داده‌های خام:
    customParser: (data, cfg) => {
      // باید آرایه‌ای از آیتم‌ها یا عدد برگرداند
      return data.rates.map(r => ({ id: r.code, name: r.title, price: r.lastPrice }));
    },
  },
];
```

> [!NOTE]
> **تفکیک مسئولیت متادیتا (قاعده معماری):**
> فیلدهای `badge`، `badgeColor` و `iconName` دیگر روی سطح سورس تعریف نمی‌شوند؛ این فیلدها مستقیماً و به صورت خودکار از دسته‌بندی مرجع در [`categories.config.js`](file:///Users/sina/Projects/realrate/api/src/config/categories.config.js) استخراج می‌شوند تا هیچ‌گونه دوگانگی یا Drift در داده‌ها رخ ندهد.

---

## ۲. قرارداد نهایی ادپتورها (Universal Adapter Contract)

هر ادپتور سورس (خواه در `api/src/services/market/sources/` یا به عنوان ادپتور سفارشی) **بدون استثنا** باید قرارداد استاندارد زیر را رعایت کند:

### ساختار اینترفیس `ISourceAdapter`:
1. `id`: شناسه یکتای ادپتور (مانند `telegram`, `api_url`, `forex_api`).
2. `name`: نام فارسی ادپتور.
3. `supports(sourceConfig)`: بررسی اینکه آیا این سورس به این ادپتور تعلق دارد یا خیر.
4. `fetchRaw(sourceConfig, env?)`: دریافت پی‌لود خام (HTML/JSON/Array) از سرور خارجی.
5. `parse(raw, sourceConfig, env?)`: تبدیل پی‌لود خام به ساختار استاندارد.
6. `getItems(env?)`: تابع واحد برای واکشی اقلام جاری ادپتور.

### ساختار الزامی خروجی `parse()`:
```javascript
{
  items: [
    {
      id: "src_def_my_source__item_key", // یا ${sourceId}__${itemKey}
      name: "نام پاکسازی‌شده آیتم",
      price: 154200 // عدد قیمت نهایی به تومان یا دلار
    }
  ],
  datetime: "2026-09-21T10:00:00.000Z" // رشته معتبر ISO 8601
}
```

> [!IMPORTANT]
> **قاعده اقلام تک‌نرخی و چندنرخی:**
> حتی سورس‌های تک‌مقداری (مانند دلار آزاد، طلای ۱۸ عیار، سکه امامی) نیز خروجی `parse` را در قالب آرایه یک‌عضوی `items: [{ id, name, price }]` برمی‌گردانند.

---

## ۳. قرارداد شناسه‌ها (Universal ID Contract)

برای تمام اقلام و کاتالوگ‌ها، شناسه با الگوی زیر تولید و خوانده می‌شود:
$$\text{ID} = \$\{sourceId\}\_\_\$\{itemKey\}$$

- **مثال‌ها:**
  - `src_def_bourse__فولاد` (نماد فولاد از سورس بورس)
  - `src_def_charisma__اهرم` (صندوق اهرم از سورس کاریزما)
  - `src_def_charisma_plans__gold` (طرح طلا از سورس کاریزما)
  - `src_def_emofid__عیار` (صندوق عیار از سورس مفید)
  - `src_def_usd` (سورس‌های تک‌نرخی کانونیکال)

---

## ۴. موتور مرکزی نمایش (Display Engine)

هیچ بخشی از فرانت‌اند یا لایه روت‌ها نباید نام سورس یا واحد را به صورت دستی یا شرط‌های `if / switch` رندر کند. تمام فرآیند نمایش از طریق [`displayEngine.js`](file:///Users/sina/Projects/realrate/api/src/domain/displayEngine.js) (که در فرانت‌اند نیز به صورت `web/src/config/displayEngine.js` در دسترس است) انجام می‌شود:

```javascript
import {
  getItemDisplayName, // قالب‌بندی استاندارد "{نام آیتم} ({نام سورس})"
  getItemUnit,        // استخراج واحد اندازه‌گیری از کانفیگ سورس
  getItemCategory,    // استخراج دسته‌بندی معتبر از کانفیگ سورس
  getItemBadge,       // استخراج بج فارسی از categories.config.js
  getCategoryColor,   // استخراج رنگ بصری بج (amber, emerald, indigo, ...)
  getCategoryIconName,// استخراج نام آیکون Lucide (Award, Coins, TrendingUp, ...)
  getSourceBrand,     // استخراج برند سورس (بورس، کاریزما، مفید، زرما...)
} from "../config/displayEngine.js";

// مثال کاربرد:
const displayName = getItemDisplayName({ id: "src_def_bourse__فولاد", name: "فولاد مبارکه" });
// خروجی: "فولاد مبارکه (بورس)"

const unit = getItemUnit("src_def_gold_18k");
// خروجی: "گرم"

const category = getItemCategory("src_def_charisma__اهرم");
// خروجی: "bourse_fund"

const badge = getItemBadge("src_def_charisma__اهرم");
// خروجی: "صندوق"
```

---

## ۵. جریان ذخیره‌سازی و ارکستراسیون یکپارچه

```
┌─────────────────────────────────────────────────────────┐
│ Cloudflare Cron Trigger (هر دقیقه)                      │
└───────────────────────────┬─────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│ syncAllSources(env) در sourceSync.service.js            │
│ (حذف فراخوانی‌های تکراری اندپوینت‌های مشترک)            │
└─────────┬───────────────────────────────────────────────┘
          │
          ├─► fetchRaw()  ──► parse() ──► { items, datetime }
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│ saveSourceItems(env, sourceId, items)                   │
│ (ذخیره‌سازی یکدست در KV Cache و جدول D1 Mirror)          │
└─────────────────────────────────────────────────────────┘
```

با این معماری، افزودن هر سورس جدید به سیستم تنها با اضافه کردن رکورد آن در `sources.config.js` انجام شده و کلیه بخش‌های پولینگ، کش، پایگاه‌داده، API کاتالوگ و UI بدون نیاز به هیچ کد اضافی فوراً با آن هماهنگ می‌گردند.
