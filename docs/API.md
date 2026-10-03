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
| `GET` | `/api/prices/book` | **The prices.** Every price in the standard shape, plus the public global settings: `{ updatedAt, items: { [id]: { id, price (toman), name, category, unit, sourceId, updatedAt, params } }, globalSettings }`. The web app's only price request. Sent with an `ETag` (`Cache-Control: no-cache`): while no price or setting changed, a revalidation gets `304` and no body. |
| `GET` | `/api/v1/market/items` | Older shape, kept for clients that haven't updated: unified market items (Gold, Coins, Silver, Forex, Bourse, Funds, Plans), priced from the book |
| `GET` | `/api/v1/prices` | Older shape, kept for clients that haven't updated: `{ prices: { [id]: { price, … } }, live_usd_toman, gold_usd, forex, reference_rates, globalSettings }`, read off the book (the ounce in dollars and currencies as rates against the dollar, as before) |
| `GET` | `/api/sparklines?keys=usd,gold_18k&range=1d` | Trend series from the Postgres price history, per asset id (`range`: `1d` per minute — the default, `7d`, `30d`, `1y`) |
| `GET` | `/api/v1/bourse/symbols` | Search and list Tehran Stock Exchange symbols (`?q=...&limit=...`) |
| `POST` | `/api/v1/bourse/sync` | Force synchronize bourse symbols cache |
| `GET` | `/api/app/latest` | The Android app's latest release, for its update check: `{ release: { version, tag, url, size, notes, publishedAt } \| null }`. Read from GitHub releases (the API, else the `releases/latest` redirect; optional `GITHUB_TOKEN`), kept 10 minutes in Postgres (`app_state`), the last known one served when GitHub fails. Answered during maintenance too. |
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
| `POST` | `/api/v1/auth/demo` | Public: create a short-lived `demo_view` session (2 hours) for the unique demo account (`users.is_demo = 1`); returns `{ token, user }`. Rate-limited per IP. |

Passwords: at least 8 characters with letters and digits, stored as PBKDF2-SHA256 (100,000 rounds).
Links are single-use, expire (verify 24 h, reset 1 h) and are stored only as SHA-256.
`register`, `resend` and `forgot` answer identically whether or not the email is registered, and all of
these endpoints are rate-limited (`429 TOO_MANY_REQUESTS`). Without an email provider they answer `503 EMAIL_NOT_CONFIGURED`.
Direct password or Google OAuth logins to the demo account (`demo@realrate.invalid` or `is_demo = 1`) are strictly rejected.

`GET /api/v1/auth/me`: Returns current user session details:
- `user`: `{ id, email, name, role, isDemo, emailVerified, createdAt, updatedAt }`
- `features`: Array of active feature flag keys enabled for the user (e.g. `['cheque_scan']`; admins also get beta features such as `cheque_scan_debug`).
- For demo sessions (`demo_view` or `demo_edit`), additionally returns:
  - `demo: { mode: 'view' | 'edit' }`
  - `demoVaultPassphrase`: Public passphrase for the demo vault (configured via `DEMO_VAULT_PASSPHRASE`).
For standard user sessions, demo properties are never included.


### User Settings & Portfolios (Protected)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/user/settings` | Retrieve user preferences and settings |
| `POST` / `PUT` | `/api/v1/user/settings` | Save user preferences |
| `GET` | `/api/v1/user/home-layout` | The user's customized home page `{ version, sections: [{ id, title, style, items }] }` or `null` (default page) |
| `PUT` | `/api/v1/user/home-layout` | Save the home page layout (`{ layout }`, sanitized by `domain/homeLayout.js`); `{ layout: null }` resets to default |
| `GET` | `/api/v1/portfolios` | List all portfolio groups for user (returns `itemCount` and `transactionCount`) |
| `POST` | `/api/v1/portfolios` | Create a new portfolio group |
| `PUT` | `/api/v1/portfolios` | Update portfolio group details |
| `DELETE` | `/api/v1/portfolios` | Delete portfolio group (cascades holdings and transactions) |
| `GET` | `/api/v1/portfolio` | Get items in a portfolio group |
| `POST` / `PUT` | `/api/v1/portfolio` | Add/update item in portfolio |
| `DELETE` | `/api/v1/portfolio` | Delete item from portfolio |
| `GET` | `/api/v1/portfolios/:id/transactions` | List all transactions for a portfolio (ordered by transactionDate DESC, createdAt DESC) |
| `POST` | `/api/v1/portfolios/:id/transactions` | Add a new buy/sell transaction (encrypted or plaintext payload) |
| `PUT` | `/api/v1/portfolios/:id/transactions` | Update an existing transaction (`{ id, ... }` in body) |
| `DELETE` | `/api/v1/portfolios/:id/transactions` | Delete a transaction (`?id=...` or route param) |

#### Transaction Payload Format
```json
{
  "encryptedPayload": "enc:e2ee:v1:BASE64...", // For Zero-Knowledge E2EE portfolios
  // Or plaintext properties for standard portfolios:
  "assetId": "gold_18k",
  "assetName": "طلای ۱۸ عیار",
  "category": "gold",
  "unit": "گرم",
  "transactionType": "buy", // "buy" | "sell"
  "quantity": 10.5,
  "unitPrice": 4850000,
  "transactionDate": "1403/06/25",
  "notes": "خرید پله‌ای"
}
```

### Incomes (Protected)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/incomes` | List the user's incomes (ordered by incomeDate DESC, createdAt DESC) |
| `POST` | `/api/v1/incomes` | Record a new income |
| `PUT` | `/api/v1/incomes/:id` | Update an income |
| `DELETE` | `/api/v1/incomes/:id` | Delete an income |

#### Income Payload Format
```json
{
  "title": "حقوق مهر",
  "category": "salary", // salary | freelance | business | investment | rental | gift | other
  "amount": 45000000,   // Toman, > 0
  "incomeDate": "2026-09-22", // Gregorian ISO date (displayed as Shamsi in the UI)
  "notes": "با اضافه‌کاری",
  "recurringId": "" // only on entries the removed fixed incomes created
}
```

### Cheques (Protected)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/cheques` | List the user's cheques (ordered by dueDate ASC, createdAt ASC) |
| `POST` | `/api/v1/cheques` | Register a cheque |
| `PUT` | `/api/v1/cheques/:id` | Update a cheque; a status change is sent with its new `history` entry |
| `DELETE` | `/api/v1/cheques/:id` | Delete a cheque and its tracking log |

Validation is the shared `api/src/domain/chequeDocument.js` (the browser uses the same rules for encrypted cheques).

#### Cheque Payload Format
```json
{
  "direction": "received",       // received (دریافتی) | issued (صادره)
  "status": "pending",           // pending | deposited* | cleared | bounced | transferred* | cancelled  (*received only)
  "amount": 45000000,            // Toman, > 0
  "dueDate": "2026-10-01",       // Gregorian ISO date (displayed as Shamsi in the UI)
  "counterparty": "شرکت آلفا",   // drawer (received) or payee (issued)
  "bankId": "mellat",            // optional: standard bank id or custom bank id
  "bankName": "",                // optional: free-text bank name
  "chequeNumber": "123456",      // optional, digits (/ and - allowed)
  "sayadId": "1234567812345678", // optional, exactly 16 digits
  "notes": "",
  "history": [                   // tracking log; defaults to the registration entry
    { "status": "pending", "date": "2026-09-25", "note": "" }
  ]
}
```

### AI Cheque Scan

Stateless image analysis with Gemini (`api/src/config/ai.config.js`, key in the `GEMINI_API_KEY` secret) for prefilling cheque details.
- **Feature Flag Gate**: Requires the `cheque_scan` feature (`requireFeature`, stage `ga`: every signed-in user).
- **Daily limit**: one use of the `cheque_scan` limit per scan (`config/usageLimits.js`): 10 a day for users, none for the admin, counted per Tehran day. Past it: `429 QUOTA_EXCEEDED`. Only a valid upload is counted, and a failed model call gives the use back. The response carries `quota: { limit, used, remaining }` (`limit`/`remaining` null: no limit).
- **Busy fallback**: when Google answers 503/429 (overloaded or out of quota) for the first model (`gemini-3.8-flash`), the scan tries the next ones in order (`gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`); each model has its own quota at Google. When every model is busy: `503 AI_BUSY`, and the user's daily use is given back.
- **Not configured**: without `GEMINI_API_KEY` the scan answers `503 SCAN_NOT_CONFIGURED` (the admin is told the secret's name).
- **Admin debug** (`cheque_scan_debug` feature, beta): the response adds `raw` (the model's answer), and a `502` names Gemini's error.
- **Encryption Gate Exemption**: This endpoint is explicitly exempted from the mandatory E2EE ciphertext gate because it does not store any financial data.
- **Privacy & Zero Storage Guarantee**: The image, model prompts, and structured output are **never** persisted to Postgres, disk, or logs.

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

### Loans (Protected)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/loans` | List loans with aggregates (`remainingBalance`, `paidCount`, `totalCount`, `nextDueInstallment`) |
| `POST` | `/api/v1/loans` | Create a loan (`bankId` or `lenderName`, optional `customInstallments` / `totalRepaymentAmount` / `customFirstInstallmentAmount`) |
| `GET` | `/api/v1/loans/:id` | Loan with its full computed installment schedule and extra payments |
| `PUT` | `/api/v1/loans/:id` | Update a loan (financial changes rebuild pending installments) |
| `DELETE` | `/api/v1/loans/:id` | Delete a loan and its installments |
| `PUT` | `/api/v1/loans/:id/installments/:installmentId` | Mark paid (`{ isPaid: true, paidDate, paidAmount, cascade }`) or unpaid (`{ isPaid: false }`) |
| `PUT` | `/api/v1/loans/:id/installments/bulk` | Re-plan pending installments (`{ knownAmounts, totalRepaymentAmount }`) |
| `GET` / `POST` | `/api/v1/loans/:id/extra-payments` | List / record an extra payment (`{ amount, paymentDate, reductionMode }`) |
| `GET` | `/api/v1/loans/:id/document` | Raw stored loan `{ loan, states, extraPayments }` (used to encrypt it) |

### Custom Banks (Protected)

Standard banks are static (`api/src/config/banks.config.js`) and ship with the client.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/banks/custom` | List the user's custom banks |
| `POST` | `/api/v1/banks/custom` | Add a custom bank (`{ name }`; returns the existing one for a duplicate name) |
| `DELETE` | `/api/v1/banks/custom/:id` | Remove a custom bank (loans keep their lender name) |

### End-to-End Encryption Vault (Protected)

All payloads are ciphertext produced in the browser (`enc:e2ee:v1:...`); see [E2EE_VAULT.md](E2EE_VAULT.md).
Encryption is mandatory. Without a vault, every save (`POST`/`PUT` of loans, incomes, cheques, portfolios, holdings,
transactions and custom banks) returns `403 ENCRYPTION_REQUIRED`; reads and deletes still work. With a vault, the plaintext
loan / income / cheque endpoints return `409 VAULT_ENABLED` and portfolio data must be ciphertext. The vault cannot be turned off.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/vault` | The account vault `{ salt, wrappedKey, version }` or `null`, plus `hasPlaintextData` (whether an account without it has data) |
| `PUT` | `/api/v1/vault` | Turn on, or re-wrap after a passphrase change (`previousWrappedKey` required; `409` on mismatch) |
| `POST` | `/api/v1/vault/reset` | Forgotten passphrase: deletes the vault and **all** the user's financial data (portfolios, holdings, transactions, loans, incomes, fixed incomes, cheques, custom banks, vault records and tombstones). `{ confirm: "RESET_ALL_DATA", password }` — `password` is the account password, required when the account has one (`400 INVALID_PASSWORD`, rate limited); not for the demo account. Sign-in and the home layout stay |
| `GET` | `/api/v1/vault/records/:kind` | Encrypted records of `loan`, `income`, `cheque`, `recurring_income` (older records only: fixed incomes were removed), `holding`, `transaction`, `portfolio_layout`, `expense_group`, `expense` or `bank_account` (the last three only with the `expenses` / `bank_accounts` feature, else `404`) — newest date first. Filters on the plaintext metadata only: `?from`, `?to` (inclusive `YYYY-MM-DD`), `?parent`, `?undated=1` (date missing or not yet Gregorian); `?order=asc\|desc`; with `?limit` (1–200) and `?offset` one page plus `total` |
| `PUT` | `/api/v1/vault/records/:kind/:id` | Create/replace a record (`{ payload, recordDate, parentId, replacePlain, vaultEpoch, reminder? }` — `recordDate` (`YYYY-MM-DD`) and `parentId` (portfolio for `holding`/`transaction`/`portfolio_layout`, required; section for `expense`, required) are plaintext; optional `reminder` for `loan` or `cheque` upserts or deletes the plaintext reminder index row in the same batch; `replacePlain` deletes the plaintext row with the same id in the same batch; `vaultEpoch`, the vault's `createdAt` the record was encrypted for, is refused with `409 VAULT_CHANGED` after a reset) |
| `DELETE` | `/api/v1/vault/records/:kind/:id` | Delete a record (also deletes its reminder row in the same batch) |
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
| `GET` | `/api/v1/admin/users/portfolio` | A user's portfolio summary (`?userId&portfolioId`) |
| `POST` | `/api/v1/admin/settings` | Save system-wide settings |
| `GET` | `/api/v1/admin/price-sources` | List all price crawler sources |
| `POST` | `/api/v1/admin/price-sources` | Add/update crawler price source |
| `DELETE` | `/api/v1/admin/price-sources` | Remove crawler price source |
| `POST` | `/api/v1/admin/price-sources/set-primary` | Set primary source for asset type |
| `POST` | `/api/v1/admin/price-sources/test` | Test fetching from specific source |
| `POST` | `/api/v1/admin/price-sources/inspect-api` | Fetch a JSON endpoint and list its fields (to write a source's parser) |
| `POST` | `/api/v1/admin/price-sources/fetch-all` | Trigger immediate fetch across all sources |
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

