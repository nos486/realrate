# فرانت‌اند و اپ اندروید RealRate (`web/`)

یک React 19 SPA (Vite 8) که هم سایت و PWA است و هم، با Capacitor 8، اپ اندروید.
English: [docs/en/PROJECT_STRUCTURE.md](../docs/en/PROJECT_STRUCTURE.md) · [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)

| مؤلفه | فناوری |
| :--- | :--- |
| رابط | React 19، React Router 7، lucide-react، @dnd-kit (کشیدن و رها کردن) |
| استایل | CSS خالص با توکن‌ها (`src/styles/tokens.css`)، تم تیره، فونت وزیرمتن؛ استاندارد: [DESIGN.md](../docs/DESIGN.md) |
| تاریخ | تقویم شمسی با توابع مشترک `domain/loanCalculator.js` |
| رمزنگاری | Web Crypto (PBKDF2 + AES-GCM) در `src/lib/e2ee.js` و `src/shared/vault/` |
| اندروید | Capacitor 8 (`capacitor.config.json`، پروژه‌ی `android/`) و افزونه‌های Java برای پیامک و اثر انگشت |
| میزبانی | Cloudflare Pages (سایت)، GitHub Releases (APK) |

## ساختار `src/`

```text
src/
├── pages/           # MainPage (همه‌ی بخش‌ها)، LandingPage، SharedPortfolioPage، AdminPage، MaintenancePage
├── features/        # home، market، news، portfolio، transactions، expenses، accounts، loans، incomes، cheques،
│                    #   subscriptions، reports، alerts، sms-inbox و app-settings (فقط اپ)، auth، demo، admin
├── shared/          # ui (از جمله RowCard و BlockingOverlay)، api (httpClient)، vault (رمزنگاری)، offline (نسخه‌ی محلی)،
│                    #   native (پل‌های بومی)، app (قاب اپ)، refresh (تازه‌سازی و TabLoadingGate)، currency (نرخ روز رکورد)،
│                    #   categories، banks، features (Feature Flags)، hooks، utils، pwa
├── components/      # Header، Footer، MobileNavDrawer، UniversalAssetSearch، تنظیمات حساب
├── config/, utils/  # symlink به api/src (پیکربندی و منطق مشترک) — PROJECT_STRUCTURE.md
├── seo/pages.js     # محتوای صفحه‌های ایستای SEO (از جمله /android)
└── styles/          # یک فایل CSS برای هر بخش؛ app-shell.css برای اپ
```

- **قیمت‌ها** فقط از `GET /api/prices/book` می‌آیند (`features/market/priceBookAssets.js`، `PricingContext`)؛ مرورگر قیمتی حساب نمی‌کند جز ماشین‌حساب «نرخ مبنا».
- **داده‌ی مالی** از مسیر `shared/vault/*` رمز و ذخیره می‌شود؛ هر بخش یک `...Api.js` با امضای ثابت دارد.
- **ارزها**: جدول ارزها `utils/currencies.js` است (symlink)؛ تبدیل به تومان با «کیف نرخ‌ها»ی `features/market/useFxRates.js` از تاریخچه‌ی روزانه‌ی قیمت در روز هر رکورد، و فرم‌ها نرخ همان روز را فقط نمایش می‌دهند (`shared/currency/useDayRate.js`، `DayRateHint.jsx`) — هیچ رکوردی نرخ ذخیره نمی‌کند.
- **بارگذاری تب**: تا وقتی تبِ تازه‌باز‌شده منتظر سرور است، `shared/refresh/TabLoadingGate.jsx` صفحه را با یک لودر می‌پوشاند (درخواست‌های در جریان از `httpClient.subscribeRequests`)؛ پس از ۱۲ ثانیه «ادامه بدون صبر».
- **اپ** (`isNativeApp()`): قاب با نوار پایین (`shared/app/`)، داشبورد شخصی در خانه، پیامک بانک، اثر انگشت و نسخه‌ی آفلاین — [ANDROID.md](../docs/ANDROID.md).

## دستورها

```bash
npm run dev            # http://localhost:5173 (پیش‌نمایش حالت اپ در مرورگر: ?app=1)
npm run build          # dist/ + صفحه‌های ایستای SEO (scripts/build-seo.mjs)
npm test               # آزمون‌های صفحه‌های SEO
npm run lint           # oxlint
npm run build:app      # بیلد اپ در dist-app
npm run android:sync   # build:app + کپی در پروژه‌ی اندروید (سپس npx cap open android)
```

`VITE_API_URL` آدرس API و `VITE_GOOGLE_CLIENT_ID` شناسه‌ی ورود با گوگل است؛ `VITE_APP_VERSION` را بیلد APK می‌گذارد. آزمون‌های واحد وب (Vitest، happy-dom) در `api/tests/unit` اجرا می‌شوند.
