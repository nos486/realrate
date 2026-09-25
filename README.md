# 🪙 RealRate

<div align="center">

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Cloudflare D1](https://img.shields.io/badge/DB-Cloudflare_D1-0A84FF?style=flat-square&logo=sqlite&logoColor=white)](https://developers.cloudflare.com/d1/)
[![Vitest](https://img.shields.io/badge/Tests-Vitest-FCC72B?style=flat-square&logo=vitest&logoColor=black)](https://vitest.dev/)
![License: MIT](https://img.shields.io/badge/License-MIT-34D399?style=flat-square)

![RealRate — تحلیل نرخ‌ها و حباب](./realrate_1.png)

</div>

**RealRate** سامانه تحلیل بازار طلا، سکه و ارز و مدیریت مالی شخصی است که روی لبه Cloudflare اجرا می‌شود:
ارزش ذاتی و حباب طلا و سکه، نرخ ارزها و بورس، و مدیریت پورتفو، وام‌ها، درآمدها و چک‌ها با رمزنگاری سرتاسری.

## امکانات

- **بازار**: ارزش ذاتی و حباب طلا و سکه، ۱۶ ارز و تتر، نمادهای بورس و صندوق‌ها — با به‌روزرسانی خودکار
- **پورتفو**: پورتفوهای چندگانه، تراکنش خرید/فروش با میانگین موزون، سود و زیان زنده، اشتراک عمومی
- **وام‌ها**: جدول اقساط، پرداخت و پرداخت اضافه، بانک‌های استاندارد با لوگو و نمودار سهم بانک‌ها
- **درآمدها**: ثبت و گزارش به تفکیک دسته و ماه
- **چک‌ها**: چک‌های دریافتی و صادره، سررسید، پیگیری وضعیت با سوابق و یادآوری
- **رمزنگاری سرتاسری حساب**: همه داده‌های مالی در مرورگر رمز می‌شوند؛ سرور فقط متن رمزشده را می‌بیند
- **حساب کاربری**: ورود با گوگل یا ایمیل و رمز عبور (با تأیید ایمیل و بازیابی رمز)
- **PWA**: قابل نصب و کار با آخرین قیمت‌ها در حالت آفلاین

جزئیات: [docs/FEATURES.md](docs/FEATURES.md)

![RealRate — پورتفو](./realrate_2.png)

## شروع سریع

```bash
git clone https://github.com/nos486/realrate.git
cd realrate
npm install
npm run dev    # API: http://localhost:8787 — وب: http://localhost:5173
npm test
```

## استقرار

مرج در `main` هر دو بخش را خودکار منتشر می‌کند: فرانت‌اند روی Cloudflare Pages و بک‌اند با Cloudflare Workers Builds.
انتشار دستی بک‌اند در صورت نیاز: `npm run api:deploy`.
راهنمای کامل (D1، KV، ورود با گوگل، Pages، Workers): [docs/SETUP.md](docs/SETUP.md)

## مستندات

| سند | موضوع |
| :--- | :--- |
| [FEATURES.md](docs/FEATURES.md) | شرح کامل امکانات |
| [SETUP.md](docs/SETUP.md) | راه‌اندازی محلی، پیکربندی و استقرار |
| [PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) | ساختار مخزن و فایل‌های مشترک |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | معماری و جریان داده |
| [API.md](docs/API.md) | مرجع REST API |
| [E2EE_VAULT.md](docs/E2EE_VAULT.md) | رمزنگاری سرتاسری حساب |
| [ADDING_NEW_ASSET.md](docs/ADDING_NEW_ASSET.md) | افزودن دارایی جدید |
| [ADDING_NEW_PRICE_SOURCE.md](docs/ADDING_NEW_PRICE_SOURCE.md) | افزودن سورس قیمت |

## لایسنس

MIT
