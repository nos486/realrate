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
    isActive: true,
    isPrimary: false,
    displayConfig: { showOnHomePage: true },

    // when the raw data needs custom processing:
    customParser: (data, cfg) => {
      // must return an array of items or a number
      return data.rates.map(r => ({ id: r.code, name: r.title, price: r.lastPrice }));
    },
  },
];
```

> [!NOTE]
> **Metadata ownership (an architecture rule):**
> `badge`, `badgeColor` and `iconName` are no longer set on a source; they come automatically from the category in [`categories.config.js`](../../api/src/config/categories.config.js), so the data can't drift.

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
1. `id`: the adapter's unique id (e.g. `telegram`, `api_url`, `forex_api`).
2. `name`: the adapter's Persian name.
3. `supports(sourceConfig)`: whether this source belongs to this adapter.
4. `fetchRaw(sourceConfig, env?)`: fetches the raw payload (HTML/JSON/array) from the external server.
5. `parse(raw, sourceConfig, env?)`: turns the raw payload into the standard shape.
6. `getItems(env?)`: the one function that returns the adapter's current items.

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

Adapters never write: `parse()` only returns items; the sync stores them.

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
┌─────────────────────────────────────────────────────────┐
│ Cloudflare Cron Trigger (every minute)                  │
└───────────────────────────┬─────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│ syncAllSources(env) in sourceSync.service.js            │
│ (one request per endpoint shared by several sources)    │
└─────────┬───────────────────────────────────────────────┘
          │
          ├─► fetchRaw()  ──► parse() ──► { items, datetime }
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│ saveSourceItems(env, sourceId, items)                   │
│ (source_items:<id>, only when changed) → price book     │
│ (prices) → price history (KV and D1)                    │
└─────────────────────────────────────────────────────────┘
```

With this design a new source only needs its entry in `sources.config.js` (and an adapter if its `sourceType` is new); polling, caching, the price book, the history, the catalog API and the UI all pick it up with no other code.
