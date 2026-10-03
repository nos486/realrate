# 🪙 RealRate

<div align="center">

**فارسی** · [English](README.en.md)

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![PostgreSQL](https://img.shields.io/badge/DB-PostgreSQL_(Hyperdrive)-336791?style=flat-square&logo=postgresql&logoColor=white)](https://developers.cloudflare.com/hyperdrive/)
[![Android](https://img.shields.io/badge/Android-Capacitor_8-3DDC84?style=flat-square&logo=android&logoColor=white)](docs/ANDROID.md)
[![Vitest](https://img.shields.io/badge/Tests-Vitest-FCC72B?style=flat-square&logo=vitest&logoColor=black)](https://vitest.dev/)
![License: MIT](https://img.shields.io/badge/License-MIT-34D399?style=flat-square)

![RealRate — نرخ و حباب طلا، سکه و ارز](docs/screenshots/web-market.png)

</div>

**RealRate** سامانه تحلیل بازار طلا، سکه و ارز و مدیریت مالی شخصی است که روی لبه Cloudflare اجرا می‌شود:
ارزش ذاتی و حباب طلا و سکه، نرخ ارزها و بورس، و مدیریت پورتفو، هزینه‌ها، حساب‌ها، وام‌ها، درآمدها و چک‌ها — همه با رمزنگاری سرتاسری.
نسخه‌ی وب در [realrate.ir](https://realrate.ir) است و اپ اندروید (با ثبت خودکار هزینه از پیامک بانک) از [صفحه‌ی اپ](https://realrate.ir/android) یا
[آخرین Release](https://github.com/nos486/realrate/releases/latest/download/realrate.apk) دانلود می‌شود.

## امکانات

- **بازار**: ارزش ذاتی و حباب طلا و سکه، ۱۶ ارز و تتر، نمادهای بورس و صندوق‌ها — به‌روزرسانی خودکار و صفحه‌ی اصلی قابل شخصی‌سازی
- **پورتفو**: پورتفوهای چندگانه، تراکنش خرید/فروش با میانگین موزون، سود و زیان زنده، دسته‌های سفارشی، اشتراک عمومی
- **هزینه‌ها**: هزینه‌های روزمره با دسته و بودجه ماهانه، پروژه‌ها با هزینه‌ی تومانی یا دلاری، «پرداخت از» حساب و «تأمین از» وام
- **حساب‌ها**: حساب بانکی، نقد و کیف پول؛ منبع هر هزینه و تطبیق پیامک‌های بانک
- **وام‌ها**: جدول اقساط، پرداخت و پرداخت اضافه، بانک‌ها با لوگو، و «مصرف وام» (هزینه‌ها و خریدهایی که با وام شد و بازده آن‌ها در برابر سود وام)
- **درآمدها**: ثبت و گزارش به تفکیک منبع و ماه؛ دسته‌هایی مثل «مدیریت نقدینگی» خارج از جمع می‌مانند
- **چک‌ها**: دریافتی و صادره، سررسید، پیگیری وضعیت با سوابق، یادآوری و اسکن چک با هوش مصنوعی
- **اپ اندروید**: ناوبری پایین و «ثبت سریع»، خواندن خودکار پیامک برداشت و واریز بانک (بدون خروج متن پیامک از گوشی)، ثبت سریع و خودکار هزینه‌های کوچک، اثر انگشت و کار آفلاین
- **رمزنگاری سرتاسری**: همه داده‌های مالی روی دستگاه کاربر رمز می‌شوند؛ سرور فقط متن رمزشده را می‌بیند
- **حساب کاربری و مدیریت**: ورود با گوگل یا ایمیل، حساب دمو، پنل مدیریت (کاربران، کاربران اپ و نسخه‌هایشان، سورس‌های قیمت)

جزئیات: [docs/FEATURES.md](docs/FEATURES.md)

## تصاویر

| پورتفو | هزینه‌های روزمره |
| :---: | :---: |
| ![پورتفو](docs/screenshots/web-portfolio.png) | ![هزینه‌ها](docs/screenshots/web-expenses.png) |

<div align="center">

| خانه‌ی اپ | هزینه‌ها | پیامک بانک | وام‌ها |
| :---: | :---: | :---: | :---: |
| <img src="docs/screenshots/app-home.png" width="200" alt="خانه‌ی اپ"> | <img src="docs/screenshots/app-expenses.png" width="200" alt="هزینه‌ها در اپ"> | <img src="docs/screenshots/app-sms.png" width="200" alt="پیامک‌های بانک"> | <img src="docs/screenshots/app-loans.png" width="200" alt="وام‌ها در اپ"> |

</div>

## شروع سریع

```bash
git clone https://github.com/nos486/realrate.git
cd realrate
npm install
npm run dev    # API: http://localhost:8787 — وب: http://localhost:5173
npm test
```

برای اجرای محلی یک Postgres لازم است: [docs/SETUP.md](docs/SETUP.md).

## استقرار

مرج در `main` همه‌چیز را خودکار منتشر می‌کند: فرانت‌اند روی Cloudflare Pages، بک‌اند با Cloudflare Workers Builds، و APK امضاشده‌ی اندروید در [Releases](https://github.com/nos486/realrate/releases) (GitHub Actions).
انتشار دستی بک‌اند در صورت نیاز: `npm run api:deploy`.
راهنمای کامل (Postgres، ورود با گوگل، ایمیل، Pages، Workers، کلید امضای اندروید): [docs/SETUP.md](docs/SETUP.md)

## مستندات

| سند | موضوع |
| :--- | :--- |
| [FEATURES.md](docs/FEATURES.md) | شرح کامل امکانات |
| [SETUP.md](docs/SETUP.md) | راه‌اندازی محلی، پیکربندی و استقرار |
| [PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) | ساختار مخزن و فایل‌های مشترک |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | معماری و جریان داده (انگلیسی) |
| [API.md](docs/API.md) | مرجع REST API (انگلیسی) |
| [E2EE_VAULT.md](docs/E2EE_VAULT.md) | رمزنگاری سرتاسری حساب، همگام‌سازی و نسخه‌ی آفلاین |
| [ANDROID.md](docs/ANDROID.md) | اپ اندروید: ساخت، امضا، انتشار، پیامک بانک، اثر انگشت، آفلاین |
| [BANK_SMS.md](docs/BANK_SMS.md) | قالب پیامک بانک‌ها و افزودن بانک جدید |
| [EXPENSES.md](docs/EXPENSES.md) | ساختار داده‌ی هزینه‌ها، حساب‌ها، بودجه و «تأمین از» |
| [DESIGN.md](docs/DESIGN.md) | استاندارد رنگ‌ها و چیدمان صفحه‌ها |
| [ADDING_NEW_ASSET.md](docs/ADDING_NEW_ASSET.md) | افزودن دارایی جدید |
| [ADDING_NEW_PRICE_SOURCE.md](docs/ADDING_NEW_PRICE_SOURCE.md) | افزودن سورس قیمت |

نسخه‌ی انگلیسی همه‌ی مستندات: [docs/en](docs/en/README.md)

## لایسنس

MIT
