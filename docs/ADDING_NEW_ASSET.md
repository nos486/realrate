# راهنمای جامع افزودن دارایی و کارت جدید به سامانه و صفحه اصلی (RealRate Asset Integration Guide)

این مستند نحوه افزودن یک دارایی جدید به سیستم قیمت‌گذاری، پورتفو، ماشین‌حساب و به‌ویژه **کارت‌های صفحه اصلی (`currency-cards-grid`)** را به صورت گام‌به‌گام و استاندارد شرح می‌دهد.

---

## 🎯 اصول بنیادین معماری (Core Architecture Principles)
1. **عمومی و ماژولار (Generic Design):** هیچ نام یا فرمولی نباید به صورت ایستا (Hardcoded) در کامپوننت‌های بصری نوشته شود. تمامی دارایی‌ها مشخصات خود را از **کانونیکال اسپک (Canonical Asset Specs)** دریافت می‌کنند.
2. **مرجع واحد حقیقت (Single Source of Truth):** مشخصات دارایی (نام، نماد، پرچم، واحد، دسته‌بندی و الیاس‌ها) در یک جا تعریف می‌شوند و در کل سیستم (بک‌اند، فرانت‌اند، جستجو، پورتفو و لیست کارت‌ها) به اشتراک گذاشته می‌شوند.
3. **پشتیبانی از چند ارزی (Multi-Currency Support):** کارت‌ها می‌توانند دارایی‌هایی با واحد **تومان** یا **دلار** (یا هر واحد دیگر) را نمایش دهند و معادل تومانی را در زیرنویس کارت به صورت پویا محاسبه کنند.

---

## ۱. ثبت مشخصات کانونیکال دارایی (Domain Specs)

فایل‌های مشخصات دارایی بر اساس دسته‌بندی در مسیر `api/src/domain/specs/` قرار دارند:
- **طلا و مشتقات**: `api/src/domain/specs/gold.spec.js`
- **نقره و مشتقات**: `api/src/domain/specs/silver.spec.js`
- **انواع سکه**: `api/src/domain/specs/coin.spec.js`
- **ارزهای فیات (فارکس)**: `api/src/domain/specs/forex.spec.js`
- **ارزهای دیجیتال (کریپتو)**: `api/src/domain/specs/crypto.spec.js`

### نمونه ساختار اسپک دارایی:
```javascript
// مثال: تعریف انس طلای جهانی در api/src/domain/specs/gold.spec.js
ons_gold: {
  id: 'ons_gold',
  code: 'XAU',                          // کد استاندارد بین‌المللی
  symbol: 'XAU',
  flag: '🪙',                           // ایموجی یا آیکون دارایی
  name: 'انس طلای جهانی',                // نام رسمی فارسی
  category: 'gold',                     // 'gold' | 'coin' | 'silver' | 'currency' | 'crypto'
  badge: 'انس',
  unit: 'دلار',                         // واحد اصلی مظنه (دلار یا تومان)
  weight: 31.1034768,                  // وزن به گرم
  carat: 24,                            // عیار
  targetBubblePct: 0,
  formulaText: 'نرخ لحظه‌ای هر تروا انس طلا در بازارهای بین‌المللی',
  aliases: ['انس', 'اونس', 'انس طلا', 'اونس طلا', 'طلای جهانی', 'انس جهانی', 'XAU', 'xau'],
}
```

> [!NOTE]
> در `api/src/domain/specs/registry.js` تمامی الیاس‌ها و کدهای تمامی اسپک‌ها به صورت خودکار و پویا در `CANONICAL_ASSET_REGISTRY` ثبت می‌شوند. بنابراین، با افزودن الیاس به فایل اسپک، جستجوی همگانی و سیستم پورتفو فوراً آن را شناسایی خواهند کرد.

---

## ۲. اضافه کردن دارایی به کارت‌های صفحه اصلی (`currency-cards-grid`)

کارت‌های صفحه اول در گرید `currency-cards-grid` (کامپوننت `CurrenciesList.jsx`) رندر می‌شوند. اضافه کردن دارایی به این گرید به یکی از دو روش زیر انجام می‌شود:

### حالت اول: دارایی‌های شاخص جهانی یا محاسبه‌شده (مثل انس طلا، انس نقره، نفت و ...)
این دارایی‌ها مستقیماً در موتور محاسباتی کلاینت (`web/src/utils/calculator.js`) از روی نرخ‌های زنده موجود تولید می‌شوند.

در تابع `calculateMarketData` در فایل `web/src/utils/calculator.js`:
```javascript
// دریافت مشخصات کانونیکال بدون هاردکد
const onsSpec = getCanonicalAssetSpec('ons_gold') || {};
const onsToman = usd_toman > 0 ? Math.round(gold_usd * usd_toman) : 0;

currencies.push({
  code: onsSpec.code || 'XAU',
  id: 'ons_gold',
  priceType: 'ons_gold',
  name: onsSpec.name || 'انس طلای جهانی',
  flag: onsSpec.flag || '🪙',
  symbol: onsSpec.symbol || 'XAU',
  unit: onsSpec.unit || 'دلار',
  price: gold_usd,
  usd_price: gold_usd,
  toman_price: onsToman,
  usd_cross_rate: gold_usd,
  subPriceText: onsToman > 0 ? `${formatNum(onsToman)} تومان` : null,
  note: onsToman > 0 ? `معادل ${formatNum(onsToman)} تومان` : 'نرخ جهانی هر اونس طلا',
  showOnHomePage: true,
  aliases: onsSpec.aliases || ['انس', 'XAU'],
});
```

### حالت دوم: دارایی‌های فید یا وب‌سرویس (ارزها، رمزارزها، صندوق‌ها و نمادهای بورسی)
اگر دارایی از یک فید یا وب‌سرویس خارجی (مانند TGJU، Nobitex، Emofid یا Forex API) استخراج می‌شود:
- در کانفیگ سورس یا فید (`sources.config.js` یا پنل ادمین):
  - فیلد `showOnHomePage: true` را فعال کنید.
  - یا در صورت چندخروجی بودن فید (Multi-Output)، نماد آن را در `homePageOutputs` اضافه نمایید:
  ```json
  {
    "homePageOutputs": ["USD", "EUR", "AED", "XAU", "BTC"]
  }
  ```

---

## ۳. تعیین اولویت و ترتیب نمایش (Display Priority)

برای اینکه دارایی جدید در مکان دلخواه (مثلاً کنار دلار و تتر) در صفحه اول ظاهر شود:

1. **در فایل فرانت‌اند `web/src/features/market/components/CurrenciesList.jsx`:**
   کد نماد را به آرایه `DEFAULT_PRIORITY_CURRENCIES` اضافه کنید:
   ```javascript
   export const DEFAULT_PRIORITY_CURRENCIES = [
     'USD',  // ۱. دلار آمریکا
     'USDT', // ۲. تتر (دلار دیجیتال)
     'XAU',  // ۳. انس جهانی طلا
     'XAG',  // ۴. انس نقره (در صورت تمایل)
     'EUR',  // ۵. یورو
     'AED',  // ۶. درهم امارات
     // ... سایر ارزها
   ];
   ```

2. **در فایل ماشین حساب `web/src/utils/calculator.js`:**
   کد نماد را در `DEFAULT_PRIORITY_ORDER` نیز لحاظ کنید.

---

## ۴. ساختار هوشمند رندر کارت در `CurrenciesList.jsx`

کامپوننت `CurrenciesList` به گونه‌ای طراحی شده که دارایی‌ها را به صورت خودکار و کامپکت نمایش دهد:
- **نمایش قیمت دلاری یا تومانی:**
  ```jsx
  <div className="curr-price-val">
    {formatNum(c.unit === 'دلار' ? (c.usd_price || c.price) : (c.toman_price || c.price))}
    <span className="curr-unit">{c.unit || 'تومان'}</span>
  </div>
  {c.subPriceText && (
    <span className="curr-ratio-tag">{c.subPriceText}</span>
  )}
  ```
- **جستجوی هوشمند بر اساس الیاس‌ها:**
  کاربر می‌تواند با تایپ نام انگلیسی، نماد یا هر یک از الیاس‌های فارسی تعریف‌شده در رجیستری (مانند "اونس"، "طلا"، "XAU") کارت را فیلتر کند.

---

## ۵. مثال عملی: افزودن «انس نقره جهانی» (XAG) در ۳ مرحله

اگر بخواهید انس نقره جهانی را نیز به عنوان یک کارت جدید به صفحه اول اضافه کنید:

1. **بررسی اسپک کانونیکال:**
   در `api/src/domain/specs/silver.spec.js`:
   مطمئن شوید نماد و کد مشخص است (`code: 'XAG', unit: 'دلار', flag: '🥈'`).

2. **اضافه کردن به محاسبات در `web/src/utils/calculator.js`:**
   ```javascript
   if (silver_usd > 0) {
     const silvSpec = getCanonicalAssetSpec('ons_silver') || {};
     const silvToman = usd_toman > 0 ? Math.round(silver_usd * usd_toman) : 0;
     currencies.push({
       code: 'XAG',
       id: 'ons_silver',
       priceType: 'ons_silver',
       name: silvSpec.name || 'انس نقره جهانی',
       flag: silvSpec.flag || '🥈',
       symbol: 'XAG',
       unit: 'دلار',
       price: silver_usd,
       usd_price: silver_usd,
       toman_price: silvToman,
       subPriceText: silvToman > 0 ? `${formatNum(silvToman)} تومان` : null,
       note: silvToman > 0 ? `معادل ${formatNum(silvToman)} تومان` : 'نرخ جهانی هر اونس نقره',
       showOnHomePage: true,
       aliases: silvSpec.aliases || ['نقره', 'XAG'],
     });
   }
   ```

3. **تعیین اولویت در `DEFAULT_PRIORITY_CURRENCIES`:**
   در `CurrenciesList.jsx` مقدار `'XAG'` را به لیست اولویت اضافه کنید.

---

## ۶. بررسی و اعتبارسنجی (Verification)

پس از افزودن هر دارایی جدید، تست‌های پروژه را اجرا کنید:
```bash
# اجرای تست‌های واحد بک‌اند
npm test --workspace=api

# بررسی بیلد بدون خطای فرانت‌اند
npm run build --workspace=web
```
با اجرای دستورات بالا، اطمینان حاصل می‌شود که تمام وابستگی‌ها، ماشین‌حساب و لایوت‌های دسکتاپ و موبایل با موفقیت کامپایل می‌شوند.
