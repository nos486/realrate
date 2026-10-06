# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

RealRate is a market-analysis and personal-finance app for Iran, live at realrate.geekio.org. On the market side it shows the intrinsic value and bubble of gold and coins, plus currencies, Tehran Stock Exchange symbols and funds. It also has AI-curated market news and a daily AI analysis (Workers AI). On the personal side it covers portfolios, expenses and budgets, accounts, loans, incomes, cheques and a yearly report, and all of this data is end-to-end encrypted. The Android app also records expenses from bank SMS.

It is an npm-workspaces monorepo: `api/` is a framework-less Cloudflare Worker (D1 + KV + Workers AI), and `web/` is a React 19 + Vite 8 SPA/PWA that is also packaged as the Android app with Capacitor 8 (`web/android`, id `ir.realrate.app`). The UI is Persian only: right-to-left, Shamsi (Jalali) dates, amounts in **tomans**, dark theme, Vazirmatn font. Write UI strings and CHANGELOG entries in Persian. The primary docs are in Persian, with English versions in `docs/en/` (`docs/ARCHITECTURE.md` and `docs/API.md`, the REST route reference, are English only). The doc index is the table in `README.en.md`.

External services: Gemini (`GEMINI_API_KEY`) for AI cheque scanning, Resend (`RESEND_API_KEY`) for verification, password-reset and reminder emails, and Google OAuth for sign-in.

## Commands

```bash
npm install
npm run dev                 # API (wrangler dev, :8787) + web (Vite, :5173) together
npm run api:dev / web:dev   # one side only
npm test                    # api Vitest suite, then web SEO tests (node --test)

# Single test file / test name (run from api/)
cd api && npx vitest run tests/unit/priceBook.test.js
cd api && npx vitest run -t "part of the test name"

cd web && npm run lint      # oxlint
cd web && npm run build     # vite build + scripts/build-seo.mjs (static SEO pages, sitemap)
cd web && npm run build:app # Android web bundle (--mode app → dist-app); android:sync also runs cap sync
cd api && npm run db:schema # print the D1 DDL generated from src/repositories/d1Schema.js
```

- Vite's `/api` proxy targets the **live** backend (`https://realrate-api.geekio.org`) unless `VITE_PROXY_TARGET` is set (e.g. `VITE_PROXY_TARGET=http://localhost:8787`).
- Web build-time env: `VITE_API_URL` (API address), `VITE_GOOGLE_CLIENT_ID`, and `VITE_APP_VERSION` (set by the APK build and sent in `X-RealRate-Client`).
- To preview the Android app shell in a desktop browser, add `?app=1` to the URL.
- `wrangler dev` uses local D1/KV; tables are created on first use (`ensureSchema`), so there are no migrations to run. To develop without the email service, run `npx wrangler dev --var EMAIL_DEBUG_LOG:true` and email bodies go to the log.
- **All Vitest tests live in `api/tests/unit/`, including the web's React/UI tests** (`*.test.jsx`, importing `../../../web/src/...`, using happy-dom + Testing Library). `web/tests/` only holds the SEO page tests. Test helpers (`api/tests/helpers/`) provide an in-memory/SQLite D1 (`sqliteD1.js`, `memoryStateDb.js`).

## Deployment

Merging to `main` deploys everything: web to Cloudflare Pages, API via Cloudflare Workers Builds, and a signed APK to GitHub Releases (`.github/workflows/android.yml`). Release notes come from lines added to `CHANGELOG.md` since the previous `v1.0.N` tag (`.github/scripts/release-notes.mjs`), and the Android app shows them in its update prompt — user-visible changes get a Persian bullet under `## [Unreleased]`. Plain Worker vars belong in `api/wrangler.toml` (`wrangler deploy` overwrites dashboard vars).

## Architecture

### Shared code via symlinks
Shared config and pure domain logic are written **only in `api/src/`**; `web/src/config/*` and many `web/src/utils/*` files are symlinks into `api/src/config/` and `api/src/domain/` (table in `docs/en/PROJECT_STRUCTURE.md`). Always edit the `api/` source. Code in `api/src/domain/` therefore must run in both the Worker and the browser (no Worker bindings; e.g. the price-history writer is injected by `index.js` via `setPriceHistoryWriter`). `displayEngine.js` is the single source for item names, units, categories, colors and icons on both sides — don't hardcode display logic in components.

### API (`api/src/`)
- `index.js`: hand-written router + `scheduled` handler (cron every minute). Request gates in order: CORS preflight → CSRF origin check on writes → sign-in routes → maintenance → demo gate → mandatory-encryption gate → route. Feature-gated routes call `requireFeature` (`lib/features.js`), costly ones `consumeQuota` (`lib/usageQuota.js`). Errors are thrown as `AppError` (`lib/AppError.js`) and serialized by `middlewares/errorHandler.js`.
- Layers: `handlers/` (HTTP) → `services/` / `domain/` (logic) → `repositories/` (all SQL/KV access). Tables are defined in `repositories/d1Schema.js`; bumping the schema version reruns the DDL.
- **Storage standard** (see `docs/ARCHITECTURE.md`): KV (`kvStore.repository.js`) only for large read-mostly blobs (price book `prices`, `source_items:*`, `history:<id>` snapshots); D1 `app_state` (`stateStore.repository.js`) for small state that must read back exactly (counters, quotas, source sync state, overrides) because KV is eventually consistent and write-limited; hot small values (sessions, groups, feature rules) cached in isolate memory (`lib/isolateCache.js`).
- **Price pipeline**: `services/market/sourceSync.service.js` (`syncAllSources`) is the only price pipeline. Source adapters in `services/market/sources/` implement `ISourceAdapter` (`fetchRaw` / `parse` → `{ items, datetime }`) and never write. Sources are declared in `config/sources.config.js` / `sourceRegistry.js`. The sync builds the **price book** (`domain/priceBook.js`): every item is `{ id, price, name, category, unit, sourceId, updatedAt, params }` with `price` always in tomans and normalized lowercase ids; dollar-quoted assets also carry `currency: "usd"` / `priceUsd`. `domain/priceGuard.js` holds back implausible jumps. Every other price shape (reference rates, legacy endpoints) is a view in `domain/priceBookViews.js`. Old stored ids map to book ids via `domain/priceIds.js` (`toPriceId`, `PRICE_ID_VERSION`).
- Daily price history: D1 `price_daily` candles (`priceHistory.repository.js`), served from KV snapshots (`priceHistoryStore.repository.js`) so history reads hit no D1 rows.
- Guides: `docs/en/ADDING_NEW_PRICE_SOURCE.md`, `docs/en/ADDING_NEW_ASSET.md`, `docs/en/BANK_SMS.md` (bank SMS templates in `domain/bankSmsTemplates.js`).

### Web (`web/src/`)
- Feature-based: `features/<feature>/` colocates UI, hooks and API modules; `pages/MainPage` hosts the app sections; `shared/` holds UI primitives, `httpClient` (token + `X-RealRate-Client` header), Android shell (`shared/app`), native Capacitor bridges (`shared/native`), offline IndexedDB copy and outbox (`shared/offline`), and feature flags (`shared/features`).
- The browser never computes prices: `PricingContext` / `features/market/priceBookAssets.js` load `/api/prices/book?part=core` plus `/api/prices/catalog` and look prices up by book id.
- **E2EE** (`shared/vault/`, `lib/e2ee.js`, `docs/en/E2EE_VAULT.md`): financial records (portfolios, transactions, loans, incomes, cheques, expenses, accounts) are encrypted client-side; the server stores only ciphertext in `vault_records`. Each feature's API module (`loanApi`, `chequeApi`, …) reads/writes through its vault store (`vaultLoans.js`, …) and validates with the shared domain document module (`domain/*Document.js`). On the server, `lib/encryptionGate.js` rejects any unencrypted write of financial data. The legacy plaintext repositories are read/delete only. The Android offline copy syncs incrementally through `GET /api/vault/sync`, which includes tombstones for deletes.
- Android-only behavior is branched on `isNativeApp()` (`shared/native`): the bottom-nav shell, a personal dashboard on home, bank SMS reading (the text stays on the device), fingerprint unlock and offline use. See `docs/en/ANDROID.md`.
- Styling: semantic color tokens in `styles/tokens.css` only (no raw hex), flat design — no shadows, glows or gradients; categorical chart colors only from `shared/ui/chartColors.js`. Android-specific layout in `styles/app-shell.css`. Full rules: `docs/en/DESIGN.md`.
