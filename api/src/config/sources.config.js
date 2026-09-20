/**
 * sources.config.js — Master Code-First Price Sources Specification
 *
 * All price sources in RealRate are defined declaratively in code.
 * Version-controlled via Git; runtime prices are cached in Cloudflare KV / memory.
 */

import { mergeBourseSymbols } from "../services/market/sources/bourseSymbols.source.adapter.js";
import { mergeEmofidFunds } from "../services/market/sources/emofidFunds.source.adapter.js";
import { mergeCharismaFunds } from "../services/market/sources/charismaFunds.source.adapter.js";
import { mergeCharismaPlans } from "../services/market/sources/charismaPlans.source.adapter.js";

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
    referencePulseColor: "green",
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
    fetchIntervalSec: 5,
    isActive: true,
    isPrimary: true,
    isReferenceRate: true,
    referenceLabel: "دلار تتر",
    referenceShortLabel: "تتر",
    referenceSymbol: "₮",
    referencePulseColor: "cyan",
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
    category: "bourse",
    badge: "سهام بورس",
    unit: "برگ سهم",
    isFund: false,
    isCatalog: true,
    endpoint: "https://api.brsapi.ir/Tsetmc/AllSymbols.php?type=1&key=${BRS_API_KEY}",
    regex: "",
    jsonPath: "",
    fieldMapping: null,
    excludedOutputs: [],
    displayConfig: { showOnHomePage: false },
    fetchIntervalSec: 3600,
    isActive: true,
    isPrimary: true,
    customParser: (data, sourceConfig) => {
      const rawList = Array.isArray(data) ? data : (data?.symbols || data?.data || []);
      const { mergedList } = mergeBourseSymbols([], rawList, new Date().toISOString(), sourceConfig);
      return {
        isCatalog: true,
        totalCount: mergedList.length,
        items: mergedList,
        compactList: mergedList,
        sampleItems: mergedList.slice(0, 50),
        datetime: new Date().toISOString(),
      };
    },
  },
  {
    id: "src_def_emofid",
    name: "صندوق‌های سرمایه‌گذاری مفید (Emofid)",
    priceType: "emofid_funds",
    sourceType: "emofid_funds",
    category: "bourse_fund",
    badge: "صندوق",
    unit: "واحد",
    isFund: true,
    isCatalog: true,
    endpoint: "https://www.emofid.com/api/funds/",
    regex: "",
    jsonPath: "value",
    fieldMapping: null,
    excludedOutputs: [],
    displayConfig: { showOnHomePage: false },
    knownSymbols: [
      "عیار", "پیشتاز", "پیشرو", "امید", "پیشواز", "آتیه", "حامی", "نامی"
    ],
    fetchIntervalSec: 1800,
    isActive: true,
    isPrimary: true,
    customParser: (data, sourceConfig) => {
      const rawList = Array.isArray(data) ? data : (data?.value || data?.data || []);
      const { mergedList } = mergeEmofidFunds([], rawList, new Date().toISOString(), sourceConfig);
      return {
        isCatalog: true,
        totalCount: mergedList.length,
        items: mergedList,
        compactList: mergedList,
        sampleItems: mergedList.slice(0, 50),
        datetime: new Date().toISOString(),
      };
    },
  },
  {
    id: "src_def_charisma",
    name: "صندوق‌های سرمایه‌گذاری کاریزما (Charisma)",
    priceType: "charisma_funds",
    sourceType: "charisma_funds",
    category: "bourse_fund",
    badge: "صندوق",
    unit: "واحد",
    isFund: true,
    isCatalog: true,
    endpoint: "https://charisma.ir/funds",
    regex: "",
    jsonPath: "data",
    fieldMapping: null,
    excludedOutputs: [],
    displayConfig: { showOnHomePage: false },
    knownSymbols: [
      "اهرم", "کهربا", "نقران", "کارا", "متال", "کمند", "کاخ", "کاریس", "مزه", "سیمانا", "ضمان", "صنم", "هم‌تراز", "روشن", "ثابت", "تضمین", "دولتی", "نیکوکاری", "کاریز", "کمان", "مختلط"
    ],
    fetchIntervalSec: 1800,
    isActive: true,
    isPrimary: true,
    customParser: (data, sourceConfig) => {
      const rawList = Array.isArray(data) ? data : (data?.funds || data?.data || []);
      const { mergedList } = mergeCharismaFunds([], rawList, new Date().toISOString(), sourceConfig);
      return {
        isCatalog: true,
        totalCount: mergedList.length,
        items: mergedList,
        compactList: mergedList,
        sampleItems: mergedList.slice(0, 50),
        datetime: new Date().toISOString(),
      };
    },
  },
  {
    id: "src_def_charisma_plans",
    name: "طرح‌های سرمایه‌گذاری کاریزما (Charisma Plans)",
    priceType: "charisma_plans",
    sourceType: "charisma_plans",
    category: "bourse_fund",
    badge: "طرح",
    unit: "واحد",
    isFund: true,
    isCatalog: true,
    endpoint: "https://n8n.geekio.ir/webhook/38899601-0906-4aa4-aedb-8f7de5493894",
    regex: "",
    jsonPath: "",
    fieldMapping: null,
    excludedOutputs: [],
    displayConfig: { showOnHomePage: false },
    knownSymbols: [
      "GOLD", "SILVER", "COPPER", "STOCKS_INDEX", "REAL_ESTATE",
      "طلا", "نقره", "مس", "استاکس", "ملک"
    ],
    knownItemNames: {
      gold: "طرح سرمایه‌گذاری طلا کاریزما",
      silver: "طرح سرمایه‌گذاری نقره کاریزما",
      copper: "طرح سرمایه‌گذاری مس کاریزما",
      "stocks-index": "طرح سرمایه‌گذاری شاخص سهام کاریزما",
      stocks_index: "طرح سرمایه‌گذاری شاخص سهام کاریزما",
      "real-estate": "طرح سرمایه‌گذاری مسکن کاریزما",
      real_estate: "طرح سرمایه‌گذاری مسکن کاریزما",
    },
    fetchIntervalSec: 1800,
    isActive: true,
    isPrimary: true,
    customParser: (data, sourceConfig) => {
      const rawList = Array.isArray(data) ? data : (data?.plans || data?.items || data?.data || []);
      const { mergedList } = mergeCharismaPlans([], rawList, new Date().toISOString(), sourceConfig);
      return {
        isCatalog: true,
        totalCount: mergedList.length,
        items: mergedList,
        compactList: mergedList,
        sampleItems: mergedList.slice(0, 50),
        datetime: new Date().toISOString(),
      };
    },
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

/**
 * Extract all reference rate specifications configured across all sources.
 * Single source of truth for reference rates (USD, USDT, and any future reference rates).
 * Reads directly from PRICE_SOURCES_CONFIG without any hardcoded labels or symbols elsewhere.
 * @returns {Array<{ key: string, priceType: string, sourceId: string, label: string, shortLabel: string, symbol: string, pulseColor: string, order: number }>}
 */
export function getReferenceRatesSpecs() {
  return PRICE_SOURCES_CONFIG
    .filter((s) => s.isReferenceRate || s.priceType === 'usd' || String(s.priceType).toLowerCase() === 'usdt')
    .sort((a, b) => (Number(a.referenceOrder) || 99) - (Number(b.referenceOrder) || 99))
    .map((s) => {
      const rawKey = String(s.priceType || '').toLowerCase();
      const key = rawKey === 'usd_toman' ? 'usd' : rawKey;
      return {
        key,
        priceType: s.priceType,
        sourceId: s.id,
        label: s.referenceLabel || s.name,
        shortLabel: s.referenceShortLabel || s.name,
        symbol: s.referenceSymbol || (key === 'usdt' ? '₮' : '$'),
        pulseColor: s.referencePulseColor || (key === 'usdt' ? 'cyan' : 'green'),
        order: Number(s.referenceOrder) || 99,
      };
    });
}

const GENERIC_SOURCE_STOPWORDS = new Set([
  'صندوق', 'صندوق‌های', 'صندوقهای', 'سرمایه', 'سرمایه‌گذاری', 'سرمایهگذاری',
  'نرخ', 'نرخ‌های', 'نرخهای', 'جهانی', 'بازار', 'اوراق', 'بهادار', 'قیمت',
  'api', 'feed', 'source', 'سورس', 'فید'
]);

function extractSourceBrandTokens(nameOrId) {
  if (!nameOrId || typeof nameOrId !== 'string') return [];
  return nameOrId
    .toLowerCase()
    .replace(/[()\/\\_—–-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !GENERIC_SOURCE_STOPWORDS.has(t));
}

/**
 * Resolves source display name dynamically from PRICE_SOURCES_CONFIG or customSources.
 * Zero hardcoded names — derives distinctive brand tokens directly from source definitions.
 *
 * @param {string|object} sourceOrItem - Source ID, priceType, source object, or item object
 * @param {Array<object>} [customSources=[]] - Optional active sources list
 * @returns {string} - Master source name (e.g. "صندوق‌های سرمایه‌گذاری کاریزما (Charisma)")
 */
export function getSourceDisplayName(sourceOrItem, customSources = []) {
  if (!sourceOrItem) return "";

  const allSources = Array.isArray(customSources) && customSources.length > 0
    ? [...customSources, ...PRICE_SOURCES_CONFIG]
    : PRICE_SOURCES_CONFIG;

  // 1. If passed an object (item, asset, or source)
  if (typeof sourceOrItem === "object") {
    // If it already has a specific sourceName (other than the generic bourse fallback), use it
    if (sourceOrItem.sourceName && !sourceOrItem.sourceName.includes('بورس اوراق بهادار') && !sourceOrItem.sourceName.includes('TSETMC')) {
      return sourceOrItem.sourceName;
    }

    // Direct match by sourceId or priceType if explicitly provided
    const explicitKey = String(sourceOrItem.sourceId || sourceOrItem.source || sourceOrItem.priceType || sourceOrItem.id || '').trim().toLowerCase();
    if (explicitKey && explicitKey !== 'bourse' && explicitKey !== 'bourse_feed' && explicitKey !== 'src_def_bourse') {
      const direct = allSources.find(
        (s) => s && (s.id?.toLowerCase() === explicitKey || s.priceType?.toLowerCase() === explicitKey)
      );
      if (direct?.name) return direct.name;
    }

    // Dynamic brand matching from source definitions (e.g. fund matching)
    const itemName = String(sourceOrItem.name || sourceOrItem.n || sourceOrItem.title || '').trim().toLowerCase();
    const itemSym = String(sourceOrItem.symbol || sourceOrItem.s || '').trim().toLowerCase();

    if (itemName || itemSym) {
      // Prioritize specific catalog sources (excluding generic bourse)
      const catalogSources = allSources.filter(
        (s) => s && s.id !== 'src_def_bourse' && s.priceType !== 'bourse' && (s.isCatalog || s.category === 'catalog' || s.priceType?.includes('fund'))
      );

      for (const src of catalogSources) {
        // 1. Check knownSymbols declared directly on the source
        if (Array.isArray(src.knownSymbols) && itemSym) {
          if (src.knownSymbols.some((s) => String(s).trim().toLowerCase() === itemSym)) {
            return src.name;
          }
        }

        // 2. Check distinctive brand tokens from source name
        const tokens = extractSourceBrandTokens(src.name);
        if (tokens.some((tok) => (itemName && itemName.includes(tok)) || itemSym === tok)) {
          return src.name;
        }
      }
    }

    // Fallback for general bourse assets
    if (sourceOrItem.priceType === 'bourse' || sourceOrItem.type === 'bourse' || sourceOrItem.category?.startsWith('bourse')) {
      const bourseSrc = allSources.find((s) => s.id === 'src_def_bourse' || s.priceType === 'bourse');
      if (bourseSrc?.name) return bourseSrc.name;
    }

    if (sourceOrItem.name && sourceOrItem.endpoint) return sourceOrItem.name;
  }

  // 2. If passed a string key (sourceId or priceType)
  const key = String(sourceOrItem).trim().toLowerCase();
  const direct = allSources.find(
    (s) => s && (s.id?.toLowerCase() === key || s.priceType?.toLowerCase() === key)
  );
  if (direct?.name) return direct.name;

  // 3. String matching against source brand tokens
  const catalogSources = allSources.filter(
    (s) => s && s.id !== 'src_def_bourse' && s.priceType !== 'bourse'
  );
  for (const src of catalogSources) {
    const tokens = extractSourceBrandTokens(src.name);
    if (tokens.some((tok) => key.includes(tok))) {
      return src.name;
    }
  }

  return "";
}

/**
 * Resolves source configuration by source ID, priceType, or prefixed assetId (e.g. "charisma_plans__gold", "emofid__ayyar", "bourse_فولاد").
 * Enables fully data-driven category and metadata resolution across the system without any hardcoded checks in registry or catalog feeds.
 *
 * @param {string} sourceIdOrAssetId
 * @returns {object|null}
 */
export function getSourceCategoryConfig(sourceIdOrAssetId) {
  if (!sourceIdOrAssetId || typeof sourceIdOrAssetId !== 'string') return null;
  const clean = sourceIdOrAssetId.replace(/^src_def_/, '').replace(/^derived_/, '').toLowerCase().trim();

  // 1. Direct match by source ID or priceType
  const direct = PRICE_SOURCES_CONFIG.find((s) => {
    if (!s) return false;
    const sCleanId = String(s.id || '').replace(/^src_def_/, '').toLowerCase().trim();
    const sPType = String(s.priceType || '').toLowerCase().trim();
    return sCleanId === clean || sPType === clean;
  });
  if (direct) return direct;

  // 2. Prefixed match (e.g. "charisma_plans__gold" or "emofid__ayyar" or "charisma_funds__...")
  // Exact double-underscore prefix match takes precedence over single underscore
  for (const s of PRICE_SOURCES_CONFIG) {
    if (!s) continue;
    const sCleanId = String(s.id || '').replace(/^src_def_/, '').toLowerCase().trim();
    const sPType = String(s.priceType || '').toLowerCase().trim();
    if (clean.startsWith(`${sCleanId}__`) || (sPType && clean.startsWith(`${sPType}__`))) {
      return s;
    }
  }

  // Fallback to single underscore match only when no double underscore exists
  if (!clean.includes('__')) {
    for (const s of PRICE_SOURCES_CONFIG) {
      if (!s) continue;
      const sCleanId = String(s.id || '').replace(/^src_def_/, '').toLowerCase().trim();
      const sPType = String(s.priceType || '').toLowerCase().trim();
      if (clean.startsWith(`${sCleanId}_`) || (sPType && clean.startsWith(`${sPType}_`))) {
        return s;
      }
    }
  }

  return null;
}

/**
 * Resolves a human-friendly Persian display name for a catalog or partitioned asset ID (e.g. "charisma_plans__gold" -> "طرح سرمایه‌گذاری طلا کاریزما").
 * Reads metadata dynamically from sources.config.js without any hardcoded mappings.
 *
 * @param {string} sourceIdOrAssetId
 * @returns {string|null}
 */
export function getSourceItemDisplayName(sourceIdOrAssetId) {
  if (!sourceIdOrAssetId || typeof sourceIdOrAssetId !== 'string') return null;
  const srcConfig = getSourceCategoryConfig(sourceIdOrAssetId);
  if (!srcConfig) return null;

  const clean = sourceIdOrAssetId.replace(/^src_def_/, '').replace(/^derived_/, '');
  const parts = clean.split('__');
  const subKey = parts.length > 1 ? parts.slice(1).join('__').trim() : clean.trim();
  const subKeyLower = subKey.toLowerCase();

  // 1. Direct match in knownItemNames
  if (srcConfig.knownItemNames) {
    if (srcConfig.knownItemNames[subKey]) return srcConfig.knownItemNames[subKey];
    if (srcConfig.knownItemNames[subKeyLower]) return srcConfig.knownItemNames[subKeyLower];
    const subKeyUnder = subKeyLower.replace(/-/g, '_');
    if (srcConfig.knownItemNames[subKeyUnder]) return srcConfig.knownItemNames[subKeyUnder];
    const subKeyHyphen = subKeyLower.replace(/_/g, '-');
    if (srcConfig.knownItemNames[subKeyHyphen]) return srcConfig.knownItemNames[subKeyHyphen];
  }

  // 2. If subKey is already Persian
  if (/[آ-ی]/.test(subKey)) {
    if (srcConfig.isFund && !subKey.includes('صندوق') && !subKey.includes('طرح')) {
      return `صندوق ${subKey}`;
    }
    return subKey;
  }

  return null;
}
