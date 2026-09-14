# راهنمای عملی: اتصال یک وب‌سرویس جدید و استخراج قیمت تتر

این راهنما گام‌به‌گام نحوه فراخوانی یک وب‌سرویس جدید (مانند BRS API) و استخراج نرخ دلخواه (مثلاً قیمت تومانی یا دلاری تتر) را شرح می‌دهد.

---

## بررسی ساختار خروجی API نمونه

آدرس وب‌سرویس:
`https://api.brsapi.ir/Market/Gold_Currency.php?key=BDqzgcZZ5rGg4Z6uSEs9bMyx2E2vXrkd`

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

## کدام فایل‌ها باید ویرایش شوند؟

در معماری **کد-محور (Code-First)** سیستم ریال‌ریت:

### سناریوی ۱: دارایی از قبل در سیستم تعریف شده است (مانند تتر USDT)
اگر دارایی در `CANONICAL_ASSET_REGISTRY` وجود داشته باشد (تتر با کد `USDT` از قبل در `crypto.spec.js` تعریف شده است):

👉 **فقط ۱ فایل ادیت می‌شود:**
- **مسیر:** [`api/src/config/sources.config.js`](file:///Users/sina/Projects/realrate/api/src/config/sources.config.js)

کافی است این بلوک را به انتهای بخش سورس‌های تک‌مقداری اضافه کنید:

```javascript
  // ── سورس جدید: تتر تومانی از BRS API ──
  {
    id: "src_brs_usdt_toman",
    name: "دلار تتر (BRS API)",
    priceType: "USDT",
    sourceType: "api_url",
    endpoint: "https://api.brsapi.ir/Market/Gold_Currency.php?key=BDqzgcZZ5rGg4Z6uSEs9bMyx2E2vXrkd",
    jsonPath: "currency[symbol=USDT_IRT].price", // فیلتر خودکار در آرایه
    regex: "",
    fieldMapping: null,
    excludedOutputs: [],
    displayConfig: { showOnHomePage: true },
    fetchIntervalSec: 60,
    isActive: true,
    isPrimary: true,
  },
```

> **نکته هوشمند در JsonPath:**  
> سیستم از فرمت `currency[symbol=USDT_IRT].price` پشتیبانی می‌کند؛ یعنی حتی اگر ترتیب آیتم‌ها در آرایه عوض شود، بر اساس کلید `symbol` آیتم تتر را پیدا کرده و فیلد `price` را برمی‌دارد.
> 
> اگر قیمت دلاری تتر مدنظرتان باشد، کافی است بنویسید:  
> `jsonPath: "cryptocurrency[symbol=USDT].price"`

---

### سناریوی ۲: دارایی کاملاً جدید است و قبلاً در سامانه نبوده
اگر بخواهید دارایی جدیدی که تاکنون در سیستم نبوده (مثلاً یک رمزارز یا فلز جدید مثل پلاتین) اضافه کنید:

👉 **۲ فایل ادیت می‌شود:**

1. **ثبت هویت دارایی (نام، نماد، پرچم، دسته):**
   - **فایل:** [`api/src/domain/specs/crypto.spec.js`](file:///Users/sina/Projects/realrate/api/src/domain/specs/crypto.spec.js) (یا `gold.spec.js`)
   ```javascript
   NEW_COIN: {
     id: 'NEW_COIN',
     code: 'NEW_COIN',
     name: 'کوین جدید',
     symbol: 'NC',
     unit: 'عدد',
     category: 'crypto',
     badge: 'رمزارز',
   },
   ```

2. **ثبت سورس استخراج قیمت:**
   - **فایل:** [`api/src/config/sources.config.js`](file:///Users/sina/Projects/realrate/api/src/config/sources.config.js)
   (همانند سناریوی ۱).

---

## نحوه تست و راستی‌آزمایی سورس جدید

### ۱. تست با دستور خودکار
یک فایل تست سریع با vitest وجود دارد:
```bash
npm test
```

### ۲. مشاهده زنده در پنل مدیریت (`/admin`)
پس از اضافه کردن سورس در `sources.config.js`:
1. وارد پنل ادمین شوید: `http://localhost:5173/admin`
2. سورس جدید در جدول فیدها نمایش داده می‌شود.
3. با زدن دکمه **«بروزرسانی نرخ»**، قیمت زنده دریافت شده و وضعیت سبز می‌شود.
