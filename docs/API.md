# RealRate API Documentation

## API Versioning Policy

RealRate Cloudflare Worker API supports versioned routing starting with **v1**.

### Base Paths
- **Versioned API (Current Standard):** `/api/v1/...`
- **Legacy API (Backward-Compatible):** `/api/...`

> **Note on New Feature Development:**
> Any new endpoints, modifications, or feature expansions **MUST** be implemented under `/api/v1/...`.
> The unversioned `/api/...` routes are retained strictly for backward compatibility with older web client deployments and will mirror v1 controllers.

### Client header

Every authenticated request from the RealRate clients carries `X-RealRate-Client`: `android/<versionName>` from the Android app (e.g. `android/1.0.50`), `web` from the website (`api/src/domain/clientInfo.js`). It is optional; `GET /api/v1/auth/me` records it for the admin's app statistics (see *Admin Endpoints*). CORS allows it.

### Errors

Errors share one shape: `{ success: false, message, error: { code, message } }` with a matching HTTP status (e.g. `400 BAD_REQUEST`, `401 UNAUTHORIZED`, `403 ENCRYPTION_REQUIRED`, `404 NOT_FOUND`, `409 VAULT_CHANGED`, `429 QUOTA_EXCEEDED`). Messages are in Persian.

---

## Endpoint Catalog

### Public Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/prices/book` | **The prices.** Every price in the standard shape, plus the public global settings: `{ updatedAt, items: { [id]: { id, price (toman), name, category, unit, sourceId, updatedAt, params, currency?, priceUsd? } }, globalSettings }` — a dollar-priced asset (the ounce, oil, bitcoin) has `currency: "usd"` and its dollar price `priceUsd`; its dollar history is the key `<id>@usd` of `/api/prices/history` and `/api/sparklines`. Sent with an `ETag` (`Cache-Control: no-cache`): while no price or setting changed, a revalidation gets `304` and no body. **`?part=core`** (what the app reads): everything but the catalog items (exchange symbols, funds, plans — `params.symbol`), plus `catalogVersion`; without `part`, the whole book (older clients). |
| `GET` | `/api/prices/catalog` | The catalog items alone (thousands of symbols, synced about once an hour): `{ version, items }`, with its own `ETag`. The app reads it only when the core book names a new `catalogVersion`, so a minute-to-minute change of the dollar never downloads the symbols again. |
| `GET` | `/api/v1/market/items` | Older shape, kept for clients that haven't updated: unified market items (Gold, Coins, Silver, Forex, Bourse, Funds, Plans), priced from the book |
| `GET` | `/api/v1/prices` | Older shape, kept for clients that haven't updated: `{ prices: { [id]: { price, … } }, live_usd_toman, gold_usd, forex, reference_rates, globalSettings }`, read off the book (the ounce in dollars and currencies as rates against the dollar, as before) |
| `GET` | `/api/sparklines?keys=usd,gold_18k&range=30d` | **Signed in, feature `market`** (404 otherwise). Daily trend series from the D1 price history, per asset id (`range`: `7d`, `30d` — the default, `90d`, `180d`, `1y`, `2y`; `1d` is served as `7d`). Each series has `points` (daily close), `days` (YYYY-MM-DD, Tehran), `first`, `last`, `changePct`, `since`; with `candles=1` also `candles`: `[open, high, low, close]` per day |
| `GET` | `/api/prices/history?key=usd` | One asset's whole daily history: `{ key, since, values }` — `since` its first day (YYYY-MM-DD, Tehran), `values` one close per day from then to today (a quiet day carries the last close; `[]` without history). The client reads every past price it needs off it — the dollar rate on a record's date, a compared asset's price on a purchase day — with one request per asset (`web/src/features/market/dailyHistory.js`). Served from KV — the past days' snapshot `history:<id>` (rebuilt from D1 once a day, or after an admin history change) plus today's price from the book — so a request reads no D1 row. Edge-cached for 5 minutes |
| `GET` | `/api/admin/history` | Admin: the price history page — the tgju catalog (`config/tgjuCatalog.js`), the saved mappings (with each one's last run), the price book's items (targets) and the history per id (`inBook: false` = read by no card) |
| `POST` | `/api/admin/history/mappings` | Admin: save the tgju → price book mappings `[{ slug, label, unit: "rial"\|"toman"\|"usd", target }]` |
| `POST` | `/api/admin/history/preview` | Admin: `{ slug, target? }` → a series' latest days as tgju gives them, and with a target the unit that matches the item's live price (`guess`) |
| `POST` | `/api/admin/history/backfill` | Admin: `{ slug, target, unit, days, overwrite, usdTarget? }` fills a price book item's past days (up to 10 years) from a tgju series: `target` must be in the live book, the newest tgju price within ×0.5–×2 of its live price; one candle per day, today excluded, recorded days kept unless `overwrite`; `usd` series × each day's dollar from our history |
| `POST` | `/api/admin/history/keys` | Admin: `{ action: "delete", key }`, `{ action: "move", key, to }` (to a book id; days it has are kept) or `{ action: "delete-orphans" }` (every id the book doesn't know; refused while the book is missing) |
| `POST` | `/api/admin/history/recompute` | Admin: computes the derived history again now — every coin bubble's past days from its coin's, `ons_gold@usd`'s and `usd`'s closes (`rebuildBubbleHistory`), then every average from the whole windows, put on the price book at once — and returns `{ report: { at, written, averagesThrough, inputs: { ounce, usd }, bubbles: [{ id, name, history, coin, targetBubblePct, targetBubbleDays }] }, history }` (each `history`/`coin`/input: `{ days, first, last }`) |
| `GET` | `/api/v1/bourse/symbols` | Search and list Tehran Stock Exchange symbols (`?q=...&limit=...`) |
| `POST` | `/api/v1/bourse/sync` | Force synchronize bourse symbols cache |
| `GET` | `/api/app/latest` | The Android app's latest release, for its update check: `{ release: { version, tag, url, size, notes, publishedAt } \| null }`. Read from GitHub releases (the API, else the `releases/latest` redirect; optional `GITHUB_TOKEN`), kept 10 minutes in D1 (`app_state`), the last known one served when GitHub fails. Answered during maintenance too. |
| `GET` | `/api/news` | Market news picked from Telegram channels and international (English) RSS/Atom feeds, newest first: `{ items: [{ id, channel, channelTitle, postId, url, title, summary, text, category, importance (1–3), image, publishedAt (ms), source ('telegram'\|'world'), ai }], hasMore, categories }`. A `world` item's `title`/`summary` are the model's Persian; `text` is the English original and `url` the article. `?limit` (≤ 50, default 20), `?page=<n>` (with `total`) or `?before=<publishedAt>`, `?category=currency\|gold\|metals\|oil\|bourse\|economy\|crypto`, `?important=1` (importance ≥ 2), `?source=world\|telegram`. Cached 30 s. Filled by the minute cron (`services/news/news.service.js`) |
| `GET` | `/api/news/today` | `{ analysis, top, week }`: the day's analysis written by Workers AI from the day's news (`{ title, summary, drivers, points, risk, at, newsCount }`, or null) and today's most important items. Cached 30 s |
| `GET` | `/api/widget` | The Android home-screen widgets' feed: `{ updatedAt, prices: [{ id, name, unit, price, currency, priceUsd, changePct }], news (the AI-picked ones only): [{ id, title, category, categoryLabel, importance, publishedAt }], analysis: { title, summary, at }\|null, defaultIds }`. `?ids=usd,gold_18k` (≤ 6 book ids, in that order; the default favourites without it). A dollar-priced asset's `price` is its dollar price. Cached at the edge: prices 60 s, the news and analysis (the only D1 reads, shared by every list of favourites) 3 min |
| `GET` / `POST` | `/api/v1/portfolio/shared` | Retrieve a publicly shared portfolio (`?slug=...`; a share password is accepted only in a `POST` body `{ slug, password }`) |

#### Unified Market Items Schema (`/api/v1/market/items`)
Returns all active assets and market rates normalized through the centralized `displayEngine`:
```json
{
  "success": true,
  "count": 850,
  "items": [
    {
      "id": "charisma_plans__silver",
      "name": "طرح نقره کاریزما (کاریزما)",
      "price": 105400,
      "unit": "واحد",
      "category": "silver",
      "categoryName": "نقره و مسکوکات",
      "badge": "نقره",
      "sourceId": "charisma_plans",
      "sourceName": "کاریزما",
      "datetime": "2026-09-21T10:30:00Z"
    }
  ]
}
```
*Note: ids name the asset, not the provider. A catalog item is `${market}__${symbol}` (e.g. `bourse__فولاد`, `charisma_plan__gold`), a single-price source's item its canonical id (e.g. `gold_18k`, `usd`). Ids are lower-case with Persian letters and digits in one form.*

### Authentication Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/auth/google/login` | Initiate Google OAuth redirect |
| `GET` | `/api/v1/auth/google/callback` | OAuth2 redirect callback receiver |
| `POST` | `/api/v1/auth/google` | Exchange Google OAuth ID token for session |
| `GET` | `/api/v1/auth/me` | Current authenticated session details |
| `POST` | `/api/v1/auth/logout` | Invalidate current session cookie |
| `POST` | `/api/v1/auth/register` | Create an email/password account (`{ name, email, password }`); emails a verification link, no session yet |
| `POST` | `/api/v1/auth/verify-email` | `{ token }` from the link → verifies the address and returns `{ token, user }` |
| `POST` | `/api/v1/auth/verify-email/resend` | `{ email }` — send the verification link again |
| `POST` | `/api/v1/auth/login` | `{ email, password }` → `{ token, user }`; `401 INVALID_CREDENTIALS`, `403 EMAIL_NOT_VERIFIED` |
| `POST` | `/api/v1/auth/app/signin` | Android app Google sign-in: `{ code, verifier }` → `{ token, user }`; `400 INVALID_TOKEN` (see docs/ANDROID.md) |
| `POST` | `/api/v1/auth/password/forgot` | `{ email }` — email a reset link (also how a Google account adds a password) |
| `POST` | `/api/v1/auth/password/reset` | `{ token, password }` → sets it, verifies the address, signs out other sessions, returns `{ token, user }` |
| `POST` | `/api/v1/auth/password` | Signed in: `{ newPassword, currentPassword? }` — add a first password or change it (other sessions are signed out) |
| `POST` | `/api/v1/auth/account/delete` | Signed in: deletes the account and **everything it owns** (sessions, vault and encrypted records, portfolios, reminders, push subscriptions, group memberships). `{ confirm: "DELETE_ACCOUNT", password }` — `password` required when the account has one (`400 INVALID_PASSWORD`, rate limited); not for the demo account or an admin (`403`) |
| `POST` | `/api/v1/auth/demo` | Public: create a short-lived `demo_view` session (2 hours) for the unique demo account (`users.is_demo = 1`); returns `{ token, user }`. Rate-limited per IP. |

Passwords: at least 8 characters with letters and digits, stored as PBKDF2-SHA256 (100,000 rounds).
Links are single-use, expire (verify 24 h, reset 1 h) and are stored only as SHA-256.
`register`, `resend` and `forgot` answer identically whether or not the email is registered, and all of
these endpoints are rate-limited (`429 TOO_MANY_REQUESTS`). Without an email provider they answer `503 EMAIL_NOT_CONFIGURED`.
Direct password or Google OAuth logins to the demo account (`demo@realrate.invalid` or `is_demo = 1`) are strictly rejected.

`GET /api/v1/auth/me`: Returns current user session details:
- `user`: `{ id, email, name, role, isDemo, emailVerified, createdAt, updatedAt }`
- `features`: Array of active feature flag keys enabled for the user (e.g. `['cheque_scan']`; admins also get beta features such as `cheque_scan_debug`, and every group-restricted feature such as `market`).
- `groups`: the keys of the user's groups (e.g. `['pro']`); `requestedGroups`: the groups they asked to join and are waiting on.
- For demo sessions (`demo_view` or `demo_edit`), additionally returns:
  - `demo: { mode: 'view' | 'edit' }`
  - `demoVaultPassphrase`: Public passphrase for the demo vault (configured via `DEMO_VAULT_PASSPHRASE`).
For standard user sessions, demo properties are never included.


### User Settings & Portfolios (Protected)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/user/settings` | Retrieve user preferences and settings |
| `POST` / `PUT` | `/api/v1/user/settings` | Save user preferences |
| `GET` | `/api/v1/user/home-layout` | Feature `market` (404 otherwise). The user's customized home page `{ version, sections: [{ id, title, style, items }] }` or `null` (default page) |
| `PUT` | `/api/v1/user/home-layout` | Feature `market`. Save the home page layout (`{ layout }`, sanitized by `domain/homeLayout.js`); `{ layout: null }` resets to default. A section may carry `cards: { <id>: { main?: "avg:30d"\|"avg:1y", slots?: ["intrinsic", "bubble/price", …] } }` (what each card shows, `domain/cardMetrics.js`; at most 3 slots) and `formulas: { "fx_…": { name, expr: "x/(y-x)", vars: { x: <id>, … }, format: "number"\|"percent", stats?: "30d"\|"1y" } }` (cards built with a formula, `domain/cardFormula.js`, each placed by its id in `items`; an invalid one is dropped) |
| `GET` | `/api/v1/portfolios` | List the user's portfolios, the default first (`itemCount` and `transactionCount`: their encrypted records; `e2eeWrappedKey`: each portfolio's data key wrapped by the account key) |
| `POST` | `/api/v1/portfolios` | Create a portfolio `{ name, e2eeWrappedKey }` — the key is required (`409 VAULT_ENABLED` without it); the user's first portfolio is their default. The browser creates the first one right after the vault is set up |
| `PUT` | `/api/v1/portfolios` | Update a portfolio's name, share settings, default flag or wrapped key (a key can be replaced, never cleared: `403 ENCRYPTION_MANDATORY`) |
| `DELETE` | `/api/v1/portfolios` | Delete a portfolio with its encrypted items (the only one cannot be deleted) |

A portfolio's holdings, transactions, layout and risk profile are encrypted vault records whose `parentId` is the portfolio (`/api/v1/vault/records/holding`, `.../transaction`, …), encrypted with the portfolio's own key.

### Incomes, Cheques and Loans

All are end-to-end encrypted vault records (`/api/v1/vault/records/income`, `.../cheque`, `.../loan`) and run in the browser: cheques validate with `api/src/domain/chequeDocument.js`, and every loan operation is `api/src/domain/loanDocument.js` (one loan is one document: its parameters, installment states and extra payments).

### AI Cheque Scan

Stateless image analysis with Gemini (`api/src/config/ai.config.js`, key in the `GEMINI_API_KEY` secret) for prefilling cheque details.
- **Feature Flag Gate**: Requires the `cheque_scan` feature (`requireFeature`, stage `ga`: every signed-in user).
- **Daily limit**: one use of the `cheque_scan` limit per scan (`config/usageLimits.js`): 10 a day for users, none for the admin, counted per Tehran day. Past it: `429 QUOTA_EXCEEDED`. Only a valid upload is counted, and a failed model call gives the use back. The response carries `quota: { limit, used, remaining }` (`limit`/`remaining` null: no limit).
- **Busy fallback**: when Google answers 503/429 (overloaded or out of quota) for the first model (`gemini-3.8-flash`), the scan tries the next ones in order (`gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`); each model has its own quota at Google. When every model is busy: `503 AI_BUSY`, and the user's daily use is given back.
- **Not configured**: without `GEMINI_API_KEY` the scan answers `503 SCAN_NOT_CONFIGURED` (the admin is told the secret's name).
- **Admin debug** (`cheque_scan_debug` feature, beta): the response adds `raw` (the model's answer), and a `502` names Gemini's error.
- **Encryption Gate Exemption**: This endpoint is explicitly exempted from the mandatory E2EE ciphertext gate because it does not store any financial data.
- **Privacy & Zero Storage Guarantee**: The image, model prompts, and structured output are **never** persisted to the database, disk, or logs.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/cheques/scan` | Read a cheque image with Gemini |
| `GET` | `/api/v1/cheques/scan/quota` | Today's scans: `limit`, `used`, `remaining` |

#### Request Format
`Content-Type: multipart/form-data`
- `image`: Image binary file (Accepted MIME types: `image/jpeg`, `image/png`, `image/webp`. Max file size: 2MB). Exceeding 2MB returns `413 Payload Too Large`; unsupported formats return `400 Bad Request`.

The model is chosen by the server (`api/src/config/ai.config.js`), with the busy fallback above.

#### Response Schema (`200 OK`)
```json
{
  "success": true,
  "fields": {
    "amount": 50000000,
    "dueDate": "2026-10-15",
    "issueDate": "",
    "sayadId": "1234567890123456",
    "chequeNumber": "123456",
    "bankId": "melli",
    "bankName": "بانک ملی ایران",
    "counterparty": "شرکت پخش آریا",
    "notes": "شعبه مرکزی"
  },
  "confidence": {
    "amount": "high",
    "dueDate": "high",
    "sayadId": "high",
    "chequeNumber": "medium",
    "bankName": "high",
    "counterparty": "medium"
  },
  "warnings": [],
  "raw": "{\"amount\": 500000000, ...}",
  "model": "gemini-3.8-flash",
  "durationMs": 1350
}
```
*Note: Cheque amounts on physical Iranian cheques are printed in Rials, but `fields.amount` is automatically converted to Tomans to match the app standard (`amountRials / 10`). `raw` is returned exclusively in the admin beta stage for model evaluation.*

### Custom Banks (Protected)

Standard banks are static (`api/src/config/banks.config.js`) and ship with the client.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/banks/custom` | List the user's custom banks |
| `POST` | `/api/v1/banks/custom` | Add a custom bank (`{ name }`; returns the existing one for a duplicate name) |
| `DELETE` | `/api/v1/banks/custom/:id` | Remove a custom bank (encrypted loans keep its name as their lender name) |

### Free Plan Limits (Protected)

Users outside the `pro` group (admins and the demo account are never limited) are held to the limits of `api/src/config/planLimits.js`. A create past a limit (`PUT /api/v1/vault/records/:kind[/:id]`, `POST /api/v1/portfolios`) returns `403 PLAN_LIMIT`; replacing an existing record never counts. The monthly limit counts records first stored in the month even if deleted later, and a total limit is re-checked after the store (parallel requests over it are rolled back). Email reminders (`PUT /api/v1/alerts/email`, `POST /api/v1/alerts/email/test`) return the same code to a user without the `email_reminders` feature.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/plan` | `{ pro, usage: { <limit>: { used, limit, period: "month"\|"total" } } }`; `usage` is empty on Pro |

### End-to-End Encryption Vault (Protected)

All payloads are ciphertext produced in the browser (`enc:e2ee:v1:...`); see [E2EE_VAULT.md](E2EE_VAULT.md).
Encryption is mandatory: a new account sets up its vault before anything else, and until then every save (portfolios,
custom banks, vault records) returns `403 ENCRYPTION_REQUIRED`. Portfolio data must be ciphertext. The vault cannot be turned off.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/vault` | The account vault `{ salt, wrappedKey, version }` or `null` (a new account, before it sets one up) |
| `PUT` | `/api/v1/vault` | Turn on, or re-wrap after a passphrase change (`previousWrappedKey` required; `409` on mismatch) |
| `POST` | `/api/v1/vault/reset` | Forgotten passphrase: deletes the vault and **all** the user's financial data (portfolios, custom banks, every vault record, tombstones and reminders). `{ confirm: "RESET_ALL_DATA", password }` — `password` is the account password, required when the account has one (`400 INVALID_PASSWORD`, rate limited); not for the demo account. Sign-in and the home layout stay |
| `GET` | `/api/v1/vault/records/:kind` | Encrypted records of `loan`, `income`, `cheque`, `recurring_income` (older records only: fixed incomes were removed), `holding`, `transaction`, `portfolio_layout`, `risk_profile`, `expense_group`, `expense`, `bank_account`, `transfer`, `category_settings` or `subscription` (`expense_group` and `expense` only with the `expenses` feature, `bank_account` and `transfer` only with `bank_accounts`, else `404`) — newest date first. Filters on the plaintext metadata only: `?from`, `?to` (inclusive `YYYY-MM-DD`), `?parent`, `?undated=1` (date missing or not yet Gregorian); `?order=asc\|desc`; with `?limit` (1–200) and `?offset` one page plus `total` |
| `PUT` | `/api/v1/vault/records/:kind/:id` | Create/replace a record (`{ payload, recordDate, parentId, vaultEpoch, reminder? }` — `recordDate` (`YYYY-MM-DD`) and `parentId` (portfolio for `holding`/`transaction`/`portfolio_layout`/`risk_profile`, required; section for `expense`, required) are plaintext; optional `reminder` for `loan`, `cheque` or `subscription` upserts or deletes the plaintext reminder index row in the same batch; `vaultEpoch`, the vault's `createdAt` the record was encrypted for, is refused with `409 VAULT_CHANGED` after a reset) |
| `DELETE` | `/api/v1/vault/records/:kind/:id` | Delete a record (also deletes its reminder row in the same batch) |
| `POST` | `/api/v1/vault/records/:kind/delete` | Delete several records of one kind at once: `{ ids }`, up to 100, all or none in one batch (reminder rows and tombstones as for the single delete). `{ success, deleted }` — how many existed |
| `GET` | `/api/v1/vault/sync` | Incremental sync for devices keeping a copy (the Android app, offline): every change after `?cursor` (`time\|kind\|id`, empty = from the start), oldest first, `?limit` 1–500 (default 200). `{ epoch, records: [{kind, id, payload, recordDate, parentId, createdAt, updatedAt}], deleted: [{kind, id, deletedAt}], cursor, more, reset? }` — a different `epoch` (the vault was recreated) or `reset` (cursor older than the 180 days of tombstones kept) means start over. Only kinds the user's features allow |

### Alert & Email Reminders (Protected)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/alerts/email` | Get user's email reminder preferences: `{ success: true, prefs: { enabled, sources, leadDays, sendOverdue, includeChequeDirection, updatedAt }, email, emailVerified, emailConfigured }` |
| `PUT` | `/api/alerts/email` | Update preferences (`{ enabled, sources, leadDays, sendOverdue, includeChequeDirection }`). Disabling `includeChequeDirection` immediately clears stored cheque directions |
| `POST` | `/api/alerts/email/test` | Send a sample reminder digest email to user's verified address. Strictly rate-limited (3 per hour) |
| `GET` | `/api/alerts/push/vapid-key` | Get public VAPID key and push provider configuration status: `{ success: true, vapidPublicKey, configured }` |
| `POST` | `/api/alerts/push/subscription` | Register/update browser Web Push subscription: `{ deviceId, subscription: { endpoint, keys: { p256dh, auth } } }` |
| `DELETE` | `/api/alerts/push/subscription/:deviceId` | Remove push subscription and scheduled reminders for device |
| `PUT` | `/api/alerts/push/reminders` | Upload sealed push reminders for device: `{ deviceId, items: [{ kind, recordId, dueDate, reason, fireDate, sealed }] }` |
| `POST` | `/api/alerts/push/test` | Send immediate test Web Push notification with opaque sealed payload. Rate-limited (5 per hour) |

Portfolios protected by the vault carry `e2eeWrappedKey`; `/api/v1/portfolio/shared` reports `e2eeLinkKey: true` for them
(the viewer needs the key from the share link's `#k=` fragment).

### Groups and Feature Access

A feature can be open to every user or only to the members of some groups (rules: `api/src/config/features.js`, changed at runtime by the admin; see [ARCHITECTURE.md](ARCHITECTURE.md#3-feature-flags-and-user-groups)). A route of a feature the user doesn't have answers `404`.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/features/:key/access` | Signed in: `{ feature, label, enabled, groups: [{ key, name, description, allowRequests, requested }] }` — the groups that open the feature |
| `POST` | `/api/v1/groups/:key/request` | Ask to join a group that accepts requests (`{ note? }`); `400 ALREADY_MEMBER`, `404` when the group doesn't accept requests; asking again refreshes the request |
| `DELETE` | `/api/v1/groups/:key/request` | Take the request back |
| `GET` | `/api/v1/admin/groups` | Admin: `{ groups: [{ id, key, name, description, allowRequests, isSystem, memberCount, requestCount }], requests: [{ groupId, userId, email, name, requestedAt, note }], features: [{ key, label, description, stage, groups, defaultStage, defaultGroups, customized }] }` |
| `POST` | `/api/v1/admin/groups` | Admin: create `{ key, name, description?, allowRequests? }` (`key`: lower-case `[a-z][a-z0-9_-]{1,31}`, can't change later); `400 GROUP_EXISTS` |
| `PUT` | `/api/v1/admin/groups/:id` | Admin: `{ name?, description?, allowRequests? }` (turning requests off drops the pending ones) |
| `DELETE` | `/api/v1/admin/groups/:id` | Admin: the group, its members and requests; refused for a system group and `400 GROUP_IN_USE` while a feature's rule names it |
| `GET` | `/api/v1/admin/groups/:id/members?q=&page=` | Admin: `{ members: [{ userId, email, name, picture, addedAt, addedBy }], total, page, pageSize, pageCount }` (20 a page) |
| `POST` | `/api/v1/admin/groups/:id/members` | Admin: add `{ userId }` or `{ email }` (settles their pending request) |
| `DELETE` | `/api/v1/admin/groups/:id/members/:userId` | Admin: remove |
| `POST` | `/api/v1/admin/groups/:id/requests/:userId` | Admin: `{ approve: true }` adds the member, `{ approve: false }` rejects |
| `PUT` | `/api/v1/admin/features/:key` | Admin: `{ stage: "off"\|"beta"\|"ga", groups: [groupKey] }` (groups only with `ga`; empty = every user) → `{ features }` |
| `DELETE` | `/api/v1/admin/features/:key` | Admin: back to the code's default → `{ features }` |

`GET /api/v1/admin/users/detail` also returns `groups: [{ id, key, name, member }]` — every group, and whether the user is in it.

### Admin Endpoints (Admin Role Only)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/admin/stats` | Statistics: `registeredUsers`, `activeToday`, `publicPortfolios`, the users-list filter counts, and the Android app's `appActiveToday`, `appActive30` and `appVersions` (`[{ version, users }]`, newest first) |
| `GET` | `/api/v1/admin/users` | One page of users: `?page&pageSize` (≤ 100), `?q` (email/name), `?filter=all\|new\|inactive\|unverified\|google\|blocked\|e2ee\|noE2ee\|app`, `?sort=lastLogin\|createdAt&dir=desc\|asc`. Each user carries `usesApp`, `appVersion`, `appLastSeen` |
| `GET` | `/api/v1/admin/users/detail?userId=` | One user: sign-in method, verification, logins, active days, sessions, encryption, record **counts** only, and `clients` (`[{ platform, appVersion, firstSeen, lastSeen }]`) |
| `POST` | `/api/v1/admin/users/block` | `{ userId, blocked }` — block (also signs the user out everywhere) or unblock; the admin can't be blocked |
| `POST` | `/api/v1/admin/users/signout` | `{ userId }` — end all of the user's sessions |
| `POST` | `/api/v1/admin/users/resend-verification` | `{ userId }` — email the verification link again |
| `GET` | `/api/v1/admin/growth?days=30` | Daily series `[{ day, signups, active, appActive }]` |
| `POST` | `/api/v1/admin/settings` | Save system-wide settings |
| `GET` | `/api/v1/admin/price-sources` | Every source as the sources page shows it: `{ tickSec, summary: { total, ok, error, stale, pending, off }, sources: [{ id, name, kind (single\|multi\|catalog), kindLabel, quote, quoteLabel, adapterName, category, categoryName, unit, endpoint, series, isActive, isPrimary, isReferenceRate, guard: { maxJumpPct, confirmTicks }, schedule: { status, intervalSec, staleAfterSec, syncedAt, failedAt, error, nextDueAt }, count, held, price, preview }] }` — a catalog sends only its size and three items |
| `GET` | `/api/v1/admin/price-sources/items?id=` | A source's items as its last sync stored them `{ id, items: [{ id, name, price }] }` (404 for an unknown id) |
| `POST` | `/api/v1/admin/price-sources` | `{ id, isActive }` — switch a source on or off (sources are defined in code; nothing else is saved) and rebuild the book |
| `DELETE` | `/api/v1/admin/price-sources` | Always 400: sources are defined in code; switch one off instead |
| `POST` | `/api/v1/admin/price-sources/set-primary` | `{ id }` — the source keeps the id it gives; the others' copies become `${sourceId}__${id}` |
| `POST` | `/api/v1/admin/price-sources/test` | `{ id }` — a dry run: fetched and parsed now, nothing stored, guarded or put in the book. `{ success, error?, count, sample (≤ 50), price (one item), datetime, ms }` |
| `POST` | `/api/v1/admin/price-sources/sync` | `{ id }` — fetch one source now through the full pipeline (merge, guard, storage, book, history): `{ success, count?, error? }` |
| `POST` | `/api/v1/admin/price-sources/fetch-all` | Fetch every active source now: `{ success, syncedCount, failedCount }` |
| `GET` | `/api/v1/admin/news/channels` | The news section's channels `[{ username, enabled }]` and international feeds `feeds: [{ id, title, url, enabled }]` (the default lists until one is saved), the last run by channel and feed (`status.channels`, `status.feeds`), `aiConfigured` (the `AI` binding) and the limits |
| `PUT` | `/api/v1/admin/news/channels` | `{ channels: [{ username, enabled }] }` and/or `{ feeds: [{ id?, title, url, enabled }] }` — save either list (`@name`, `t.me/name` accepted; a feed's address must be http(s), a new feed gets an id from it; repeats dropped). A new channel's last 10 posts, or a new feed's last 10 articles of the last 12 hours, are reviewed on its first read |
| `GET` / `PUT` | `/api/alerts/push/news` | Signed in: whether this browser (`?deviceId=` / `{ deviceId, enabled }`) gets a Web Push for important news; the browser must be subscribed first (`/api/alerts/push/subscription`). The push is plain `{ plain: 1, title, body, path, tag }` |
| `POST` | `/api/v1/admin/news/analysis` | Write the analyst's card now (whatever the interval) |
| `POST` | `/api/v1/admin/news/run` | Read the channels and feeds now; `{ result: { checked, candidates, published, aiCalls }, status }` |
| `POST` | `/api/v1/admin/news/<channel or feed>/<postId>/hidden` | `{ hidden }` — take a news item down (or put it back) |
| `GET` | `/api/v1/admin/demo` | Inspect demo account state (existence, non-confidential record counts, last updated) |
| `POST` | `/api/v1/admin/demo` | Idempotently create / ensure the single demo user account exists |
| `POST` | `/api/v1/admin/demo/edit-session` | Issue a short-lived `demo_edit` session token for the admin to populate/edit demo data |
| `POST` | `/api/v1/admin/demo/reset` | Purge all demo account vault and financial data (requires confirmation in UI) |

### Demo Gate (`demoGate.js`) Rules

Enforced centrally after the maintenance gate and before the encryption gate:
- **`demo_view` Sessions (Public Visitor):**
  - All mutating HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`) are blocked with `403` and `{ code: 'DEMO_READ_ONLY', message: 'این نسخه دمو است و تغییرات ذخیره نمی‌شود.' }`.
  - The single allowed mutating exception is `POST /api/auth/logout`.
  - All `/api/admin/*` routes are blocked (`403 FORBIDDEN`).
  - Read endpoints (`GET`) never perform background mutations (such as updating last active timestamp or auto-creating default portfolios) when requested by a `demo_view` session.
- **`demo_edit` Sessions (Admin Editing Demo Data):**
  - Normal app mutations are permitted to allow editing demo holdings, transactions, loans, incomes, cheques, and layouts.
  - Guardrails strictly block:
    - Modifying vault passphrase or re-wrapping vault key (`PUT /api/vault` with `previousWrappedKey`).
    - Changing credentials or account settings (`POST /api/auth/password`, any `signout-all` route).
    - Deleting account.
    - Enabling public portfolio sharing (`shareEnabled: true`).

