# Setup and deployment

Persian: [../SETUP.md](../SETUP.md)

## Requirements
- Node.js 22 (the CI's version), npm 9 or later
- A Cloudflare account (Workers, KV, Hyperdrive, Pages) and a Postgres database

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

Running locally needs a Postgres (see Postgres below).

## Cloudflare KV

Optional for a new install: with the database bound, everything that changes (prices, source lists, counters) is kept in Postgres (`app_state`). The binding is only read to copy older data over once, and used when there is no database.

```bash
npx wrangler kv:namespace create REALRATE_KV
```

Put the id in `api/wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "REALRATE_KV"
id = "YOUR_KV_ID"
```

## Postgres (Hyperdrive)

The app's data and the price history live in Postgres, and the Worker reaches it through Cloudflare Hyperdrive (binding `HYPERDRIVE` in `api/wrangler.toml`).

Hyperdrive's query cache must be off, or a read right after a save may return old data:

```bash
npx wrangler hyperdrive update <HYPERDRIVE_ID> --caching-disabled true
```

For local runs, point `localConnectionString` at a local Postgres.

Tables are created on the Worker's first request (`api/src/repositories/pgSchema.js`). To see their SQL: `cd api && npm run db:schema`.

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
