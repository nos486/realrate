# Project structure

Persian: [../PROJECT_STRUCTURE.md](../PROJECT_STRUCTURE.md)

The repository is an **npm workspaces monorepo** with two parts: `api/` (a Cloudflare Worker) and `web/` (React 19 + Vite, from which the Android app is also built).
Configuration and shared logic are written only in `api/`; `web/` uses the same files through **symlinks**.

```text
realrate/
├── package.json                  # Shared scripts (dev, test, deploy)
├── README.md / README.en.md      # Introduction (Persian / English)
├── CHANGELOG.md                  # Release notes for GitHub Releases
├── .github/workflows/android.yml # Build and publish signed release APK (main → Releases)
│
├── api/                          # Backend: Cloudflare Worker (D1 and KV)
│   ├── wrangler.toml             # Bindings, variables and Cron
│   ├── tests/
│   │   ├── helpers/              # Test tools (in-memory database, …)
│   │   └── unit/                 # Vitest tests (API and web units)
│   └── src/
│       ├── index.js              # Routing and the Worker entry (fetch + scheduled)
│       ├── config/               # Single sources: price sources, categories, banks, features, usage limits, AI
│       ├── domain/               # Pure logic shared with the web app: price book, formulas, display engine,
│       │                         #   loans, cheques, expenses, accounts, bank SMS, loan funding, client info, …
│       ├── handlers/             # HTTP controllers (market, auth, portfolio, transaction, loan, income,
│       │                         #   cheque, cheque scan, bank, vault, demo, admin)
│       ├── repositories/         # D1 and KV access (repository pattern); tables in d1Schema.js
│       ├── services/             # market/ (source adapters and the price sync), ai/ (Gemini)
│       ├── jobs/                 # Cron job (price sync)
│       ├── lib/                  # Auth, encryption/demo/maintenance gates, email, CORS, logging
│       └── middlewares/          # Error handling
│
└── web/                          # Frontend: React SPA (website + PWA + Android app)
    ├── capacitor.config.json     # Android app id and settings (ir.realrate.app)
    ├── android/                  # Android project (Gradle) and the native Java plugins (SMS, fingerprint)
    ├── scripts/build-seo.mjs     # Builds the static SEO pages (/android, feature pages, sitemap)
    ├── tests/seo/                # SEO page tests (node --test)
    └── src/
        ├── App.jsx, main.jsx     # Routes and mounting
        ├── pages/                # MainPage (every app section), landing, public portfolio, admin, maintenance
        ├── components/           # Header, footer, mobile menu, asset search, account settings
        ├── features/             # Feature modules:
        │                         #   home, market, portfolio, transactions, expenses, accounts, loans,
        │                         #   incomes, cheques, sms-inbox, app-settings, auth, demo, admin
        ├── shared/
        │   ├── ui/               # Base components (Modal, Button, DonutChart, Skeleton, …)
        │   ├── api/              # httpClient (token, X-RealRate-Client header, errors)
        │   ├── app/              # Android app shell: bottom navigation, quick add, "more"
        │   ├── native/           # Native bridges: SMS, fingerprint, haptics, app detection
        │   ├── offline/          # Encrypted local copy (IndexedDB), sync and the offline queue
        │   ├── vault/            # End-to-end encryption (state, migration, one encrypted store per record kind)
        │   ├── banks/            # Bank picker and logos, custom banks
        │   ├── features/         # Feature flags (useFeature, <Feature>)
        │   ├── hooks/, utils/    # Shared hooks and helpers (dates, CSV, …)
        │   └── pwa/              # PWA install and update
        ├── seo/pages.js          # Content of the static SEO pages
        ├── lib/e2ee.js           # Crypto primitives (Web Crypto)
        ├── config/               # Symlinks to api/src/config and the display engine
        ├── utils/                # Symlinks to shared logic in api/src/domain (+ the web app's own helpers)
        └── styles/               # Tokens and styles (dark theme; app-shell.css for the app)
```

## Shared files (symlinks)

| File in `web/src` | Source in `api/src` |
| :--- | :--- |
| `config/banks.config.js`, `categories.config.js`, `features.js`, `sourceRegistry.js`, `sources.config.js` | `config/` |
| `config/displayEngine.js` | `domain/displayEngine.js` |
| `utils/priceBook.js`, `priceBookViews.js`, `priceIds.js` | `domain/` — price book and ids |
| `utils/loanCalculator.js`, `loanDocument.js` | `domain/` — loan schedule and loan document |
| `utils/loanFunding.js` | `domain/loanFunding.js` — loan usage and the return on purchases |
| `utils/chequeDocument.js`, `chequeScan.js` | `domain/` — cheque validation and scanning |
| `utils/expenseDocument.js`, `accountDocument.js` | `domain/` — expenses and accounts |
| `utils/bankSms.js`, `bankSmsTemplates.js` | `domain/` — reading bank SMS |
| `utils/clientInfo.js` | `domain/clientInfo.js` — the client header (app/web and version) |
| `utils/homeLayout.js`, `portfolioLayout.js` | `domain/` — home layout and portfolio categories |
| `utils/financialSpecs.js` | `lib/financialSpecs.js` |

To change any of them, edit the source in `api/`. `utils/calculator.js` and `utils/pricingEngine.js` belong to the web app (intrinsic value and bubble at the live rates).
