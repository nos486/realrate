# راهنمای افزودن دارایی جدید به سیستم (Adding a New Asset)

این راهنما مراحل گام‌به‌گام برای اضافه کردن یک دارایی جدید (مانند طلای ۲۱ عیار، سکه جدید، ارز فیات یا فلز گرانبهای جدید نظیر پلاتین) به سامانه RealRate را شرح می‌دهد.

---

## ۱. ثبت مشخصات دارایی در لایه‌ی مشخصات دامنه (Domain Specs)

مشخصات دارایی‌های استاندارد در فایل کانونی تعریف می‌شوند:
- **مسیر بک‌اند**: `api/src/domain/specs/registry.js`
- **مسیر فرانت‌اند**: `web/src/utils/financialSpecs.js`

### مرحله ۱: افزودن مشخصات به `CANONICAL_ASSET_REGISTRY`

شیء مشخصات دارایی جدید را به `CANONICAL_ASSET_REGISTRY` اضافه کنید:

```javascript
my_new_asset: {
  id: 'my_new_asset',
  name: 'طلای ۲۱ عیار',
  unit: 'گرم',
  category: 'gold',            // یکی از: 'gold' | 'coin' | 'silver' | 'currency' | 'crypto'
  type: 'weight',              // 'weight' یا 'coin' یا 'currency'
  weightGrams: 1.0,            // وزن به گرم
  karat: 21,                   // عیار (برای طلا)
  purity: 21 / 24,             // خلوص
  badge: '۲۱ عیار',            // نشان گرافیکی
  order: 3,                    // اولویت نمایش در لیست
},
```

---

## ۲. اضافه کردن محاسبات فرمول در صورتی که دارایی جدید نیاز به فرمول اختصاصی دارد

اگر دارایی از نوع فلزات قیمتی یا مشتقات سکه باشد:
- **فایل**: `api/src/domain/formulas/financialFormulas.js`
- تابع `calculateIntrinsicValue` به صورت پیش‌فرض از روی `weightGrams` و `karat` ارزش ذاتی را محاسبه می‌کند:

$$\text{ارزش ذاتی} = \text{ارزش طلای ۲۴ عیار} \times \text{وزن به گرم} \times \frac{\text{عیار}}{24}$$

اگر دارایی نیازمند ضریب تبدیل یا حق ضرب است، در این تابع شرط مربوطه را اضافه کنید.

---

## ۳. افزودن قیمت پیش‌فرض یا سورس در صورت وجود

اگر برای دارایی نرخ زنده‌ای از تلگرام، فارکس یا بورس استخراج می‌شود:
- در فایل آداپتور مربوطه (`api/src/adapters/telegram/telegramAdapter.js` یا `forexAdapter.js`) رجکس شناسایی نام یا کد دارایی را اضافه کنید.
- در `api/src/repositories/priceRepository.js` کلید نگاشت آن را در `priceMap` ثبت کنید.

---

## ۴. به‌روزرسانی فرانت‌اند و تست

1. دارایی به صورت خودکار در کامپوننت جستجوی جامع (`UniversalAssetSearch.jsx`) و لیست انواع دارایی در پورتفو نمایش داده خواهد شد.
2. برای اطمینان از صحت محاسبات، تست واحد جدیدی در `api/tests/unit/formulas.test.js` اضافه کنید:

```javascript
it('correctly calculates intrinsic value for my_new_asset', () => {
  const intrinsic = calculateIntrinsicValue('my_new_asset', { gold24kGram: 10_000_000 });
  expect(intrinsic).toBeGreaterThan(0);
});
```

3. اجرای تست‌ها:
```bash
npm test
npm run build --workspace=web
```
