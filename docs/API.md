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
| `GET` | `/api/v1/market/items` | Unified market items (Gold, Coins, Silver, Forex, Crypto, Bourse) |
| `GET` | `/api/v1/prices` | Raw price snapshots across all active sources |
| `GET` | `/api/v1/sparklines` | Sparkline price trends (24h) |
| `GET` | `/api/v1/bourse/symbols` | Search and list Tehran Stock Exchange symbols (`?q=...&limit=...`) |
| `POST` | `/api/v1/bourse/sync` | Force synchronize bourse symbols cache |
| `GET` | `/api/v1/portfolio/shared` | Retrieve a publicly shared user portfolio (`?id=...`) |

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
| `GET` | `/api/v1/portfolios` | List all portfolio groups for user |
| `POST` | `/api/v1/portfolios` | Create a new portfolio group |
| `PUT` | `/api/v1/portfolios` | Update portfolio group details |
| `DELETE` | `/api/v1/portfolios` | Delete portfolio group |
| `GET` | `/api/v1/portfolio` | Get items in a portfolio group |
| `POST` / `PUT` | `/api/v1/portfolio` | Add/update item in portfolio |
| `DELETE` | `/api/v1/portfolio` | Delete item from portfolio |

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
