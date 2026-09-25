# RealRate API Documentation

## API Versioning Policy

RealRate Cloudflare Worker API supports versioned routing starting with **v1**.

### Base Paths
- **Versioned API (Current Standard):** `/api/v1/...`
- **Legacy API (Backward-Compatible):** `/api/...`

> **Note on New Feature Development:**
> Any new endpoints, modifications, or feature expansions **MUST** be implemented under `/api/v1/...`.
> The unversioned `/api/...` routes are retained strictly for backward compatibility with older web client deployments and will mirror v1 controllers.

---

## Endpoint Catalog

### Public Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/market/items` | Unified market items (Gold, Coins, Silver, Forex, Crypto, Bourse, Funds, Plans) |
| `GET` | `/api/v1/prices` | Raw price snapshots across all active sources |
| `GET` | `/api/v1/sparklines` | Sparkline price trends (24h) |
| `GET` | `/api/v1/bourse/symbols` | Search and list Tehran Stock Exchange symbols (`?q=...&limit=...`) |
| `POST` | `/api/v1/bourse/sync` | Force synchronize bourse symbols cache |
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
*Note: Catalog item IDs strictly adhere to `${sourceId}__${itemKey}` format, whereas single-item sources use their canonical ID (e.g. `gold_18k`, `usd_bonbast`).*

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
| `POST` | `/api/v1/auth/password/forgot` | `{ email }` — email a reset link (also how a Google account adds a password) |
| `POST` | `/api/v1/auth/password/reset` | `{ token, password }` → sets it, verifies the address, signs out other sessions, returns `{ token, user }` |
| `POST` | `/api/v1/auth/password` | Signed in: `{ newPassword, currentPassword? }` — add a first password or change it (other sessions are signed out) |

Passwords: at least 8 characters with letters and digits, stored as PBKDF2-SHA256 (100,000 rounds).
Links are single-use, expire (verify 24 h, reset 1 h) and are stored only as SHA-256.
`register`, `resend` and `forgot` answer identically whether or not the email is registered, and all of
these endpoints are rate-limited (`429 TOO_MANY_REQUESTS`). Without an email provider they answer `503 EMAIL_NOT_CONFIGURED`.

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

| `GET` | `/api/v1/incomes/recurring` | List fixed (recurring) income rules |
| `POST` | `/api/v1/incomes/recurring` | Create a rule (`{ title, category, amount, startDate, intervalMonths, dayOfMonth?, endDate?, notes?, active? }`) |
| `PUT` | `/api/v1/incomes/recurring/:id` | Update a rule (the browser also advances `generatedThrough` here) |
| `DELETE` | `/api/v1/incomes/recurring/:id` | Delete a rule (entries it created stay) |

The browser creates the due entries itself (normal `POST /incomes` with `recurringId`), then advances the rule's
`generatedThrough`, so it works identically for encrypted accounts and a deleted entry is never re-created.
Occurrences fall on `dayOfMonth` of every `intervalMonths` Shamsi months (clamped to shorter months); see
`api/src/domain/recurringIncome.js`.

#### Income Payload Format
```json
{
  "title": "حقوق مهر",
  "category": "salary", // salary | freelance | business | investment | rental | gift | other
  "amount": 45000000,   // Toman, > 0
  "incomeDate": "2026-09-22", // Gregorian ISO date (displayed as Shamsi in the UI)
  "notes": "با اضافه‌کاری",
  "recurringId": "" // set on entries a fixed income created
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
While a vault exists, plaintext `POST` of loans, incomes, cheques and portfolios returns `409 VAULT_ENABLED`.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/vault` | The account vault `{ salt, wrappedKey, version }` or `null` |
| `PUT` | `/api/v1/vault` | Turn on, or re-wrap after a passphrase change (`previousWrappedKey` required; `409` on mismatch) |
| `DELETE` | `/api/v1/vault` | Turn off — refused (`409`) while any record or portfolio is still encrypted |
| `GET` | `/api/v1/vault/records/:kind` | Encrypted records of `loan` or `income` |
| `PUT` | `/api/v1/vault/records/:kind/:id` | Create/replace a record (`{ payload, replacePlain }` — `replacePlain` deletes the plaintext row with the same id in the same batch) |
| `DELETE` | `/api/v1/vault/records/:kind/:id` | Delete a record |
| `POST` | `/api/v1/vault/records/:kind/:id/restore` | Write the decrypted record back to the plaintext tables and drop the encrypted copy (`{ plain }`) |

Portfolios protected by the vault carry `e2eeWrappedKey`; `/api/v1/portfolio/shared` reports `e2eeLinkKey: true` for them
(the viewer needs the key from the share link's `#k=` fragment).

### Admin Endpoints (Admin Role Only)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/admin/stats` | System statistics and telemetry |
| `GET` | `/api/v1/admin/users` | List registered users |
| `POST` | `/api/v1/admin/settings` | Save system-wide settings |
| `GET` | `/api/v1/admin/price-sources` | List all price crawler sources |
| `POST` | `/api/v1/admin/price-sources` | Add/update crawler price source |
| `DELETE` | `/api/v1/admin/price-sources` | Remove crawler price source |
| `POST` | `/api/v1/admin/price-sources/set-primary` | Set primary source for asset type |
| `POST` | `/api/v1/admin/price-sources/test` | Test fetching from specific source |
| `POST` | `/api/v1/admin/price-sources/fetch-all` | Trigger immediate fetch across all sources |
