/**
 * sources.config.js — Every price source, defined in code (the admin can only switch one off or
 * make it primary: priceSource.repository.js)
 *
 * A source names its adapter (`sourceType`, services/market/sources/index.js), where it reads
 * (`endpoint`; secrets as ${VAR}), what its numbers are in (`quote`: toman by default, rial, usd,
 * usd_cross), how often it is fetched (`fetchIntervalSec`) and what it gives: one price under its
 * `priceType` (single), several items with ids of their own (`outputs: "multi"`) or a market's
 * whole list (`isCatalog`, merged with its previous list so a partial answer never empties it).
 * Optional: `maxJumpPct` / `confirmTicks` (the implausible-jump guard, domain/priceGuard.js),
 * `staleAfterSec`, `displayConfig` (shown on the home page by default), reference-rate fields.
 * The kinds, schedule and status the admin sees: domain/priceSources.js.
 */


export const PRICE_SOURCES_CONFIG = [
  // ── Single Output Feeds (Currencies, Gold, Coins, Ounces) ───────────
  {
    id: "src_def_usd",
    name: "دلار تهران سبزه میدان",
    brand: "سبزه میدان",
    priceType: "usd",
    sourceType: "telegram",
    endpoint: "tahran_sabza",
    category: "currency",
    unit: "دلار",
    fetchIntervalSec: 300,
    isActive: true,
    isPrimary: true,
    isReferenceRate: true,
    referenceLabel: "دلار آزاد",
    referenceShortLabel: "دلار",
    referenceSymbol: "$",
    referencePulseColor: "green",
    referenceOrder: 1,
    displayConfig: { showOnHomePage: true },
  },
  // ── Gold, coins and coin bubbles (tgju.org): one multi-output source ──
  // Each series is a tgju indicator (tgju.org/profile/<slug>), in rials, read from its daily table
  // (its newest row is today's: the close is the latest price). The item's name, category and unit
  // come from its spec; a coin's target bubble from coin.spec.js. A bubble (category `bubble`, not
  // holdable) is the difference of two prices: it moves far more than a price, so it has its own
  // jump limit; the price book adds its percent of the coin's gold value (bubble.spec.js `bubbleOf`).
  {
    id: "src_def_tgju",
    name: "طلا، سکه و حباب (tgju)",
    brand: "tgju",
    priceType: "tgju",
    quote: "rial",
    sourceType: "tgju_indicators",
    outputs: "multi",
    series: [
      { slug: "geram18", id: "gold_18k", name: "طلای ۱۸ عیار" },
      { slug: "mesghal", id: "mesghal", name: "مثقال طلا" },
      { slug: "sekee", id: "full_coin", name: "سکه امامی" },
      { slug: "nim", id: "half_coin", name: "نیم سکه" },
      { slug: "rob", id: "quarter_coin", name: "ربع سکه" },
      { slug: "gerami", id: "gerami_coin", name: "سکه گرمی" },
      { slug: "coin_blubber", id: "bubble_full_coin", name: "حباب سکه امامی", maxJumpPct: 100 },
      { slug: "nim_blubber", id: "bubble_half_coin", name: "حباب نیم سکه", maxJumpPct: 100 },
      { slug: "rob_blubber", id: "bubble_quarter_coin", name: "حباب ربع سکه", maxJumpPct: 100 },
      { slug: "gerami_blubber", id: "bubble_gerami_coin", name: "حباب سکه گرمی", maxJumpPct: 100 },
    ],
    fetchIntervalSec: 600, // every 10 minutes: ten requests a run, kept light on tgju
    isActive: true,
    isPrimary: true,
    displayConfig: { showOnHomePage: true },
  },
  {
    id: "src_def_ons_gold",
    name: "انس طلا جهانی (XAU)",
    brand: "انس جهانی",
    priceType: "ons_gold",
    // Quoted in dollars: the price book turns it into tomans with the USD price
    quote: "usd",
    sourceType: "api_url",
    endpoint: "https://api.gold-api.com/price/XAU",
    jsonPath: "price",
    category: "gold",
    unit: "اونس",
    fetchIntervalSec: 300,
    isActive: true,
    isPrimary: true,
    displayConfig: { showOnHomePage: true },
  },
  {
    id: "src_def_ons_silver",
    name: "انس نقره جهانی (XAG)",
    brand: "انس جهانی",
    priceType: "ons_silver",
    // Quoted in dollars: the price book turns it into tomans with the USD price
    quote: "usd",
    sourceType: "api_url",
    endpoint: "https://api.gold-api.com/price/XAG",
    jsonPath: "price",
    category: "silver",
    unit: "اونس",
    fetchIntervalSec: 300,
    isActive: true,
    isPrimary: true,
    displayConfig: { showOnHomePage: true },
  },
  // ── Dollar-priced world assets (quote: "usd") ──
  // Their numbers are dollars: the price book keeps them as the asset's own price (`currency:
  // "usd"`, `priceUsd`) and gives the toman price at the book's dollar.
  ...[
    { id: "src_def_ons_platinum", name: "انس پلاتین جهانی (XPT)", priceType: "ons_platinum", symbol: "XPT", category: "commodity", unit: "اونس" },
    { id: "src_def_ons_palladium", name: "انس پالادیوم جهانی (XPD)", priceType: "ons_palladium", symbol: "XPD", category: "commodity", unit: "اونس" },
    { id: "src_def_btc", name: "بیت‌کوین (BTC)", priceType: "BTC", symbol: "BTC", category: "crypto", unit: "عدد" },
    { id: "src_def_eth", name: "اتریوم (ETH)", priceType: "ETH", symbol: "ETH", category: "crypto", unit: "عدد" },
  ].map(({ symbol, ...src }) => ({
    ...src,
    brand: "بازار جهانی",
    quote: "usd",
    sourceType: "api_url",
    endpoint: `https://api.gold-api.com/price/${symbol}`,
    jsonPath: "price",
    fetchIntervalSec: 300,
    isActive: true,
    isPrimary: true,
    displayConfig: { showOnHomePage: true },
  })),
  // Crude oil: the front-month futures (Yahoo Finance's chart API, no key), dollars per barrel
  ...[
    { id: "src_def_oil_brent", name: "نفت برنت (Brent)", priceType: "oil_brent", ticker: "BZ=F" },
    { id: "src_def_oil_wti", name: "نفت WTI", priceType: "oil_wti", ticker: "CL=F" },
  ].map(({ ticker, ...src }) => ({
    ...src,
    brand: "بازار جهانی",
    quote: "usd",
    sourceType: "api_url",
    endpoint: `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`,
    category: "commodity",
    unit: "بشکه",
    fetchIntervalSec: 300,
    isActive: true,
    isPrimary: true,
    displayConfig: { showOnHomePage: true },
    customParser: (data) => {
      const price = Number(data?.chart?.result?.[0]?.meta?.regularMarketPrice);
      if (!(price > 0)) throw new Error("قیمت نفت در پاسخ وب‌سرویس یافت نشد.");
      return price;
    },
  })),
  // ── سورس تتر با فانکشن پارسر اختصاصی ──
  {
    id: "src_brs_usdt",
    name: "دلار تتر",
    brand: "تتر",
    priceType: "USDT",
    sourceType: "api_url",
    endpoint: "https://api.brsapi.ir/Market/Gold_Currency.php?key=${BRS_API_KEY}",
    category: "currency",
    unit: "تتر",
    fetchIntervalSec: 300,
    isActive: true,
    isPrimary: true,
    isReferenceRate: true,
    referenceLabel: "دلار تتر",
    referenceShortLabel: "تتر",
    referenceSymbol: "₮",
    referencePulseColor: "cyan",
    referenceOrder: 2,
    displayConfig: { showOnHomePage: true },
    customParser: (data) => {
      const tetherItem = data?.currency?.find((item) => item.symbol === "USDT_IRT");
      if (!tetherItem || !tetherItem.price) {
        throw new Error("آیتم تتر در پاسخ وب‌سرویس یافت نشد.");
      }
      return Number(tetherItem.price);
    },
  },

  // ── Multi-Output Feeds (Forex Currencies & Bourse Symbols) ─────────
  {
    id: "src_def_forex",
    name: "نرخ‌های جهانی فارکس (Open ER-API)",
    brand: "فارکس",
    priceType: "forex",
    // Each currency's value in dollars: the price book turns it into tomans with the USD price
    quote: "usd_cross",
    sourceType: "forex_api",
    outputs: "multi",
    endpoint: "https://open.er-api.com/v6/latest/USD",
    category: "currency",
    unit: "ارز",
    fetchIntervalSec: 300,
    isActive: true,
    isPrimary: true,
    displayConfig: {
      showOnHomePage: true,
      homePageOutputs: ["EUR", "AED", "TRY", "GBP", "CHF", "CAD", "AUD", "CNY", "JPY"],
    },
  },
  {
    id: "src_def_bourse",
    name: "بورس اوراق بهادار تهران (TSETMC / BRS API)",
    brand: "بورس",
    priceType: "bourse",
    market: "bourse", // Its items are ids "bourse__<symbol>"
    sourceType: "bourse_symbols",
    endpoint: "https://api.brsapi.ir/Tsetmc/AllSymbols.php?type=1&key=${BRS_API_KEY}",
    category: "bourse",
    unit: "برگ سهم",
    isCatalog: true, // A market's whole list: merged with its previous one, ids `${market}__${symbol}`
    fetchIntervalSec: 3600,
    isActive: true,
    isPrimary: true,
  },
  {
    id: "src_def_emofid",
    name: "صندوق‌های سرمایه‌گذاری مفید (Emofid)",
    brand: "مفید",
    priceType: "emofid_funds",
    market: "bourse", // Exchange-traded funds: the same "bourse__<symbol>" as on the exchange
    sourceType: "emofid_funds",
    endpoint: "https://www.emofid.com/api/funds/",
    category: "bourse_fund",
    unit: "واحد",
    isFund: true,
    isCatalog: true, // A market's whole list: merged with its previous one, ids `${market}__${symbol}`
    fetchIntervalSec: 1800,
    isActive: true,
    isPrimary: true,
  },
  {
    id: "src_def_charisma",
    name: "صندوق‌های سرمایه‌گذاری کاریزما (Charisma)",
    brand: "کاریزما",
    priceType: "charisma_funds",
    market: "bourse", // Exchange-traded funds: the same "bourse__<symbol>" as on the exchange
    sourceType: "charisma_funds",
    endpoint: "https://charisma.ir/funds",
    // The funds' exchange tickers (optional), else symbolMap: the fund's English name → its ticker
    metaEndpoint: "https://webapi.charisma.ir/api/fund",
    symbolMap: {
      noghran: "نقران", kahroba: "کهربا", ahrom: "اهرم", kara: "کارا", metal: "متال", kamand: "کمند",
      kakh: "کاخ", karis: "کاریس", mazeh: "مزه", cimana: "سیمانا", zeman: "ضمان", sanam: "صنم",
      index: "هم‌تراز", roshan: "روشن", fixedmutual: "ثابت", tazmin: "تضمین", ahromi: "اهرمی",
      "oragh-dolati": "دولتی", tehranfund: "نیکوکاری", "pension-fund": "کاریز", kaman: "کمان", mokhtalet: "مختلط",
    },
    category: "bourse_fund",
    unit: "واحد",
    isFund: true,
    isCatalog: true, // A market's whole list: merged with its previous one, ids `${market}__${symbol}`
    fetchIntervalSec: 1800,
    isActive: true,
    isPrimary: true,
  },
  {
    id: "src_def_charisma_plans",
    name: "طرح‌های سرمایه‌گذاری کاریزما (Charisma Plans)",
    brand: "کاریزما",
    priceType: "charisma_plans",
    market: "charisma_plan", // Charisma's own plans: "charisma_plan__<code>"
    sourceType: "charisma_plans",
    endpoint: "https://n8n.geekio.ir/webhook/38899601-0906-4aa4-aedb-8f7de5493894",
    category: "bourse_fund",
    unit: "واحد",
    isFund: true,
    isCatalog: true, // A market's whole list: merged with its previous one, ids `${market}__${symbol}`
    // Names and units shown for a plan known only by its id (displayEngine), e.g. a holding
    knownItems: {
      gold: { name: "طرح طلا", unit: "واحد" },
      silver: { name: "طرح نقره", unit: "واحد" },
      copper: { name: "طرح مس", unit: "واحد" },
      "stocks-index": { name: "طرح شاخص سهام", unit: "واحد" },
      "real-estate": { name: "طرح ملک", unit: "واحد" },
    },
    fetchIntervalSec: 1800,
    isActive: true,
    isPrimary: true,
  },
];

/**
 * Returns a cloned copy of all master price sources config
 * @returns {Array<object>}
 */
export function getMasterPriceSourcesConfig() {
  return PRICE_SOURCES_CONFIG.map((src) => ({
    ...src,
    displayConfig: src.displayConfig ? { ...src.displayConfig } : null,
    excludedOutputs: Array.isArray(src.excludedOutputs) ? [...src.excludedOutputs] : [],
  }));
}

/**
 * Find source config by ID
 * @param {string} id
 * @returns {object|null}
 */
export function getMasterPriceSourceById(id) {
  const item = PRICE_SOURCES_CONFIG.find((s) => s.id === id);
  return item ? { ...item } : null;
}

/**
 * The reference rates (the header's base rate: dollar, tether, …): the sources marked
 * `isReferenceRate`, in `referenceOrder`. Each one's `key` is its price book id.
 * @returns {Array<{ key: string, priceType: string, sourceId: string, label: string, shortLabel: string, symbol: string, pulseColor: string, order: number }>}
 */
export function getReferenceRatesSpecs() {
  return PRICE_SOURCES_CONFIG
    .filter((s) => s.isReferenceRate)
    .sort((a, b) => (Number(a.referenceOrder) || 99) - (Number(b.referenceOrder) || 99))
    .map((s) => {
      const key = String(s.priceType || '').trim().toLowerCase();
      return {
        key,
        priceType: s.priceType,
        sourceId: s.id,
        label: s.referenceLabel || s.name,
        shortLabel: s.referenceShortLabel || s.name,
        symbol: s.referenceSymbol || '$',
        pulseColor: s.referencePulseColor || 'green',
        order: Number(s.referenceOrder) || 99,
      };
    });
}

