# ساختار پروژه

مخزن یک **npm workspaces monorepo** با دو بخش است: `api/` (Cloudflare Worker) و `web/` (React 19 + Vite).
فایل‌های پیکربندی و منطق مشترک فقط در `api/` نوشته می‌شوند و `web/` از طریق **symlink** همان فایل‌ها را استفاده می‌کند.

```text
realrate/
├── package.json                  # اسکریپت‌های مشترک (dev، test، deploy)
├── docs/                         # مستندات
│
├── api/                          # بک‌اند: Cloudflare Worker (D1 + KV)
│   ├── wrangler.toml             # بایندینگ‌ها، متغیرها و Cron
│   ├── schema.sql                # اسکیمای D1 (ساخت خودکار با migration.repository)
│   ├── tests/
│   │   ├── helpers/              # ابزار تست (مثل D1 شبیه‌سازی‌شده وام‌ها)
│   │   └── unit/                 # آزمون‌های Vitest
│   └── src/
│       ├── index.js              # روتینگ و ورودی Worker (fetch + scheduled)
│       ├── config/               # مراجع واحد: سورس‌ها، دسته‌بندی‌ها، بانک‌ها، ثابت‌ها
│       ├── domain/               # منطق خالص: فرمول‌ها، موتور نمایش، محاسبه وام، سند وام
│       ├── handlers/             # کنترلرهای HTTP (بازار، احراز هویت، پورتفو، تراکنش،
│       │                         #   وام، درآمد، بانک، رمزنگاری، ادمین)
│       ├── repositories/         # دسترسی به داده D1/KV (الگوی Repository)
│       ├── services/market/      # دریافت نرخ‌ها: ادپتورهای سورس و ارکستراتور پولینگ
│       ├── jobs/                 # جاب کرون
│       ├── lib/                  # احراز هویت، امنیت، خطا، لاگ، CORS
│       └── middlewares/          # مدیریت خطا
│
└── web/                          # فرانت‌اند: React SPA (PWA)
    └── src/
        ├── App.jsx, main.jsx     # روت‌ها و مونت برنامه
        ├── pages/                # صفحه اصلی، صفحه عمومی پورتفو، لندینگ، ادمین
        ├── features/             # ماژول‌های قابلیت‌محور:
        │                         #   market، portfolio، transactions، loans، incomes، auth، admin
        ├── shared/
        │   ├── ui/               # کامپوننت‌های پایه (Modal، Button، DonutChart، Skeleton، ...)
        │   ├── api/              # httpClient
        │   ├── banks/            # انتخاب‌گر و لوگوی بانک، بانک‌های سفارشی
        │   ├── vault/            # رمزنگاری سرتاسری حساب (وضعیت، مهاجرت، ذخیره رمزشده)
        │   └── pwa/              # نصب و به‌روزرسانی PWA
        ├── lib/e2ee.js           # توابع رمزنگاری (Web Crypto)
        ├── config/               # symlink به api/src/config
        ├── utils/                # symlink به منطق مشترک (loanCalculator، loanDocument، ...)
        └── styles/               # توکن‌ها و استایل‌ها (تم تیره)
```

## فایل‌های مشترک (symlink)

| فایل در `web/src` | منبع در `api/src` |
| :--- | :--- |
| `config/*.config.js`، `config/displayEngine.js` | `config/`، `domain/displayEngine.js` |
| `utils/loanCalculator.js` | `domain/loanCalculator.js` |
| `utils/loanDocument.js` | `domain/loanDocument.js` |
| `utils/financialSpecs.js` | `lib/financialSpecs.js` |

برای تغییر هر کدام، فایل مبدأ در `api/` را ویرایش کنید.
