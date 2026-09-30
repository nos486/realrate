# Adding an asset

Persian: [../ADDING_NEW_ASSET.md](../ADDING_NEW_ASSET.md)

How to add an asset to prices, the portfolio, search and the home page.

---

## Principles
1. **Generic:** no name or formula is hard-coded in a component. Every asset gets its details from its **canonical spec**.
2. **One source of truth:** an asset's details (name, symbol, flag, unit, category, aliases) are defined once and shared everywhere (backend, frontend, search, portfolio, home cards).
3. **Several currencies:** a card can show an asset quoted in **tomans** or **dollars** (or another unit), with its toman equivalent computed on the fly.

---

## 1. The asset's canonical spec

Specs live by category in `api/src/domain/specs/`:
- **Gold**: `gold.spec.js`
- **Silver**: `silver.spec.js`
- **Coins**: `coin.spec.js`
- **Currencies (forex)**: `forex.spec.js`
- **Crypto**: `crypto.spec.js`
- **Cash**: `cash.spec.js`

### Example spec:
```javascript
// the world gold ounce in api/src/domain/specs/gold.spec.js
ons_gold: {
  id: 'ons_gold',
  code: 'XAU',                          // international code
  symbol: 'XAU',
  flag: '🪙',                           // emoji or icon
  name: 'انس طلای جهانی',                // official Persian name
  category: 'gold',                     // 'gold' | 'coin' | 'silver' | 'currency' | 'crypto'
  badge: 'انس',
  unit: 'دلار',                         // quote unit (dollar or toman)
  weight: 31.1034768,                   // weight in grams
  carat: 24,
  targetBubblePct: 0,
  formulaText: 'نرخ لحظه‌ای هر تروا انس طلا در بازارهای بین‌المللی',
  aliases: ['انس', 'اونس', 'انس طلا', 'اونس طلا', 'طلای جهانی', 'انس جهانی', 'XAU', 'xau'],
}
```

A coin also has `gold24kWeight` (its pure 24k gold in grams, e.g. `7.3197` for the full coin), from which its intrinsic value is computed.

> [!NOTE]
> `api/src/domain/specs/registry.js` registers every spec's aliases and codes in `CANONICAL_ASSET_REGISTRY` automatically, so an alias added to a spec is found at once by the universal search and the portfolio.

## 2. The asset's price: the price book

The browser never makes up a price; every price comes from the server's **price book** (`api/src/domain/priceBook.js`, `GET /api/prices/book`), and each asset is one standard item under its spec's id (e.g. `ons_silver`): `{ id, price, name, category, unit, sourceId, updatedAt, params }`.

- **An asset with a price source** (currency, crypto, coin, stock symbol, fund): add the source in `api/src/config/sources.config.js` — [ADDING_NEW_PRICE_SOURCE.md](ADDING_NEW_PRICE_SOURCE.md). The source's item is merged with the spec of the same id (name, category and unit from the spec).
- **Gold, coins and silver**: the intrinsic value is computed from the ounce and the dollar with the spec's `gold24kWeight` (or `weight` and `silverRatio` for silver). If a source gives the market price, `params.intrinsic` and `params.bubblePct` are added to that item; otherwise the intrinsic value becomes an item by itself (`params.derived: 'intrinsic'`).
- **A currency quoted against the dollar**: a source with `quote: 'usd_cross'` (like forex) is converted to tomans once, with the book's own dollar.

## 3. On the home page

The home page is built from each user's layout (`api/src/domain/homeLayout.js`, `web/src/features/home/`):

- A user adds any price book asset to any section with "customize"; nothing else is needed.
- **The default layout** (`buildDefaultLayout` in `web/src/features/home/homeLayoutModel.js`): the "gold and coins" section with every gold and coin analysis item, and the "currencies and assets" section with currencies in the order of `DEFAULT_PRIORITY_CURRENCIES` (same file). To move a currency forward, add its code to that array.
- The admin can hide an item from the default home page (`showOnHomePage` in the source's settings → `params.hideOnHome`).
- **Presets** (`HOME_PRESETS` in the same file) are also built from the live catalog.

## 4. Search and names

- Spec aliases are registered in `CANONICAL_ASSET_REGISTRY` (`api/src/domain/specs/registry.js`); the universal asset search (`UniversalAssetSearch.jsx`), the portfolio's CSV import and the forms find assets by them.
- Display name, unit, category, badge, color and icon come only from `displayEngine.js`; no component writes a name or unit by hand.

## 5. Example: the silver ounce (XAG)

1. The spec in `api/src/domain/specs/silver.spec.js` (`id: 'ons_silver'`, `code: 'XAG'`, `unit: 'دلار'`, aliases).
2. A silver ounce price source in `sources.config.js` (e.g. `https://api.gold-api.com/price/XAG`) with `priceType: 'ons_silver'`. From it the price book also builds the silver gram and the intrinsic value of silver items.
3. If needed, add `'XAG'` to `DEFAULT_PRIORITY_CURRENCIES` so it comes first in the default layout.

## 6. Checks

```bash
npm test --workspace=api        # including the price book and spec tests
npm run build --workspace=web
```
