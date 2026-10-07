# Adding a price source, and the adapter contract

Persian: [../ADDING_NEW_PRICE_SOURCE.md](../ADDING_NEW_PRICE_SOURCE.md)

In RealRate every price source is defined in code (**code-first**), with one source of truth.

---

## 1. The source's config in `sources.config.js`

To add a source, add it to the `PRICE_SOURCES_CONFIG` array in [`api/src/config/sources.config.js`](../../api/src/config/sources.config.js):

```javascript
// api/src/config/sources.config.js
export const PRICE_SOURCES_CONFIG = [
  {
    id: "src_def_my_source",
    name: "The source's official name (e.g. Charisma investment funds)",
    brand: "کاریزما",               // short brand shown in parentheses after item names
    priceType: "my_source_type",
    sourceType: "api_url",          // or "telegram", "forex_api", "bourse_symbols", "charisma_funds", ...
    endpoint: "https://api.example.com/rates",
    category: "bourse_fund",        // a category from categories.config.js
    unit: "واحد",                   // counting unit (toman, gram, piece, share, unit, dollar, USDT)
    isFund: true,                   // is it a fund or plan?
    fetchIntervalSec: 60,           // polling period in seconds
    // optional: what the source quotes in — "toman" (default), "rial", "usd", "usd_cross"
    // quote: "usd",
    // optional: for a catalog, the market its ids belong to ("bourse" → "bourse__<symbol>")
    // market: "bourse",
    // optional — guard against implausible and stale prices:
    // maxJumpPct: 25,              // largest change between two fetches (%); more is held until it repeats
    // confirmTicks: 3,             // fetches in a row before a real jump is accepted
    // staleAfterSec: 1800,         // after this long without a successful fetch the price is marked "stale"
    // optional: what the source gives (see "Source kinds" below)
    // outputs: "multi",            // several items with ids of their own (a feed)
    // isCatalog: true,             // a market's whole list (needs `market`)
    isActive: true,
    isPrimary: false,
    displayConfig: { showOnHomePage: true },
  },
];
```

> [!NOTE]
> **Metadata ownership (an architecture rule):**
> `badge`, `badgeColor` and `iconName` are no longer set on a source; they come automatically from the category in [`categories.config.js`](../../api/src/config/categories.config.js), so the data can't drift.

### Source kinds

What a source gives is read from its config alone (`domain/priceSources.js`, `sourceKindOf`):

| Kind | Config | Example | Items |
|---|---|---|---|
| single (تک‌نرخی) | neither of the two | the free-market dollar, 18k gold | one, under the source's `priceType` |
| multi-output (چندخروجی) | `outputs: "multi"` | world currencies (forex), tgju series | several, each with its own id |
| catalog (کاتالوگ) | `isCatalog: true` + `market` | exchange symbols, Mofid and Charisma funds | a market's whole list, ids `${market}__${symbol}` |

A catalog's list is **merged with its previous one** (`mergeCatalogItems`): a symbol a fetch leaves out, or gives without a price, keeps its last price, so a partial answer never empties a market.

Everything a source needs lives in its config, never in its adapter: the endpoint, `jsonPath`/`regex` (api_url), `series` (tgju), `metaEndpoint` and `symbolMap` (Charisma funds: English name → exchange ticker), and `knownItems` (the names and units shown for an item known only by its id, e.g. Charisma's plans). An api_url source whose answer `jsonPath` can't reach may set `customParser(data, src)` returning a number.

### Fetch schedule and status

- **Interval:** `fetchIntervalSec` (at least 15 s, default 60). The cron runs every minute and fetches every source due: one interval after its **last try, successful or not** — so a failing source waits its interval too and doesn't hammer the endpoint every minute.
- **Stale:** after `staleAfterSec` (default: 5 intervals, at least 30 minutes) without a successful fetch.
- **Status** (`sourceScheduleOf`): `off` (switched off), `pending` (never synced), `error` (its last try failed; the server's own error is kept), `stale`, or `ok`.

In the admin panel a source can only be switched off or made the primary one for its id (kept in D1, key `price_source_overrides`); sources are never created or deleted there.

---

### tgju series and indicators that are not assets

- **A tgju source** (`sourceType: "tgju_indicators"`) lists its series in `series: [{ slug, id, name }]` (`tgju.org/profile/<slug>`); each one's latest value in tgju's daily table becomes the item `id` (`services/market/tgju.client.js`, the same reader the history backfill uses), in the source's `quote` (tgju is usually in rials). A series that fails is left out; the others still update.
- **A category that can't be held** (`holdable: false` in `categories.config.js`, e.g. `bubble`) shows on cards and charts but never in the portfolio or its asset search (`isHoldableCategory`).
- **An indicator of another item:** a spec with `bubbleOf` (`bubble.spec.js`) gets its percent of that item's value without it in `params.bubblePct`.
- For past days, add the slug with `suggest` to `config/tgjuCatalog.js` so the admin's history panel offers it.

## 2. The adapter contract

Every source adapter (in `api/src/services/market/sources/` or a custom one) **must** follow this contract:

### The `ISourceAdapter` interface
An adapter knows one kind of endpoint and nothing else. It is chosen by the `sourceType` a source names (`sources/index.js`; an unknown type has no adapter and the sync reports it), and it keeps no state between calls.
1. `id`: the `sourceType` it serves (e.g. `telegram`, `api_url`, `forex_api`).
2. `name`: its Persian name (shown on the admin page).
3. `fetchRaw(sourceConfig, env?)`: reads the endpoint; a failed request **throws** with a message an admin can act on (e.g. `پاسخ وب‌سرویس بورس: 503`) — that message is what the admin page shows.
4. `parse(raw, sourceConfig)`: turns the answer into the standard shape, and throws when it holds no price.

An adapter never writes, caches, merges or reads stored data, and has no default URLs, ids or symbols: the pipeline does the rest, the same way for every source. Its item extraction is a pure exported function (e.g. `bourseItemsOf`, `charismaFundItemsOf`), tested on its own.

### The required output of `parse()`:
```javascript
{
  items: [
    {
      id: "item_key", // the item's own symbol or code; the price book adds the market prefix
      name: "The item's cleaned name",
      price: 154200 // the final price, in the source's quote unit
    }
  ],
  datetime: "2026-09-21T10:00:00.000Z" // a valid ISO 8601 string
}
```

> [!IMPORTANT]
> **Single- and multi-price sources:**
> Even single-value sources (the free-market dollar, 18k gold, the Emami coin) return `parse` output as a one-item array `items: [{ id, name, price }]`.

Adapters never write: `parse()` only returns items; the sync merges (a catalog), guards and stores them.

---

## 3. The id contract

An id names the asset, not the source: Foolad is always the same Foolad, whichever source it comes from.
For catalog items: `${market}__${symbol}`, where `market` is set in the source's config.

- **Examples:**
  - `bourse__فولاد` (the Foolad symbol, from any source)
  - `bourse__اهرم` and `bourse__عیار` (exchange-traded funds: the same id as on the exchange)
  - `charisma_plan__gold` (Charisma's gold plan)
  - `usd`, `usdt`, `gold_18k` (single-price sources: the priceType)
- When two sources give the same id, the first (the primary, in config order) keeps it and the others' copies become `${sourceId}__${id}`.
- Ids have one form: lower-case, Arabic ي/ك as ی/ک, Persian digits as 0–9, no zero-width characters.

---

## 4. The display engine

No part of the frontend or the routes renders a source name or unit by hand or with `if / switch`. All display goes through [`displayEngine.js`](../../api/src/domain/displayEngine.js) (available in the frontend as `web/src/config/displayEngine.js`):

```javascript
import {
  getItemDisplayName, // the standard "{item name} ({source name})"
  getItemUnit,        // the unit from the source's config
  getItemCategory,    // a valid category from the source's config
  getItemBadge,       // the Persian badge from categories.config.js
  getCategoryColor,   // the badge color (amber, emerald, indigo, ...)
  getCategoryIconName,// the Lucide icon name (Award, Coins, TrendingUp, ...)
  getSourceBrand,     // the source's brand (bourse, Charisma, Mofid, Zarma, ...)
} from "../config/displayEngine.js";

// usage:
const displayName = getItemDisplayName({ id: "bourse__فولاد", name: "فولاد مبارکه" });
// → "فولاد مبارکه (بورس)"

const unit = getItemUnit("gold_18k");
// → "گرم"

const category = getItemCategory("src_def_charisma__اهرم"); // an old id is read too
// → "bourse_fund"

const badge = getItemBadge("src_def_charisma__اهرم");
// → "صندوق"
```

---

## 5. Storage and orchestration

```
Cloudflare Cron Trigger (every minute)
  └─ syncAllSources(env)                       sourceSync.service.js
       ├─ due sources only (isSourceDue: one interval after the last try)
       ├─ one request per endpoint shared by several sources
       ├─ fetchRaw() → parse() → { items, datetime }
       ├─ a catalog: mergeCatalogItems(previous, fresh)
       ├─ guardSourceItems(): an implausible jump is held until it repeats
       ├─ saveSourceItems(): source_items:<id>, only when changed
       ├─ the price book ("prices", with each source's syncedAt / failedAt / error)
       └─ the price history
```

A failed source keeps its last prices in the book; its error and time are recorded under the book's `sources`.

## 6. The admin's price sources page

`/admin/sources` (`web/src/features/admin/components/AdminPriceSourcesPage.jsx`) shows every source in two groups — «سورس‌های نرخ پایه (طلا، ارز، سکه)» (single) and «هاب سورس‌های چند خروجی و فیدها» (multi-output and catalogs) — with a status summary. For each source: its status and last error, its fetch interval («هر ۵ دقیقه»), last successful fetch, next fetch, when it turns stale, quote, kind, adapter, category and unit, jump guard, endpoint or tgju series, and what it gave (its price, or its size and a three-item preview). Actions: on/off, make primary (only where several sources give the same id), **test** (a dry run: fetched and parsed now, nothing kept), **fetch now** (through the full pipeline) and **all items** (a feed's stored list, searchable). The server builds the rows (`services/market/priceSourcesAdmin.service.js`); a catalog's thousands of items are only sent when asked for.

With this design a new source only needs its entry in `sources.config.js` (and an adapter if its `sourceType` is new); polling, caching, the price book, the history, the catalog API and the UI all pick it up with no other code.
