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
| `GET` | `/api/v1/portfolio/shared` | Retrieve a publicly shared user portfolio (`?id=...`) |

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

### User Settings & Portfolios (Protected)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/user/settings` | Retrieve user preferences and settings |
| `POST` / `PUT` | `/api/v1/user/settings` | Save user preferences |
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
  "notes": "با اضافه‌کاری"
}
```

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
