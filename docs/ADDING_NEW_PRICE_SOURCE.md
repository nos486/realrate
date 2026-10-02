# راهنمای افزودن منبع قیمت جدید (Price Source) و قرارداد یکپارچه ادپتورها

در RealRate تمامی منابع قیمت بر اساس اصل **تنها مرجع حقیقت (Single Source of Truth)** به صورت ساختاریافته (Code-First) تعریف و مدیریت می‌شوند.

---

## ۱. ساختار کانفیگ سورس در `sources.config.js`

برای افزودن یک منبع جدید، کافی است آن را به آرایه `PRICE_SOURCES_CONFIG` در فایل [`api/src/config/sources.config.js`](../api/src/config/sources.config.js) اضافه کنید:

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
    // اختیاری: واحد مظنه‌ی سورس — "toman" (پیش‌فرض)، "rial"، "usd"، "usd_cross"
    // quote: "usd",
    // اختیاری: برای کاتالوگ، بازاری که شناسه‌ها به آن تعلق دارند ("bourse" → "bourse__<نماد>")
    // market: "bourse",
    // اختیاری — محافظ قیمت نامعقول و قدیمی شدن:
    // maxJumpPct: 25,              // بیشترین تغییر بین دو دریافت (٪)؛ بیشتر از این تا تکرار نشود پذیرفته نمی‌شود
    // confirmTicks: 3,             // چند دریافت پشت‌سرهم تا جهش واقعی پذیرفته شود
    // staleAfterSec: 1800,         // پس از این مدت بدون دریافت موفق، قیمت «قدیمی» علامت می‌خورد
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
> فیلدهای `badge`، `badgeColor` و `iconName` دیگر روی سطح سورس تعریف نمی‌شوند؛ این فیلدها مستقیماً و به صورت خودکار از دسته‌بندی مرجع در [`categories.config.js`](../api/src/config/categories.config.js) استخراج می‌شوند تا هیچ‌گونه دوگانگی یا Drift در داده‌ها رخ ندهد.

در پنل مدیریت فقط می‌توان سورس را خاموش کرد یا سورس اصلی شناسه‌اش کرد (در Postgres، کلید `price_source_overrides`)؛ سورس آنجا ساخته یا حذف نمی‌شود.

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
      id: "item_key", // نماد یا کد خود آیتم؛ پیشوند بازار را دفتر قیمت اضافه می‌کند
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

شناسه نام دارایی است، نه سورس: فولاد همیشه همان فولاد است، از هر سورسی که بیاید.
برای اقلام کاتالوگ: `${market}__${symbol}` که `market` در کانفیگ سورس تعیین می‌شود.

- **مثال‌ها:**
  - `bourse__فولاد` (نماد فولاد، از هر سورسی)
  - `bourse__اهرم` و `bourse__عیار` (صندوق‌های قابل معامله: همان شناسه بورس)
  - `charisma_plan__gold` (طرح طلای کاریزما)
  - `usd`، `usdt`، `gold_18k` (سورس‌های تک‌نرخی: priceType)
- اگر دو سورس یک شناسه را بدهند، اولی (سورس اصلی، به ترتیب کانفیگ) همان شناسه را می‌گیرد و نسخه بقیه `${sourceId}__${id}` می‌شود.
- شناسه‌ها یک شکل دارند: حروف کوچک، ي/ك عربی به ی/ک، ارقام فارسی به 0–9، بدون نیم‌فاصله.

---

## ۴. موتور مرکزی نمایش (Display Engine)

هیچ بخشی از فرانت‌اند یا لایه روت‌ها نباید نام سورس یا واحد را به صورت دستی یا شرط‌های `if / switch` رندر کند. تمام فرآیند نمایش از طریق [`displayEngine.js`](../api/src/domain/displayEngine.js) (که در فرانت‌اند نیز به صورت `web/src/config/displayEngine.js` در دسترس است) انجام می‌شود:

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
const displayName = getItemDisplayName({ id: "bourse__فولاد", name: "فولاد مبارکه" });
// خروجی: "فولاد مبارکه (بورس)"

const unit = getItemUnit("gold_18k");
// خروجی: "گرم"

const category = getItemCategory("src_def_charisma__اهرم") // شناسه قدیمی هم خوانده می‌شود;
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
│ (ذخیره‌سازی یکدست در Postgres: source_items و دفتر قیمت)    │
└─────────────────────────────────────────────────────────┘
```

با این معماری، افزودن هر سورس جدید به سیستم تنها با اضافه کردن رکورد آن در `sources.config.js` انجام شده و کلیه بخش‌های پولینگ، کش، پایگاه‌داده، API کاتالوگ و UI بدون نیاز به هیچ کد اضافی فوراً با آن هماهنگ می‌گردند.
