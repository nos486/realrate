# میزبانی روی سرور لینوکسی با Docker

به‌جای Cloudflare Workers و Pages، همه‌چیز روی یک سرور اجرا می‌شود — با همان کد. Postgres همان‌جایی که هست (روی همین سرور) می‌ماند؛ چیزی جابه‌جا نمی‌شود.

| کانتینر | چه می‌کند | به‌جای |
|---|---|---|
| `api` | `api/server.js`: همان کد Worker روی Node 22، به‌علاوه‌ی کرون هر دقیقه | Worker و Cron Trigger |
| `web` | Caddy: فایل‌های سایت، HTTPS هر دو دامنه، و رساندن دامنه‌ی API به `api` | Pages |

وابستگی‌ها فقط Docker (با Compose) و git روی سرور است. ایمیج‌ها روی خود سرور ساخته می‌شوند (رجیستری لازم نیست). فایل‌ها در `deploy/`:

- `docker-compose.yml` — دو سرویس، هر دو با شبکه‌ی خود سرور (`network_mode: host`): API با `127.0.0.1` به Postgres وصل می‌شود (بدون تغییر `pg_hba.conf`) و فقط روی `127.0.0.1` گوش می‌دهد؛ Caddy پورت‌های ۸۰ و ۴۴۳ را می‌گیرد.
- `Dockerfile.api`، `Dockerfile.web`، `Caddyfile` — قواعد `Caddyfile` همان `_headers` و `_redirects` نسخه‌ی Pages است (مسیرهای SPA هنگام build از `_redirects` ساخته می‌شوند: `redirects-to-caddy.mjs`).
- `.env.example` — همه‌ی تنظیمات و کلیدها.
- `deploy.sh` — به‌روزرسانی: کامیت تازه، build، جایگزینی کانتینرها و صبر تا سالم بودن API.

## نکته‌های مهم پیش از شروع

- **دامنه‌ها عوض نمی‌شوند**: سایت `realrate.ir` و API `realrate-api.geekio.org` می‌مانند. آدرس API در اپ اندروید ثابت ساخته شده؛ اگر دامنه‌ی API عوض شود اپ‌های نصب‌شده تا آپدیت کار نمی‌کنند.
- **دیتابیس همان است**: Hyperdrive الان به همین Postgres وصل است، پس `DATABASE_URL` همان دیتابیس را می‌دهد و در طول جابه‌جایی نسخه‌ی قدیم و جدید هر دو روی یک داده کار می‌کنند — هیچ داده‌ای جابه‌جا یا گم نمی‌شود.
- **کلیدهای VAPID باید همان قبلی باشند**؛ وگرنه مرورگرهایی که اعلان را فعال کرده‌اند دیگر یادآوری نمی‌گیرند. بقیه‌ی کلیدها (Google، Resend، Gemini، …) هم همان مقدارهای Worker هستند (`npx wrangler secret list` فقط نامشان را نشان می‌دهد).
- **کرون فقط یک جا اجرا شود**: تا Worker کرون دارد، `CRON_ENABLED=false` بماند.

## مراحل جابه‌جایی (بدون قطعی برای کاربر)

### ۱. آماده کردن سرور

```sh
# Docker و پلاگین Compose (اگر نصب نیست): https://docs.docker.com/engine/install/
sudo git clone https://github.com/nos486/realrate.git /opt/realrate
cd /opt/realrate
sudo cp deploy/.env.example deploy/.env
sudo nano deploy/.env        # DATABASE_URL، کلیدها، CRON_ENABLED=false، EDGE=cloudflare
```

پورت‌های ۸۰ و ۴۴۳ در فایروال باز باشند و چیز دیگری (مثلاً nginx) رویشان نباشد.

### ۲. اجرا و آزمایش، پیش از اینکه کاربری به آن برسد

```sh
cd /opt/realrate/deploy
sudo docker compose up -d --build --wait
sudo docker compose ps                         # api: healthy
curl -s http://127.0.0.1:8787/api/prices | head -c 200
sudo docker compose logs -f api                 # خطای اتصال دیتابیس یا کلیدها
```

تا DNS عوض نشده، هیچ کاربری به این سرور نمی‌رسد؛ با خیال راحت آزمایش کنید.

### ۳. جابه‌جا کردن دامنه‌ها (در Cloudflare)

پیشنهاد: پراکسی Cloudflare (ابر نارنجی) بماند و `EDGE=cloudflare` باشد. در این حالت آدرسی که کاربر می‌بیند همان IPهای Cloudflare است و فقط سرور پشت آن عوض می‌شود: **بدون تأخیر DNS**.

1. **SSL/TLS** دامنه‌ها روی **Full** باشد (نه Flexible).
2. **API** (`realrate-api.geekio.org`): در Worker، بخش *Settings → Domains & Routes*، دامنه‌ی سفارشی را حذف کنید و بلافاصله در DNS یک رکورد `A` با IP سرور و **Proxied** بسازید. با `curl https://realrate-api.geekio.org/api/prices` بررسی کنید.
3. **سایت** (`realrate.ir`): در پروژه‌ی Pages، بخش *Custom domains*، دامنه را حذف کنید و رکورد `A` با IP سرور و **Proxied** بسازید. سایت و چند صفحه‌ی اپ را باز کنید.

فاصله‌ی حذف و ساختن رکورد چند ثانیه است. در این فاصله اپ دوباره تلاش می‌کند و نسخه‌ی آفلاین PWA کار می‌کند.

> حالت `EDGE=direct` (ابر خاکستری، بدون Cloudflare): Caddy گواهی Let's Encrypt می‌گیرد، ولی تا DNS در کش کاربران عوض شود (تا چند دقیقه) بعضی‌ها هنوز به آدرس قبلی می‌روند. اگر این حالت را می‌خواهید، چند ساعت قبل TTL رکوردها را کم کنید.

### ۴. منتقل کردن کرون

بیرون از ساعت‌های ۸ و ۹ صبح به وقت تهران (ارسال یادآوری‌ها):

1. در Worker، بخش *Settings → Triggers*، کرون را حذف کنید.
2. روی سرور: `CRON_ENABLED=true` در `deploy/.env` و سپس `sudo docker compose up -d`.
3. در لاگ (`docker compose logs -f api`) هر دقیقه `[SourceSync]` دیده شود.

### ۵. به‌روزرسانی خودکار با push

1. روی سرور یک کاربر با دسترسی Docker و یک کلید SSH مخصوص deploy:
   ```sh
   sudo adduser --disabled-password deploy && sudo usermod -aG docker deploy
   sudo chown -R deploy /opt/realrate
   sudo -u deploy ssh-keygen -t ed25519 -f /home/deploy/gh -N ''
   sudo -u deploy sh -c 'mkdir -p ~/.ssh && cat ~/gh.pub >> ~/.ssh/authorized_keys'
   sudo cat /home/deploy/gh          # کلید خصوصی → secret گیت‌هاب
   ```
2. در گیت‌هاب، *Settings → Secrets and variables → Actions*:
   - Secrets: `DEPLOY_HOST` (IP سرور)، `DEPLOY_USER` (`deploy`)، `DEPLOY_SSH_KEY` (کلید خصوصی)، و در صورت نیاز `DEPLOY_PORT` و `DEPLOY_PATH`.
   - Variables: `SELF_HOSTED_DEPLOY` = `true`.
3. از این به بعد هر push به `main`: تست‌های API اجرا می‌شوند، بعد workflow «Deploy» روی سرور `deploy/deploy.sh <کامیت>` را اجرا می‌کند. اگر کانتینر جدید سالم بالا نیاید، deploy خطا می‌دهد.
4. deploy خودکار Worker و Pages را در Cloudflare قطع کنید (یا پروژه‌ها را چند روز به‌عنوان پشتیبان نگه دارید و بعد حذف کنید).

### ۶. بعد از جابه‌جایی

- اگر Postgres برای Hyperdrive روی اینترنت باز بود، حالا می‌تواند فقط روی `127.0.0.1` گوش دهد (`listen_addresses = 'localhost'`) و پورت ۵۴۳۲ در فایروال بسته شود.
- پشتیبان روزانه‌ی دیتابیس (cron سرور):
  ```sh
  0 3 * * * pg_dump -Fc -d realrate -f /var/backups/realrate-$(date +\%a).dump
  ```

## کارهای روزمره

| کار | دستور (در `/opt/realrate/deploy`) |
|---|---|
| وضعیت | `docker compose ps` |
| لاگ API | `docker compose logs -f --tail 100 api` |
| به‌روزرسانی دستی | `../deploy/deploy.sh` |
| برگشت به نسخه‌ی قبل | `../deploy/deploy.sh <کامیت قبلی>` |
| ری‌استارت | `docker compose restart api` |

هر deploy چند ثانیه API را ری‌استارت می‌کند؛ کارهای در حال اجرا (همگام‌سازی قیمت، ایمیل) تا ۳۰ ثانیه فرصت تمام شدن دارند.

## بازگشت به Cloudflare

دامنه‌ها را دوباره به Worker و Pages وصل کنید و کرون Worker را برگردانید (و روی سرور `CRON_ENABLED=false`). دیتابیس مشترک است؛ چیزی از دست نمی‌رود.
