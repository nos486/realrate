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
  // ── Static & Cash Feeds ──────────────────────────────────────────────
  {
    id: "src_def_toman",
    name: "تومان نقد",
    brand: "نقد",
    priceType: "toman",
    sourceType: "static",
    staticPrice: 1,
    lastPrice: 1,
    category: "cash",
    unit: "تومان",
    isActive: true,
    isPrimary: true,
    displayConfig: { showOnHomePage: false },
  },
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
    fetchIntervalSec: 60,
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
  {
    id: "src_def_gold_18k",
    name: "طلا ۱۸ عیار (زرما)",
    brand: "زرما",
    priceType: "gold_18k",
    sourceType: "telegram",
    endpoint: "zarmagoldd",
    category: "gold",
    unit: "گرم",
    fetchIntervalSec: 60,
    isActive: true,
    isPrimary: true,
    displayConfig: { showOnHomePage: true },
  },
  {
    id: "src_def_full_coin",
    name: "سکه تمام بهار آزادی (زرما)",
    brand: "زرما",
    priceType: "full_coin",
    sourceType: "telegram",
    endpoint: "zarmagoldd",
    category: "coin",
    unit: "عدد",
    bubblePct: 15,
    fetchIntervalSec: 60,
    isActive: true,
    isPrimary: true,
    displayConfig: { showOnHomePage: true },
  },
  {
    id: "src_def_half_coin",
    name: "نیم سکه بهار آزادی (زرما)",
    brand: "زرما",
    priceType: "half_coin",
    sourceType: "telegram",
    endpoint: "zarmagoldd",
    category: "coin",
    unit: "عدد",
    bubblePct: 20,
    fetchIntervalSec: 60,
    isActive: true,
    isPrimary: true,
    displayConfig: { showOnHomePage: true },
  },
  {
    id: "src_def_quarter_coin",
    name: "ربع سکه بهار آزادی (زرما)",
    brand: "زرما",
    priceType: "quarter_coin",
    sourceType: "telegram",
    endpoint: "zarmagoldd",
    category: "coin",
    unit: "عدد",
    bubblePct: 25,
    fetchIntervalSec: 60,
    isActive: true,
    isPrimary: true,
    displayConfig: { showOnHomePage: true },
  },
  {
    id: "src_def_mesghal",
    name: "مثقال طلا ۱۷ عیار (زرما)",
    brand: "زرما",
    priceType: "mesghal",
    sourceType: "telegram",
    endpoint: "zarmagoldd",
    category: "gold",
    unit: "مثقال",
    fetchIntervalSec: 60,
    isActive: true,
    isPrimary: true,
    displayConfig: { showOnHomePage: true },
  },
  {
    id: "src_def_ons_gold",
    name: "انس طلا جهانی (XAU)",
    brand: "انس جهانی",
    priceType: "ons_gold",
    sourceType: "api_url",
    endpoint: "https://api.gold-api.com/price/XAU",
    jsonPath: "price",
    category: "gold",
    unit: "اونس",
    fetchIntervalSec: 60,
    isActive: true,
    isPrimary: true,
    displayConfig: { showOnHomePage: true },
  },
  {
    id: "src_def_ons_silver",
    name: "انس نقره جهانی (XAG)",
    brand: "انس جهانی",
    priceType: "ons_silver",
    sourceType: "api_url",
    endpoint: "https://api.gold-api.com/price/XAG",
    jsonPath: "price",
    category: "silver",
    unit: "اونس",
    fetchIntervalSec: 60,
    isActive: true,
    isPrimary: true,
    displayConfig: { showOnHomePage: true },
  },
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
    fetchIntervalSec: 5,
    isActive: true,
    isPrimary: true,
    isReferenceRate: true,
    referenceLabel: "دلار تتر",
    referenceShortLabel: "تتر",
    referenceSymbol: "₮",
    referencePulseColor: "cyan",
    referenceOrder: 2,
    displayConfig: { showOnHomePage: true },
    customParser: (data, sourceConfig) => {
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
    sourceType: "forex_api",
    endpoint: "https://open.er-api.com/v6/latest/USD",
    jsonPath: "rates",
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
    sourceType: "bourse_symbols",
    endpoint: "https://api.brsapi.ir/Tsetmc/AllSymbols.php?type=1&key=${BRS_API_KEY}",
    category: "bourse",
    unit: "برگ سهم",
    isCatalog: true, // UI display/grouping only; not for pipeline selection (scheduled for removal in Phase 4)
    fetchIntervalSec: 3600,
    isActive: true,
    isPrimary: true,
    customParser: (data, sourceConfig) => {
      const rawList = Array.isArray(data) ? data : (data?.symbols || data?.data || []);
      const { mergedList } = mergeBourseSymbols([], rawList, new Date().toISOString(), sourceConfig);
      return {
        items: mergedList,
        datetime: new Date().toISOString(),
      };
    },
  },
  {
    id: "src_def_emofid",
    name: "صندوق‌های سرمایه‌گذاری مفید (Emofid)",
    brand: "مفید",
    priceType: "emofid_funds",
    sourceType: "emofid_funds",
    endpoint: "https://www.emofid.com/api/funds/",
    jsonPath: "value",
    category: "bourse_fund",
    unit: "واحد",
    isFund: true,
    isCatalog: true, // UI display/grouping only; not for pipeline selection (scheduled for removal in Phase 4)
    knownSymbols: ["عیار", "پیشتاز", "پیشرو", "امید", "پیشواز", "آتیه", "حامی", "نامی"],
    fetchIntervalSec: 1800,
    isActive: true,
    isPrimary: true,
    customParser: (data, sourceConfig) => {
      const rawList = Array.isArray(data) ? data : (data?.value || data?.data || []);
      const { mergedList } = mergeEmofidFunds([], rawList, new Date().toISOString(), sourceConfig);
      return {
        items: mergedList,
        datetime: new Date().toISOString(),
      };
    },
  },
  {
    id: "src_def_charisma",
    name: "صندوق‌های سرمایه‌گذاری کاریزما (Charisma)",
    brand: "کاریزما",
    priceType: "charisma_funds",
    sourceType: "charisma_funds",
    endpoint: "https://charisma.ir/funds",
    jsonPath: "data",
    category: "bourse_fund",
    unit: "واحد",
    isFund: true,
    isCatalog: true, // UI display/grouping only; not for pipeline selection (scheduled for removal in Phase 4)
    knownSymbols: [
      "اهرم", "کهربا", "نقران", "کارا", "متال", "کمند", "کاخ", "کاریس", "مزه", "سیمانا",
      "ضمان", "صنم", "هم‌تراز", "روشن", "ثابت", "تضمین", "دولتی", "نیکوکاری", "کاریز", "کمان", "مختلط"
    ],
    fetchIntervalSec: 1800,
    isActive: true,
    isPrimary: true,
    customParser: (data, sourceConfig) => {
      const rawList = Array.isArray(data) ? data : (data?.funds || data?.data || []);
      const { mergedList } = mergeCharismaFunds([], rawList, new Date().toISOString(), sourceConfig);
      return {
        items: mergedList,
        datetime: new Date().toISOString(),
      };
    },
  },
  {
    id: "src_def_charisma_plans",
    name: "طرح‌های سرمایه‌گذاری کاریزما (Charisma Plans)",
    brand: "کاریزما",
    priceType: "charisma_plans",
    sourceType: "charisma_plans",
    endpoint: "https://n8n.geekio.ir/webhook/38899601-0906-4aa4-aedb-8f7de5493894",
    category: "bourse_fund",
    unit: "واحد",
    isFund: true,
    isCatalog: true, // UI display/grouping only; not for pipeline selection (scheduled for removal in Phase 4)
    knownSymbols: [
      "gold", "silver", "copper", "stocks-index", "real-estate",
      "طلا", "نقره", "مس", "استاکس", "ملک"
    ],
    knownItems: {
      gold: { name: 'طرح طلا', unit: 'واحد' },
      silver: { name: 'طرح نقره', unit: 'واحد' },
      copper: { name: 'طرح مس', unit: 'واحد' },
      'stocks-index': { name: 'طرح شاخص سهام', unit: 'واحد' },
      'real-estate': { name: 'طرح ملک', unit: 'واحد' },
    },
    fetchIntervalSec: 1800,
    isActive: true,
    isPrimary: true,
    customParser: (data, sourceConfig) => {
      const rawList = Array.isArray(data) ? data : (data?.plans || data?.items || data?.data || []);
      const { mergedList } = mergeCharismaPlans([], rawList, new Date().toISOString(), sourceConfig);
      return {
        items: mergedList,
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
    regex: "",
    jsonPath: "",
    fieldMapping: null,
    excludedOutputs: [],
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

export {
  getSourceDisplayName,
  getSourceCategoryConfig,
  getSourceItemDisplayName,
} from "../domain/displayEngine.js";

