# میزبانی روی سرور لینوکسی با Docker (پشت nginx خود سرور)

به‌جای Cloudflare Pages و Workers، برنامه روی سرور خودتان اجرا می‌شود — با همان کد. nginx سرور همان‌طور پورت‌های ۸۰ و ۴۴۳ و گواهی‌ها را نگه می‌دارد و فقط به کانتینرها proxy می‌کند. Postgres همان‌جایی که هست می‌ماند.

جابه‌جایی در دو مرحله است:

| مرحله | کانتینر | روی سرور | به‌جای |
|---|---|---|---|
| ۱ | `web` | سایت روی `127.0.0.1:8080` (Caddy داخل کانتینر: مسیرها و کش مثل Pages) | Cloudflare Pages |
| ۲ | `api` | API روی `127.0.0.1:8787` (`api/server.js`: همان کد Worker به‌علاوه‌ی کرون هر دقیقه) | Worker |

در مرحله‌ی ۱ سایت از سرور شما سرو می‌شود ولی درخواست‌ها هنوز به Worker می‌روند؛ چیزی در API و داده‌ها عوض نمی‌شود.

وابستگی‌ها روی سرور فقط Docker (با Compose) و git است. ایمیج‌ها روی خود سرور ساخته می‌شوند (رجیستری لازم نیست). فایل‌ها در `deploy/`:

- `docker-compose.yml` — سرویس `web`، و سرویس `api` که تا `COMPOSE_PROFILES=api` خاموش است.
- `Dockerfile.web`، `Caddyfile` — build سایت و سرو آن؛ قواعد همان `_headers` و `_redirects` نسخه‌ی Pages است (مسیرهای SPA هنگام build از `_redirects` ساخته می‌شوند: `redirects-to-caddy.mjs`).
- `Dockerfile.api` — مرحله‌ی ۲.
- `nginx-web.conf.example` — نمونه‌ی تنظیم nginx برای `realrate.ir`.
- `.env.example`، `deploy.sh` — تنظیمات، و به‌روزرسانی (کامیت تازه، build، جایگزینی و صبر تا سالم بودن).

## مرحله‌ی ۱: سایت (کلاینت)

### ۱. آماده کردن سرور

```sh
# Docker و پلاگین Compose (اگر نصب نیست): https://docs.docker.com/engine/install/
sudo git clone https://github.com/nos486/realrate.git /opt/realrate
cd /opt/realrate
sudo cp deploy/.env.example deploy/.env      # برای مرحله‌ی ۱ فقط WEB_PORT (پیش‌فرض 8080)
cd deploy
sudo docker compose up -d --build --wait
sudo docker compose ps                       # web: healthy
curl -sI http://127.0.0.1:8080/expenses | head -3
```

### ۲. nginx

`deploy/nginx-web.conf.example` را در `/etc/nginx/sites-available/realrate.ir` کپی کنید، مسیر گواهی را درست کنید، در `sites-enabled` لینک کنید و `nginx -t && systemctl reload nginx`. هدرهای کش و فشرده‌سازی از کانتینر می‌آیند؛ در nginx آن‌ها را عوض نکنید (به‌خصوص `Cache-Control` فایل `sw.js` که باید `no-cache` بماند).

گواهی، اگر دامنه پشت پراکسی Cloudflare (ابر نارنجی) می‌ماند — پیشنهاد من:
- در Cloudflare، *SSL/TLS → Origin Server → Create Certificate* یک گواهی ۱۵ ساله برای `realrate.ir` و `*.realrate.ir` بسازید و در `/etc/ssl/realrate.ir/` بگذارید؛ حالت SSL را **Full (strict)** کنید.
- برای تست قبل از جابه‌جایی: `curl -k --resolve realrate.ir:443:127.0.0.1 https://realrate.ir/faq`.

اگر Cloudflare را کنار می‌گذارید (ابر خاکستری): certbot، که فقط بعد از اشاره‌ی DNS به سرور گواهی می‌گیرد (چند دقیقه تأخیر DNS هم دارد) — برای همین حالت پراکسی بی‌دردسرتر است.

### ۳. جابه‌جا کردن دامنه

در پروژه‌ی Pages، بخش *Custom domains*، `realrate.ir` را حذف کنید و بلافاصله در DNS یک رکورد `A` با IP سرور و **Proxied** بسازید (و اگر `www` دارید، همین‌طور). با پراکسی، IPی که کاربر می‌بیند عوض نمی‌شود و فقط سرور پشت آن عوض می‌شود: قطعی چند ثانیه است و در همان فاصله نسخه‌ی آفلاین PWA کار می‌کند.

بررسی: سایت، چند صفحه‌ی اپ (`/expenses`، `/portfolio`)، صفحه‌های `/faq` و `/features/loans`، و یک آدرس اشتباه (باید صفحه‌ی ۴۰۴ بیاید).

### ۴. به‌روزرسانی خودکار با push

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
3. از این به بعد هر push به `main`: تست‌ها اجرا می‌شوند، بعد workflow «Deploy» روی سرور `deploy/deploy.sh <کامیت>` را اجرا می‌کند. اگر کانتینر جدید سالم بالا نیاید، deploy خطا می‌دهد و نسخه‌ی قبلی سر جایش می‌ماند تا build تمام شود.
4. deploy خودکار پروژه‌ی Pages را در Cloudflare قطع کنید (یا چند روز به‌عنوان پشتیبان نگه دارید).

## مرحله‌ی ۲: API (بعداً)

خلاصه، تا وقتی به آن برسیم:
- `deploy/.env`: `COMPOSE_PROFILES=api`، `DATABASE_URL` (همان دیتابیسی که Hyperdrive استفاده می‌کند — داده‌ای جابه‌جا نمی‌شود)، کلیدهای Worker (کلیدهای VAPID حتماً همان قبلی)، و `CRON_ENABLED=false` تا کرون Worker حذف شود.
- nginx برای `realrate-api.geekio.org` به `127.0.0.1:8787` (دامنه‌ی API عوض نمی‌شود؛ اپ اندروید همین را صدا می‌زند).
- بعد کرون: حذف از Worker و `CRON_ENABLED=true` روی سرور، بیرون از ساعت ۸ و ۹ صبح تهران.

## کارهای روزمره

| کار | دستور (در `/opt/realrate/deploy`) |
|---|---|
| وضعیت | `docker compose ps` |
| لاگ | `docker compose logs -f --tail 100 web` |
| به‌روزرسانی دستی | `./deploy.sh` |
| برگشت به نسخه‌ی قبل | `./deploy.sh <کامیت قبلی>` |

## بازگشت به Cloudflare

دامنه را دوباره به پروژه‌ی Pages وصل کنید. چیزی از دست نمی‌رود.
