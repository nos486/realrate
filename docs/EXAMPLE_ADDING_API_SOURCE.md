# راهنمای جامع: اتصال یک وب‌سرویس جدید و استخراج نرخ (بر اساس قرارداد نهایی ISourceAdapter)

این راهنما گام‌به‌گام نحوه فراخوانی یک وب‌سرویس جدید (مانند BRS API) و استخراج نرخ دلخواه (مثلاً قیمت تومانی یا دلاری تتر) را با دو رویکرد منطبق بر معماری یکپارچه سامانه شرح می‌دهد:
1. **روش اول (سریع - درون کانفیگ):** استفاده از پارسر مسیردهی JsonPath یا فانکشن پارسر اختصاصی (`customParser`).
2. **روش دوم (ماژولار - ساخت آداپتور مستقل):** پیاده‌سازی کامل اینترفیس `ISourceAdapter`.

---

## ۱. بررسی ساختار خروجی API نمونه

آدرس وب‌سرویس:
`https://api.brsapi.ir/Market/Gold_Currency.php`
*(نکته امنیتی: کلید دسترسی `key` به صورت خودکار از متغیر محیطی `env.BRS_API_KEY` تزریق می‌شود)*

پاسخ JSON نمونه این وب‌سرویس شامل آرایه‌های زیر است:
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

## ۲. روش اول: استفاده از پارسر مسیردهی JsonPath (ساده و بدون کدنویسی)

کافی است در فایل [`api/src/config/sources.config.js`](file:///Users/sina/Projects/realrate/api/src/config/sources.config.js) رکورد سورس زیر را اضافه نمایید:

```javascript
  // ── سورس تتر تومانی با پارسر مسیردهی JsonPath ──
  {
    id: "src_brs_usdt_toman",
    name: "دلار تتر (BRS API)",
    brand: "تتر",
    priceType: "USDT",
    sourceType: "api_url",
    endpoint: "https://api.brsapi.ir/Market/Gold_Currency.php",
    jsonPath: "currency[symbol=USDT_IRT].price", // فیلتر خودکار بر اساس ویژگی نماد
    category: "currency",
    unit: "تومان",
    fetchIntervalSec: 60,
    isActive: true,
    isPrimary: true,
    displayConfig: { showOnHomePage: true },
  },
```

---

## ۳. روش دوم: استفاده از فانکشن پارسر اختصاصی (`customParser`)

اگر ساختار API پیچیده‌تر است، می‌توانید مستقیماً یک تابع جاوااسکریپت درون همان آبجکت سورس تعریف کنید:

```javascript
  {
    id: "src_brs_usdt_custom",
    name: "دلار تتر (پارسر اختصاصی)",
    brand: "تتر",
    priceType: "USDT",
    sourceType: "api_url",
    endpoint: "https://api.brsapi.ir/Market/Gold_Currency.php",
    category: "currency",
    unit: "تومان",
    fetchIntervalSec: 60,
    isActive: true,
    isPrimary: true,

    /**
     * @param {object} data - داده JSON دریافت شده از وب‌سرویس
     * @param {object} sourceConfig - کانفیگ همین سورس
     * @returns {number|Array<{id: string, name: string, price: number}>}
     */
    customParser: (data, sourceConfig) => {
      const tetherItem = data?.currency?.find(item => item.symbol === "USDT_IRT");
      if (!tetherItem || !tetherItem.price) {
        throw new Error("آیتم تتر در پاسخ وب‌سرویس یافت نشد.");
      }
      return Number(tetherItem.price);
    },
  },
```

---

## ۴. روش سوم: ساخت آداپتور ماژولار مستقل (`ISourceAdapter`)

برای کپسوله‌سازی کامل منطق یک تأمین‌کننده خارجی جدید:

### گام ۱: ساخت فایل آداپتور
در مسیر `api/src/services/market/sources/brsTether.source.adapter.js`:

```javascript
import { USER_AGENT } from "./parsingUtils.js";

export const brsTetherAdapter = {
  id: "brs_tether",
  name: "آداپتور اختصاصی تتر BRS",

  supports(sourceConfig) {
    return sourceConfig.sourceType === "brs_tether";
  },

  async fetchRaw(sourceConfig) {
    const res = await fetch(sourceConfig.endpoint, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    return await res.json();
  },

  /**
   * خروجی تابع parse همیشه باید دقیقاً آرایه‌ای از آیتم‌ها با { id, name, price } و datetime باشد.
   */
  parse(rawJson, sourceConfig) {
    const item = rawJson.currency?.find((c) => c.symbol === "USDT_IRT");
    const price = item ? Number(item.price) : 0;

    return {
      items: [
        {
          id: sourceConfig.id,
          name: sourceConfig.name,
          price,
        },
      ],
      datetime: new Date().toISOString(),
    };
  },

  /**
   * متد واحد دریافت اقلام منبع
   */
  async getItems(env) {
    // بازگرداندن داده‌های کش‌شده یا فراخوانی مستقیم
    return [];
  },
};
```

### گام ۲: ثبت در ایندکس آداپتورها
در فایل [`api/src/services/market/sources/index.js`](file:///Users/sina/Projects/realrate/api/src/services/market/sources/index.js):

```javascript
import { brsTetherAdapter } from "./brsTether.source.adapter.js";

export const sourceAdapters = [
  brsTetherAdapter,
  forexApiSourceAdapter,
  bourseSymbolsSourceAdapter,
  emofidFundsSourceAdapter,
  charismaFundsSourceAdapter,
  charismaPlansSourceAdapter,
  telegramSourceAdapter,
  apiUrlSourceAdapter,
];
```

---

## ۵. نحوه راستی‌آزمایی و تست

1. **اجرای آزمون تطابق سراسری:**
   ```bash
   npm test
   ```
   تست‌های `adaptersContract.test.js` به صورت خودکار آداپتور شما را ارزیابی کرده و انطباق فرمت خروجی `{ items: [{ id, name, price }], datetime }` را تایید می‌کنند.

2. **تست آنلاین در پنل مدیریت (`/admin`):**
   سورس جدید بلافاصله در جدول فیدها ظاهر شده و با دکمه **«بروزرسانی نرخ»** تست استخراج زنده را اجرا خواهد کرد.
