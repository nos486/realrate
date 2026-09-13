# راهنمای افزودن سورس قیمت جدید (Adding a New Price Source)

سامانه RealRate از الگوی **Adapter Pattern** برای سورس‌های نرخ بازار، طلا، ارز و بورس استفاده می‌کند. تمام سورس‌های داده باید اینترفیس استاندارد `ISourceAdapter` را پیاده‌سازی کنند.

---

## اینترفیس استاندارد سورس داده (`ISourceAdapter`)

قرارداد آداپتور در فایل `api/src/adapters/base.js` به صورت زیر تعریف شده است:

```javascript
export class ISourceAdapter {
  constructor(sourceId, name) {
    this.sourceId = sourceId;
    this.name = name;
  }

  /**
   * دریافت و نرمال‌سازی قیمت‌ها از منبع بالادستی
   * @param {Object} env - متغیرهای محیطی Cloudflare Worker
   * @param {Object} [options] - تنظیمات اختیاری مانند timeout یا forced
   * @returns {Promise<Object>} { success: boolean, prices: Object, timestamp: number, metadata?: Object }
   */
  async fetchPrices(env, options = {}) {
    throw new Error('fetchPrices() must be implemented');
  }

  /**
   * بررسی سلامت و در دسترس بودن منبع
   * @param {Object} env
   * @returns {Promise<{ healthy: boolean, latencyMs: number, error?: string }>}
   */
  async healthCheck(env) {
    throw new Error('healthCheck() must be implemented');
  }
}
```

---

## مراحل ایجاد سورس جدید (مثال: صرافی ارز دیجیتال Nobitex)

### مرحله ۱: ایجاد کلاس آداپتور جدید
یک فایل در مسیر `api/src/adapters/crypto/nobitexAdapter.js` ایجاد کنید:

```javascript
import { ISourceAdapter } from '../base.js';

export class NobitexAdapter extends ISourceAdapter {
  constructor() {
    super('nobitex', 'نوبیتکس (نرخ رمزارزها)');
  }

  async fetchPrices(env, options = {}) {
    const startTime = Date.now();
    try {
      const response = await fetch('https://api.nobitex.ir/market/stats', {
        headers: { 'User-Agent': 'RealRate-PriceIngester/1.0' },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        throw new Error(`Nobitex API returned HTTP ${response.status}`);
      }

      const data = await response.json();
      const stats = data.stats || {};

      // نرمال‌سازی به کلیدهای استاندارد ریال‌ریت
      const prices = {};
      if (stats['usdt-rls']?.latest) {
        prices['usdt_toman'] = Math.round(Number(stats['usdt-rls'].latest) / 10);
      }
      if (stats['btc-rls']?.latest) {
        prices['btc_toman'] = Math.round(Number(stats['btc-rls'].latest) / 10);
      }

      return {
        success: true,
        source: this.sourceId,
        prices,
        timestamp: Date.now(),
        latencyMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        success: false,
        source: this.sourceId,
        error: err.message,
        timestamp: Date.now(),
      };
    }
  }

  async healthCheck(env) {
    const start = Date.now();
    try {
      const res = await fetch('https://api.nobitex.ir/market/stats', { method: 'HEAD' });
      return { healthy: res.ok, latencyMs: Date.now() - start };
    } catch (err) {
      return { healthy: false, latencyMs: Date.now() - start, error: err.message };
    }
  }
}
```

---

## مرحله ۲: رجیستر کردن آداپتور در ایندکس آداپتورها

فایل `api/src/adapters/index.js` را باز کرده و آداپتور جدید را ثبت کنید:

```javascript
import { NobitexAdapter } from './crypto/nobitexAdapter.js';

export const sourceAdapters = {
  telegram: new TelegramAdapter(),
  forex: new ForexAdapter(),
  bourse: new BourseAdapter(),
  nobitex: new NobitexAdapter(),
};
```

---

## مرحله ۳: اتصال به سرویس Ingestion و Cron Trigger

سرویس دریافت قیمت‌ها (`api/src/services/priceIngestionService.js`) از روی لیست آداپتورها به طور خودکار سورس‌های فعال را فراخوانی کرده و نتایج را در `priceRepository` ادغام می‌کند.

تست واحد جدیدی در `api/tests/unit/` برای بررسی صحت دریافت و فرمت خروجی آداپتور بنویسید:
```bash
npm test
```
