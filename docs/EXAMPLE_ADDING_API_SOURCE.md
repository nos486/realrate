# راهنمای جامع: اتصال یک وب‌سرویس جدید و استخراج نرخ (با JsonPath یا فانکشن پارسر اختصاصی)

این راهنما گام‌به‌گام نحوه فراخوانی یک وب‌سرویس جدید (مانند BRS API) و استخراج نرخ دلخواه (مثلاً قیمت تومانی یا دلاری تتر) را با دو رویکرد شرح می‌دهد:
1. **روش اول (بدون کدنویسی):** استفاده از پارسر مسیردهی JsonPath.
2. **روش دوم (کدنویسی اختصاصی):** نوشتن فانکشن پارسر دلخواه (`customParser`) یا ساخت آداپتور مجزا.

---

## ۱. بررسی ساختار خروجی API نمونه

آدرس وب‌سرویس:
`https://api.brsapi.ir/Market/Gold_Currency.php`
*(نکته امنیتی: کلید دسترسی `key` به صورت خودکار از متغیر محیطی `env.BRS_API_KEY` یا `.dev.vars` تزریق می‌شود و نیازی به هاردکد کردن آن در آدرس نیست)*

پاسخ JSON این وب‌سرویس شامل ۳ آرایه اصلی است:
```json
{
  "currency": [
    {
      "symbol": "USDT_IRT",
      "name": "دلار تتر",
      "price": 233325,
      "unit": "تومان"
    },
    { "symbol": "USD", "name": "دلار", "price": 228600, "unit": "تومان" }
  ],
  "cryptocurrency": [
    {
      "symbol": "USDT",
      "name": "تتر",
      "price": "0.9996",
      "unit": "دلار"
    }
  ]
}
```

---

## ۲. روش اول: استفاده از پارسر هوشمند JsonPath (ساده و بدون کد جدید)

اگر نخواهید هیچ کد یا تابعی بنویسید، کافی است در فایل [`api/src/config/sources.config.js`](file:///Users/sina/Projects/realrate/api/src/config/sources.config.js) سورس زیر را اضافه کنید:

```javascript
  // ── سورس تتر تومانی با پارسر هوشمند ──
  {
    id: "src_brs_usdt_toman",
    name: "دلار تتر (BRS API)",
    priceType: "USDT",
    sourceType: "api_url",
    endpoint: "https://api.brsapi.ir/Market/Gold_Currency.php",
    jsonPath: "currency[symbol=USDT_IRT].price", // فیلتر خودکار بر اساس نماد
    fetchIntervalSec: 60,
    isActive: true,
    isPrimary: true,
  },
```

---

## ۳. روش دوم: نوشتن فانکشن پارسر اختصاصی (`customParser`)

اگر ساختار API پیچیده است، نیاز به محاسبات ریاضی یا تبدیل واحد دارید، یا مایل نیستید از فرمت‌های متنی JsonPath استفاده کنید، می‌توانید **مستقیماً یک تابع جاوااسکریپت اختصاصی (`customParser`)** درون همان آبجکت سورس بنویسید:

### فایل مورد ویرایش:
👉 **فقط:** [`api/src/config/sources.config.js`](file:///Users/sina/Projects/realrate/api/src/config/sources.config.js)

```javascript
  // ── سورس تتر با فانکشن پارسر اختصاصی ──
  {
    id: "src_brs_usdt_custom",
    name: "دلار تتر (پارسر اختصاصی)",
    priceType: "USDT",
    sourceType: "api_url",
    endpoint: "https://api.brsapi.ir/Market/Gold_Currency.php",
    fetchIntervalSec: 60,
    isActive: true,
    isPrimary: true,

    /**
     * فانکشن پارسر اختصاصی شما:
     * @param {object} data - کل شیء JSON دریافت شده از وب‌سرویس
     * @param {object} sourceConfig - کانفیگ همین سورس
     * @returns {number|object} - عدد قیمت نهایی، یا آبجکت استاندارد { price, datetime, label }
     */
    customParser: (data, sourceConfig) => {
      // ۱. جستجو در آرایه ارزها بر اساس کلید دلخواه
      const tetherItem = data?.currency?.find(item => item.symbol === "USDT_IRT");

      if (!tetherItem || !tetherItem.price) {
        throw new Error("آیتم تتر در پاسخ وب‌سرویس یافت نشد.");
      }

      // ۲. برگرداندن مستقیم عدد قیمت (تومان)
      return Number(tetherItem.price);
    },
  },
```

### قرارداد خروجی تابع `customParser`:
تابع شما می‌تواند یکی از دو خروجی زیر را بازگرداند:
1. **یک عدد ساده:** مثلاً `return 233325;` (سیستم خودکار تاریخ و برچسب را تکمیل می‌کند).
2. **یک آبجکت کامل:**
   ```javascript
   return {
     price: 233325,
     datetime: new Date().toISOString(),
     label: "دلار تتر آزاد",
   };
   ```

---

## ۴. روش سوم: ساخت آداپتور ماژولار مستقل (`ISourceAdapter`)

اگر می‌خواهید منطق اتصال و اعتبارسنجی را به طور کامل در یک فایل مجزا کپسوله کنید:

### گام ۱: ساخت فایل آداپتور جدید
در مسیر `api/src/services/market/sources/brsTether.source.adapter.js`:

```javascript
import { USER_AGENT } from "./parsingUtils.js";

export const brsTetherAdapter = {
  id: "brs_tether",
  name: "آداپتور اختصاصی تتر BRS",

  // بررسی می‌کند که آیا سورس باید توسط این آداپتور پردازش شود یا خیر
  supports(sourceConfig) {
    return sourceConfig.sourceType === "brs_tether";
  },

  // دریافت داده خام از سرور
  async fetchRaw(sourceConfig) {
    const res = await fetch(sourceConfig.endpoint, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    return await res.json();
  },

  // پارس و استخراج قیمت
  parse(rawJson, sourceConfig) {
    const item = rawJson.currency?.find(c => c.symbol === "USDT_IRT");
    const price = item ? Number(item.price) : 0;

    return {
      price,
      datetime: new Date().toISOString(),
      label: sourceConfig.name || "تتر BRS",
    };
  },
};
```

### گام ۲: رجیستر کردن در ایندکس آداپتورها
در فایل [`api/src/services/market/sources/index.js`](file:///Users/sina/Projects/realrate/api/src/services/market/sources/index.js):

```javascript
import { brsTetherAdapter } from "./brsTether.source.adapter.js";

export const sourceAdapters = [
  brsTetherAdapter, // اضافه شدن به لیست آداپتورها
  forexApiSourceAdapter,
  bourseSymbolsSourceAdapter,
  telegramSourceAdapter,
  apiUrlSourceAdapter,
];
```

### گام ۳: استفاده در `sources.config.js`
```javascript
{
  id: "src_brs_tether",
  name: "تتر تومانی",
  priceType: "USDT",
  sourceType: "brs_tether", // همان شناسه supports آداپتور
  endpoint: "https://api.brsapi.ir/Market/Gold_Currency.php",
  fetchIntervalSec: 60,
  isActive: true,
  isPrimary: true,
}
```

---

## ۵. نحوه راستی‌آزمایی و تست

1. **تست با دستور اتوماتیک:**
   ```bash
   npm test
   ```
2. **مشاهده در پنل ادمین (`/admin`):**
   سورس بلافاصله در جدول فیدها ظاهر شده و با دکمه **«بروزرسانی نرخ»** تست آنلاین انجام می‌شود.
