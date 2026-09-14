/**
 * sources.config.js — Master Code-First Price Sources Specification
 *
 * All price sources in RealRate are defined declaratively in code.
 * Version-controlled via Git; runtime prices are cached in Cloudflare KV / memory.
 */

export const PRICE_SOURCES_CONFIG = [
  // ── Single Output Feeds (Currencies, Gold, Coins, Ounces) ───────────
  {
    id: "src_def_usd",
    name: "دلار تهران سبزه میدان",
    priceType: "usd",
    sourceType: "telegram",
    endpoint: "tahran_sabza",
    regex: "",
    jsonPath: "",
    fieldMapping: null,
    excludedOutputs: [],
    displayConfig: { showOnHomePage: true },
    fetchIntervalSec: 60,
    isActive: true,
    isPrimary: true,
    isReferenceRate: true,
    referenceLabel: "دلار آزاد",
    referenceShortLabel: "دلار",
    referenceSymbol: "$",
    referenceOrder: 1,
  },
  {
    id: "src_def_gold_18k",
    name: "طلا ۱۸ عیار (زرما)",
    priceType: "gold_18k",
    sourceType: "telegram",
    endpoint: "zarmagoldd",
    regex: "",
    jsonPath: "",
    fieldMapping: null,
    excludedOutputs: [],
    displayConfig: { showOnHomePage: true },
    fetchIntervalSec: 60,
    isActive: true,
    isPrimary: true,
  },
  {
    id: "src_def_full_coin",
    name: "سکه تمام بهار آزادی (زرما)",
    priceType: "full_coin",
    sourceType: "telegram",
    endpoint: "zarmagoldd",
    regex: "",
    jsonPath: "",
    fieldMapping: null,
    excludedOutputs: [],
    displayConfig: { showOnHomePage: true },
    fetchIntervalSec: 60,
    isActive: true,
    isPrimary: true,
  },
  {
    id: "src_def_half_coin",
    name: "نیم سکه بهار آزادی (زرما)",
    priceType: "half_coin",
    sourceType: "telegram",
    endpoint: "zarmagoldd",
    regex: "",
    jsonPath: "",
    fieldMapping: null,
    excludedOutputs: [],
    displayConfig: { showOnHomePage: true },
    fetchIntervalSec: 60,
    isActive: true,
    isPrimary: true,
  },
  {
    id: "src_def_quarter_coin",
    name: "ربع سکه بهار آزادی (زرما)",
    priceType: "quarter_coin",
    sourceType: "telegram",
    endpoint: "zarmagoldd",
    regex: "",
    jsonPath: "",
    fieldMapping: null,
    excludedOutputs: [],
    displayConfig: { showOnHomePage: true },
    fetchIntervalSec: 60,
    isActive: true,
    isPrimary: true,
  },
  {
    id: "src_def_mesghal",
    name: "مثقال طلا ۱۷ عیار (زرما)",
    priceType: "mesghal",
    sourceType: "telegram",
    endpoint: "zarmagoldd",
    regex: "",
    jsonPath: "",
    fieldMapping: null,
    excludedOutputs: [],
    displayConfig: { showOnHomePage: true },
    fetchIntervalSec: 60,
    isActive: true,
    isPrimary: true,
  },
  {
    id: "src_def_ons_gold",
    name: "انس طلا جهانی (XAU)",
    priceType: "ons_gold",
    sourceType: "api_url",
    endpoint: "https://api.gold-api.com/price/XAU",
    regex: "",
    jsonPath: "price",
    fieldMapping: null,
    excludedOutputs: [],
    displayConfig: { showOnHomePage: true },
    fetchIntervalSec: 60,
    isActive: true,
    isPrimary: true,
  },
  {
    id: "src_def_ons_silver",
    name: "انس نقره جهانی (XAG)",
    priceType: "ons_silver",
    sourceType: "api_url",
    endpoint: "https://api.gold-api.com/price/XAG",
    regex: "",
    jsonPath: "price",
    fieldMapping: null,
    excludedOutputs: [],
    displayConfig: { showOnHomePage: true },
    fetchIntervalSec: 60,
    isActive: true,
    isPrimary: true,
  },
  // ── سورس تتر با فانکشن پارسر اختصاصی ──
  {
    id: "src_brs_usdt",
    name: "دلار تتر",
    priceType: "USDT",
    sourceType: "api_url",
    endpoint: "https://api.brsapi.ir/Market/Gold_Currency.php?key=${BRS_API_KEY}",
    regex: "",
    jsonPath: "",
    fieldMapping: null,
    excludedOutputs: [],
    displayConfig: { showOnHomePage: true },
    fetchIntervalSec: 60,
    isActive: true,
    isPrimary: true,
    isReferenceRate: true,
    referenceLabel: "دلار تتر",
    referenceShortLabel: "تتر",
    referenceSymbol: "₮",
    referenceOrder: 2,

    /**
     * فانکشن پارسر اختصاصی:
     * @param {object} data - کل شیء JSON دریافت شده از وب‌سرویس
     * @param {object} sourceConfig - کانفیگ همین سورس
     * @returns {number|object} - عدد قیمت نهایی، یا آبجکت استاندارد { price, datetime, label }
     */
    customParser: (data, sourceConfig) => {
      // ۱. جستجو در آرایه ارزها بر اساس کلید دلخواه
      const tetherItem = data?.currency?.find((item) => item.symbol === "USDT_IRT");

      if (!tetherItem || !tetherItem.price) {
        throw new Error("آیتم تتر در پاسخ وب‌سرویس یافت نشد.");
      }

      // ۲. برگرداندن مستقیم عدد قیمت (تومان)
      return Number(tetherItem.price);
    },
  },

  // ── Multi-Output Feeds (Forex Currencies & Bourse Symbols) ─────────
  {
    id: "src_def_forex",
    name: "نرخ‌های جهانی فارکس (Open ER-API)",
    priceType: "forex",
    sourceType: "forex_api",
    endpoint: "https://open.er-api.com/v6/latest/USD",
    regex: "",
    jsonPath: "rates",
    fieldMapping: null,
    excludedOutputs: [],
    displayConfig: {
      showOnHomePage: true,
      homePageOutputs: [
        "EUR",
        "AED",
        "TRY",
        "GBP",
        "CHF",
        "CAD",
        "AUD",
        "CNY",
        "JPY",
      ],
    },
    fetchIntervalSec: 300,
    isActive: true,
    isPrimary: true,
  },
  {
    id: "src_def_bourse",
    name: "بورس اوراق بهادار تهران (TSETMC / BRS API)",
    priceType: "bourse",
    sourceType: "bourse_symbols",
    endpoint: "https://api.brsapi.ir/Tsetmc/AllSymbols.php?type=1&key=${BRS_API_KEY}",
    regex: "",
    jsonPath: "",
    fieldMapping: null,
    excludedOutputs: [],
    displayConfig: { showOnHomePage: true },
    fetchIntervalSec: 86400,
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
    customParser: src.customParser || null,
    displayConfig: src.displayConfig ? { ...src.displayConfig } : null,
    excludedOutputs: Array.isArray(src.excludedOutputs) ? [...src.excludedOutputs] : [],
    fieldMapping: src.fieldMapping ? { ...src.fieldMapping } : null,
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
