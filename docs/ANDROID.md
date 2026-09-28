# اپ اندروید

اپ اندروید همین برنامه‌ی وب (`web/`) است که با [Capacitor](https://capacitorjs.com) در یک پوسته‌ی اندروید (`web/android`) بسته‌بندی شده است. هر ویژگی جدید سایت، با بیلد بعدی در اپ هم هست؛ فقط قابلیت‌های بومی (مثل خواندن اس‌ام‌اس) کد اندروید جدا دارند.

## ساختار

| مسیر | چیست |
|---|---|
| `web/capacitor.config.json` | شناسه اپ (`ir.realrate.app`)، نام، رنگ نوار وضعیت و اسپلش |
| `web/android/` | پروژه‌ی اندروید (Gradle). آیکون‌ها در `app/src/main/res/mipmap-*` |
| `web/src/shared/native/nativeApp.js` | تفاوت‌های داخل اپ: بدون service worker، رنگ‌ها، لینک‌های اشتراک به سایت، ورود با گوگل |
| `api/src/lib/appAuth.js` | ورود با گوگل از اپ (کد یک‌بارمصرف) |
| `.github/workflows/android.yml` | ساخت خودکار APK |

- صفحات اپ از خود گوشی بارگذاری می‌شوند (نه از سایت): سریع، آفلاین، و کد رمزنگاری همان است که با اپ منتشر شده. مبدأ صفحات `https://localhost` است که API آن را می‌پذیرد.
- مهمان در اپ صفحه‌ی معرفی نمی‌بیند و مستقیم به ورود می‌رود.
- نوار وضعیت و نوار ناوبری اندروید دیده می‌شوند و صفحه بین آن‌هاست: بیلد اپ (`vite build --mode app`) `viewport-fit=cover` را از `index.html` برمی‌دارد، وگرنه Capacitor صفحه را زیر نوار وضعیت می‌کشد (اندروید ۱۵+).
- دکمه‌ی برگشت اندروید همان تاریخچه‌ی صفحه را برمی‌گردد (بستن پنجره‌ها و منوها مثل سایت — `useBackToClose`)؛ در صفحه‌ی اصلی از اپ خارج می‌شود.

## ورود با گوگل در اپ

گوگل ورود داخل WebView را نمی‌پذیرد، پس ورود در مرورگر گوشی انجام می‌شود و با لینک اختصاصی اپ برمی‌گردد. چون هر اپی می‌تواند همان لینک را ثبت کند، آنچه برمی‌گردد نشست نیست، کد یک‌بارمصرفی است که فقط با رمز نزد اپ کار می‌کند (PKCE):

1. اپ یک `verifier` تصادفی نگه می‌دارد و `app_challenge = base64url(SHA-256(verifier))` را به `/api/auth/google/login` می‌فرستد.
2. پس از گوگل، سرور یک کد یک‌بارمصرف دو‌دقیقه‌ای (جدول `auth_tokens`، `purpose = app_signin:<challenge>`) می‌سازد و به `ir.realrate.app://auth?code=…` (یا `?auth_error=…`) برمی‌گرداند.
3. اپ کد و `verifier` را به `POST /api/auth/app/signin` می‌دهد و نشست می‌گیرد.

ورود با ایمیل و رمز مثل سایت کار می‌کند. لینک‌های ایمیل (تأیید، بازنشانی رمز) به سایت می‌روند، نه به `localhost` اپ.

## ساخت APK

### خودکار (GitHub Actions)

- هر PR که `web/` را تغییر دهد: APK دیباگ (برای امتحان؛ قابل نصب مستقیم) در بخش Artifacts همان اجرا.
- هر مرج به `main`: APK دیباگ + APK انتشار امضاشده (اگر کلید امضا تنظیم شده باشد).
- شماره نسخه: `versionCode` = شماره‌ی اجرای Actions، `versionName` = `1.0.<شماره>`؛ هر بیلد روی قبلی نصب می‌شود.

### کلید امضا (یک‌بار)

APK انتشار باید همیشه با **یک کلید** امضا شود؛ بدون آن، نسخه‌ی بعدی روی نسخه‌ی قبلی نصب نمی‌شود. کلید را بسازید و **جای امن نگه دارید** (گم شدنش یعنی انتشار اپ با شناسه‌ی جدید):

```bash
keytool -genkeypair -v -keystore realrate-release.jks -alias realrate \
  -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 realrate-release.jks   # خروجی = ANDROID_KEYSTORE_BASE64
```

در GitHub: Settings → Secrets and variables → Actions:

| Secret | مقدار |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | خروجی base64 فایل کلید |
| `ANDROID_KEYSTORE_PASSWORD` | رمز keystore |
| `ANDROID_KEY_ALIAS` | `realrate` |
| `ANDROID_KEY_PASSWORD` | رمز کلید |

### روی سیستم خودتان

نیاز: Node 22، JDK 21، Android Studio (یا Android SDK با platform 36).

```bash
npm ci
cd web
npm run android:sync          # بیلد وب در dist-app + کپی در پروژه‌ی اندروید
npx cap open android          # باز کردن در Android Studio (Run روی گوشی)
# یا بدون Android Studio:
cd android && ./gradlew assembleDebug   # → app/build/outputs/apk/debug/app-debug.apk
```

## مراحل بعد

1. خواندن اس‌ام‌اس بانک‌ها: افزونه‌ی بومی (Kotlin) + تحلیل‌گر مشترک `api/src/domain/bankSms.js` + صندوق «تراکنش‌های تأییدنشده» (هزینه با `source: 'sms'`).
2. پیشنهاد خودکار دسته و دکمه روی اعلان.
3. به‌روزرسانی بخش وب بدون انتشار نسخه (OTA) با بررسی امضای بسته.
4. باز کردن گاوصندوق با اثر انگشت.
