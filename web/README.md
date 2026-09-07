# RealRate Web — Frontend (React + Vite SPA)

رابط کاربری مدرن، واکنش‌گرا و سریع سامانه **RealRate** توسعه داده شده با React 19، Vite و Vanilla CSS.

---

## 🚀 ویژگی‌ها

- 🎨 **طراحی Dark Mode مدرن** با جلوه‌های Glassmorphism و فونت فارسی وزیری (Vazirmatn)
- 📊 **تحلیل زنده حباب طلا و انواع سکه** (امامی، بهار آزادی، نیم سکه، ربع سکه، گرمی)
- 💱 **تابلوی نرخ روز ارزهای مطرح جهان** به همراه پرچم و نام هر کشور
- 🧮 **محاسبه‌گر پیشرفته فاکتور طلا** (اجرت، سود طلافروش، مالیات ارزش افزوده)
- 🔐 **ورود اختصاصی با گوگل (Google Sign-In)** و کنترل سطح دسترسی مدیر/کاربر
- 🛠️ **پنل مدیریت جامع (Admin Dashboard)**: مشاهده آمار لحظه‌ای بازدید/کاربران آنلاین، لیست کاربران ثبت‌نام شده، و ویرایش مقادیر پیش‌فرض دلار/انس/حباب‌ها

---

## 🛠️ راه‌اندازی در محیط توسعه (Local Development)

### ۱. تنظیم متغیرهای محیطی
فایل `.env.local` را بررسی کنید:
```bash
# در محیط لوکال، VITE_API_URL خالی بماند تا درخواست‌های api/* توسط Vite به ورکر (localhost:8787) پراکسی شوند
VITE_API_URL=
VITE_GOOGLE_CLIENT_ID=420432138114-sfg3n1k34ke674192pct6envne50o1c7.apps.googleusercontent.com
```

### ۲. اجرای پروژه
```bash
# اجرای جداگانه فرانت‌اند
npm run dev

# یا از روت پروژه:
npm run web:dev
```
سپس مرورگر را در آدرس [http://localhost:5173](http://localhost:5173) باز کنید.

---

## 📦 بیلد و استقرار (Production Build & Deploy)

### بیلد پروژه:
```bash
npm run build
```

### استقرار روی Cloudflare Pages:
```bash
npm run deploy
```
یا از طریق اتصال مستقیم ریپازیتوری گیت‌هاب به Cloudflare Pages با تنظیمات زیر:
- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Root directory:** `web`
- **Environment variables:**
  - `VITE_API_URL`: آدرس ورکر بک‌اند شما (مثلاً `https://realrate-api.workers.dev`)
  - `VITE_GOOGLE_CLIENT_ID`: شناسه کلاینت گوگل شما
