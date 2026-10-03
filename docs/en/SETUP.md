# Setup and deployment

Persian: [../SETUP.md](../SETUP.md)

## Requirements
- Node.js 22 (the CI's version), npm 9 or later
- A Cloudflare account on the Workers paid plan (Workers, D1, KV, Pages)

## Running locally

```bash
git clone https://github.com/nos486/realrate.git
cd realrate
npm install
npm run dev        # API on :8787 and web on :5173
```

Separately:

```bash
npm run api:dev    # the Worker only (wrangler dev)
npm run web:dev    # the web app only (Vite)
npm test           # Vitest (API and web units) and the SEO page tests
```

Local runs use wrangler's local D1 and KV (see D1 and KV below).

## D1 and KV

The data lives in Cloudflare (needs the Workers paid plan, $5):
- **D1** (binding `DB`): the app's data, sessions, settings, the daily price history (`price_daily`: each item's last price of each Tehran day), and the state that must always read back exactly (`app_state`: counters, source overrides, the sources' sync state).
- **KV** (binding `KV`): large, read-mostly blobs — the price book (`prices`) and each source's items (`source_items:*`). KV can lag up to about 60 seconds, which is fine for prices.

Create them once:

```bash
cd api
npx wrangler d1 create realrate
npx wrangler kv namespace create realrate-prices
```

Put the printed ids in `api/wrangler.toml` in place of `REPLACE_WITH_D1_DATABASE_ID` and `REPLACE_WITH_KV_NAMESPACE_ID`. Tables are created on the Worker's first request (`api/src/repositories/d1Schema.js`); to see their SQL: `cd api && npm run db:schema`. Local runs (`npm run api:dev`) use wrangler's local D1 and KV and need nothing else.

### Moving from Postgres (once)

```bash
# 1. (optional) turn maintenance mode on in the admin panel
# 2. export Postgres to SQL files
DATABASE_URL=postgres://user:pass@host:5432/realrate node api/scripts/pg-to-d1.mjs d1-import
# 3. import them into D1
cd api && for f in ../d1-import/*.sql; do npx wrangler d1 execute realrate --remote --file "$f" -y; done
```

Every table is copied; `price_history` becomes `price_daily` (each day's last price), and of `app_state` only the source overrides (`price_source_overrides`) — the price book and the sources' items are rebuilt in KV by the first cron ticks. A row over 100 KB (D1's per-statement limit) is not written and the script reports it. Once the data is in, merge to main so the Worker and Pages deploy, and remove Hyperdrive when everything checks out.

## Google sign-in

1. In the [Google Cloud Console](https://console.cloud.google.com/) create an **OAuth 2.0 Client ID (Web Application)**.
2. Under **Authorized JavaScript origins** add `http://localhost:5173`, `http://localhost:8787` and the frontend's domain.
3. Set the id:
   - `api/wrangler.toml`:
     ```toml
     [vars]
     GOOGLE_CLIENT_ID = "YOUR_CLIENT_ID.apps.googleusercontent.com"
     ADMIN_EMAIL = "your_admin_email@gmail.com"
     ```
   - `web/.env.local`:
     ```env
     VITE_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
     ```
4. Store `GOOGLE_CLIENT_SECRET` as a secret: `npx wrangler secret put GOOGLE_CLIENT_SECRET`

The Android app signs in through the same Google flow in the phone's browser; see [ANDROID.md](ANDROID.md#google-sign-in-in-the-app).

## Email registration (sending email)

Registration without Google and password reset need email (verification / reset links). Email goes through the
[Resend](https://resend.com) API (Workers have no SMTP):

1. Add the sending domain (e.g. `geekio.org`) in Resend and add its DNS records in Cloudflare so it verifies.
2. Create an API key and store it as a secret: `npx wrangler secret put RESEND_API_KEY`
3. Set the sender in `api/wrangler.toml`:
   ```toml
   [vars]
   EMAIL_FROM = "RealRate <no-reply@geekio.org>"
   # optional: the frontend URL for links when a request has no Origin
   # FRONTEND_URL = "https://realrate.geekio.org"
   ```

Until email is configured, registration and password reset are refused with "email is not configured" and Google sign-in
works as before. For local development without an email service: `npx wrangler dev --var EMAIL_DEBUG_LOG:true` — the emails
(with their links) are written to the Worker's log.

## Demo account vault passphrase

The demo account's data uses the same end-to-end encrypted vault, so no gate or data path is bypassed. Because the demo data isn't confidential, the demo vault's passphrase is public, and the server returns it only to demo sessions so the browser can open the vault automatically.

To set it in production:

```bash
npx wrangler secret put DEMO_VAULT_PASSPHRASE
```

Without this secret the Worker uses a built-in default.

## AI cheque scanning (Gemini)

Cheque scanning reads the image with Google's **Gemini 3.8 Flash**. Store the API key (free from [Google AI Studio](https://aistudio.google.com))
as a secret; it is never written in the code:

```bash
cd api
npx wrangler secret put GEMINI_API_KEY
```

If Google says the model is busy or out of quota (503 or 429), the scan tries the next models in order (Gemini 3.7, 3.6 and 3.5 Flash);
each model has its own quota at Google. Every request to Google, even a failed one, may count against Google's daily quota.

Without the key, the scan tells users it is "not available for now" and tells the admin the secret's name. The model is in `api/src/config/ai.config.js`.

**Usage limit:** each user has 10 scans a day and the admin is unlimited (`api/src/config/usageLimits.js`; see
"Usage Limits" in [ARCHITECTURE.md](../ARCHITECTURE.md)).

## Deployment

A merge into `main` deploys everything automatically, and every PR gets a preview:

| Part | Service | GitHub check |
| :--- | :--- | :--- |
| Frontend (`web/`) | Cloudflare Pages | `Cloudflare Pages` |
| Backend (`api/`) | Cloudflare Workers Builds | `Workers Builds: realrate-api` |
| Android app (`web/android`) | GitHub Actions (`.github/workflows/android.yml`) | `apk` |

### Backend (Cloudflare Workers)

Automatic deploys come from the Git connection in the Cloudflare dashboard (Workers Builds). Manual deploy (e.g. the first time, or without Git):

```bash
npm run api:deploy
# or
cd api && npx wrangler deploy
```

New tables are created on the first request after a deploy.

### Frontend (Cloudflare Pages)

In **Workers & Pages > Create Application > Pages > Connect to Git**:

| Setting | Value |
| :--- | :--- |
| Root directory | `web` |
| Framework preset | `Vite` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| `VITE_API_URL` | The Worker's URL (e.g. `https://realrate-api.geekio.org`) |
| `VITE_GOOGLE_CLIENT_ID` | The Google client id |

The frontend's domain must be in `ALLOWED_ORIGINS` in `api/src/lib/helpers.js` (CORS).

## Android app

Every merge into `main` publishes a signed APK with release notes extracted from `CHANGELOG.md` as a GitHub release
(`v1.0.<run number>`, asset `realrate.apk`; stable link: `https://github.com/nos486/realrate/releases/latest/download/realrate.apk`).

For signing, set these secrets in GitHub (Settings → Secrets and variables → Actions) — the key and passwords are never written in the repository:

| Secret | Value |
| :--- | :--- |
| `ANDROID_KEYSTORE_BASE64` | The keystore file, base64 |
| `ANDROID_KEYSTORE_PASSWORD` | The keystore password |
| `ANDROID_KEY_ALIAS` | The key's alias (e.g. `realrate`) |
| `ANDROID_KEY_PASSWORD` | The key's password |

The app's version (`versionName`) is built into the app as `VITE_APP_VERSION` and reaches the server in the `X-RealRate-Client` header (the "app users" statistics in the admin panel).
Building on your own machine, creating the key, and the details: [ANDROID.md](ANDROID.md).

## Static SEO pages

`npm run build` in `web/` runs `scripts/build-seo.mjs` after Vite, which builds the static pages (a landing page that works without JavaScript, the feature pages, `/android`, the sitemap) from `web/src/seo/pages.js`. Tests: `npm test --workspace=web`.
