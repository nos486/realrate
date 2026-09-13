/**
 * financialSpecs.js — Single Source of Truth for all Financial Specifications,
 * Physical Gold & Coin Weights, Forex Metadata, and Pricing Rules.
 *
 * This file centralizes all mathematical and physical standards of the Iranian market:
 * - 1 Troy Ounce = 31.1034768 grams
 * - Gold Carat Standards: 24k = 1000/1000, 22k = 916/1000, 21.6k = 900/1000, 18k = 750/1000, 17k = 705/1000
 * - Coin Specifications: Emami (8.133g, 900), Half (4.066g, 900), Quarter (2.033g, 900), Gerami (1.01g, 916)
 * - Forex Specifications: 24 Prominent Currencies + USD
 * - Canonical Asset Registry & Dynamic Name/Metadata Resolution
 */

export const TROY_OUNCE_GRAMS = 31.1034768;

// ── 1. Gold Specifications ───────────────────────────────────────────────────
export const GOLD_SPECS = {
  gold_18k: {
    id: 'gold_18k',
    name: 'طلا ۱۸ عیار',
    category: 'gold',
    badge: 'طلا',
    unit: 'گرم',
    carat: 18,
    weight: 1.0,
    gold24kWeight: 0.75, // 18 / 24
    targetBubblePct: 0,
    formulaText: '(انس طلا ÷ ۳۱.۱۰۳۵) × دلار × ۰.۷۵',
  },
  gold_22k: {
    id: 'gold_22k',
    name: 'طلای ۲۲ عیار',
    category: 'gold',
    badge: 'طلا',
    unit: 'گرم',
    carat: 22,
    weight: 1.0,
    gold24kWeight: 22 / 24,
    targetBubblePct: 0,
    formulaText: '(انس طلا ÷ ۳۱.۱۰۳۵) × دلار × (۲۲ ÷ ۲۴)',
  },
  mesghal: {
    id: 'mesghal',
    name: 'مثقال طلا (مظنه ۱۷ عیار)',
    category: 'gold',
    badge: 'طلا',
    unit: 'مثقال',
    carat: 17,
    weight: 4.608,
    gold24kWeight: 4.608 * (17 / 24), // ~3.24864
    targetBubblePct: 0,
    formulaText: '(انس طلا ÷ ۳۱.۱۰۳۵) × دلار × ۴.۶۰۸ × ۰.۷۰۵',
  },
  gold_24k: {
    id: 'gold_24k',
    name: 'طلای ۲۴ عیار',
    category: 'gold',
    badge: 'طلا',
    unit: 'گرم',
    carat: 24,
    weight: 1.0,
    gold24kWeight: 1.0,
    targetBubblePct: 0,
    formulaText: '(انس طلا ÷ ۳۱.۱۰۳۵) × دلار',
  },
  melted_gold: {
    id: 'melted_gold',
    name: 'طلای آبشده',
    category: 'gold',
    badge: 'طلا',
    unit: 'گرم',
    carat: 18,
    weight: 1.0,
    gold24kWeight: 0.75,
    targetBubblePct: 0,
    formulaText: 'هر گرم طلا با عیار ۷۵۰ آبشده',
  },
  ons_gold: {
    id: 'ons_gold',
    name: 'انس طلای جهانی (XAU)',
    category: 'gold',
    badge: 'انس',
    unit: 'دلار',
    weight: TROY_OUNCE_GRAMS,
    carat: 24,
    gold24kWeight: TROY_OUNCE_GRAMS,
    targetBubblePct: 0,
    formulaText: 'نرخ لحظه‌ای هر تروا انس طلا در بازارهای بین‌المللی',
  },
};

// ── 2. Coin Specifications ───────────────────────────────────────────────────
export const COIN_SPECS = {
  full_coin: {
    id: 'full_coin',
    name: 'سکه تمام بهار آزادی (امامی)',
    category: 'coin',
    badge: 'سکه',
    unit: 'عدد',
    carat: 21.6,
    weight: 8.133,
    gold24kWeight: 7.3197, // 8.133 * (21.6 / 24)
    targetBubblePct: 15,
    formulaText: 'وزن ۸.۱۳۳ گرم، عیار ۹۰۰ (معادل ۷.۳۱۹۷ گرم طلای خالص ۲۴ عیار)',
  },
  full_old: {
    id: 'full_old',
    name: 'سکه بهار آزادی (طرح قدیم)',
    category: 'coin',
    badge: 'سکه',
    unit: 'عدد',
    carat: 21.6,
    weight: 8.133,
    gold24kWeight: 7.3197,
    targetBubblePct: 10,
    formulaText: 'وزن ۸.۱۳۳ گرم، عیار ۹۰۰ (سکه تمام طرح قدیم)',
  },
  half_coin: {
    id: 'half_coin',
    name: 'نیم سکه بهار آزادی',
    category: 'coin',
    badge: 'سکه',
    unit: 'عدد',
    carat: 21.6,
    weight: 4.066,
    gold24kWeight: 3.6594, // 4.066 * (21.6 / 24)
    targetBubblePct: 20,
    formulaText: 'وزن ۴.۰۶۶ گرم، عیار ۹۰۰ (معادل ۳.۶۵۹۴ گرم طلای خالص ۲۴ عیار)',
  },
  quarter_coin: {
    id: 'quarter_coin',
    name: 'ربع سکه بهار آزادی',
    category: 'coin',
    badge: 'سکه',
    unit: 'عدد',
    carat: 21.6,
    weight: 2.033,
    gold24kWeight: 1.8297, // 2.033 * (21.6 / 24)
    targetBubblePct: 25,
    formulaText: 'وزن ۲.۰۳۳ گرم، عیار ۹۰۰ (معادل ۱.۸۲۹۷ گرم طلای خالص ۲۴ عیار)',
  },
  gerami_coin: {
    id: 'gerami_coin',
    name: 'سکه گرمی بانک مرکزی',
    category: 'coin',
    badge: 'سکه',
    unit: 'عدد',
    carat: 22,
    weight: 1.01,
    gold24kWeight: 1.01 * (22 / 24), // ~0.925833
    targetBubblePct: 30,
    formulaText: 'وزن ۱.۰۱ گرم، عیار ۹۱۶ (معادل ۰.۹۲۵۸ گرم طلای خالص ۲۴ عیار)',
  },
};

// ── 3. Silver Specifications ─────────────────────────────────────────────────
export const SILVER_SPECS = {
  ons_silver: {
    id: 'ons_silver',
    name: 'انس نقره جهانی (XAG)',
    category: 'silver',
    badge: 'انس',
    unit: 'دلار',
    weight: TROY_OUNCE_GRAMS,
    formulaText: 'نرخ لحظه‌ای هر تروا انس نقره در بازارهای بین‌المللی',
  },
  silver_gram: {
    id: 'silver_gram',
    name: 'نقره خام ۹۹۹ (گرم)',
    category: 'silver',
    badge: 'نقره',
    unit: 'گرم',
    weight: 1.0,
    formulaText: '(انس نقره ÷ ۳۱.۱۰۳۵) × دلار',
  },
  silver_925: {
    id: 'silver_925',
    name: 'نقره استرلینگ ۹۲۵ (گرم)',
    category: 'silver',
    badge: 'نقره',
    unit: 'گرم',
    weight: 1.0,
    silverRatio: 0.925,
    formulaText: 'هر گرم نقره عیار ۹۲۵',
  },
};

// ── 4. Prominent World Currencies (Forex) ────────────────────────────────────
export const FOREX_SPECS = [
  { code: 'USD', name: 'دلار آمریکا', flag: '🇺🇸', symbol: '$', defaultCross: 1.0 },
  { code: 'EUR', name: 'یورو اروپا', flag: '🇪🇺', symbol: '€', defaultCross: 1.082 },
  { code: 'GBP', name: 'پوند انگلیس', flag: '🇬🇧', symbol: '£', defaultCross: 1.294 },
  { code: 'AED', name: 'درهم امارات', flag: '🇦🇪', symbol: 'د.إ', defaultCross: 0.2723 },
  { code: 'TRY', name: 'لیر ترکیه', flag: '🇹🇷', symbol: '₺', defaultCross: 0.0206 },
  { code: 'CHF', name: 'فرانک سوئیس', flag: '🇨🇭', symbol: 'CHF', defaultCross: 1.135 },
  { code: 'CAD', name: 'دلار کانادا', flag: '🇨🇦', symbol: 'CA$', defaultCross: 0.724 },
  { code: 'AUD', name: 'دلار استرالیا', flag: '🇦🇺', symbol: 'AU$', defaultCross: 0.655 },
  { code: 'CNY', name: 'یوان چین', flag: '🇨🇳', symbol: '¥', defaultCross: 0.138 },
  { code: 'JPY', name: 'ین ژاپن', flag: '🇯🇵', symbol: '¥', defaultCross: 0.0066 },
  { code: 'SAR', name: 'ریال عربستان', flag: '🇸🇦', symbol: '﷼', defaultCross: 0.266 },
  { code: 'QAR', name: 'ریال قطر', flag: '🇶🇦', symbol: '﷼', defaultCross: 0.274 },
  { code: 'KWD', name: 'دینار کویت', flag: '🇰🇼', symbol: 'د.ك', defaultCross: 3.25 },
  { code: 'OMR', name: 'ریال عمان', flag: '🇴🇲', symbol: '﷼', defaultCross: 2.60 },
  { code: 'BHD', name: 'دینار بحرین', flag: '🇧🇭', symbol: '.د.ب', defaultCross: 2.65 },
  { code: 'IQD', name: 'دینار عراق', flag: '🇮🇶', symbol: 'ع.د', defaultCross: 0.00076 },
  { code: 'RUB', name: 'روبل روسیه', flag: '🇷🇺', symbol: '₽', defaultCross: 0.0108 },
  { code: 'AFN', name: 'افغانی افغانستان', flag: '🇦🇫', symbol: '؋', defaultCross: 0.0145 },
  { code: 'AZN', name: 'منات آذربایجان', flag: '🇦🇿', symbol: '₼', defaultCross: 0.588 },
  { code: 'INR', name: 'روپیه هند', flag: '🇮🇳', symbol: '₹', defaultCross: 0.0118 },
  { code: 'SEK', name: 'کرون سوئد', flag: '🇸🇪', symbol: 'kr', defaultCross: 0.093 },
  { code: 'NOK', name: 'کرون نروژ', flag: '🇳🇴', symbol: 'kr', defaultCross: 0.091 },
  { code: 'SGD', name: 'دلار سنگاپور', flag: '🇸🇬', symbol: 'S$', defaultCross: 0.75 },
  { code: 'KRW', name: 'وون کره جنوبی', flag: '🇰🇷', symbol: '₩', defaultCross: 0.00072 },
  { code: 'BRL', name: 'رئال برزیل', flag: '🇧🇷', symbol: 'R$', defaultCross: 0.178 },
];

export const FOREX_DICT = Object.fromEntries(FOREX_SPECS.map(c => [c.code, c]));

// ── 5. Crypto Specifications ────────────────────────────────────────────────
export const CRYPTO_SPECS = {
  USDT: {
    id: 'USDT',
    code: 'USDT',
    name: 'تتر',
    symbol: 'USDT',
    unit: 'تتر',
    category: 'crypto',
    badge: 'رمزارز',
    formulaText: 'استیبل‌کوین معادل ۱ دلار آمریکا',
  },
  BTC: {
    id: 'BTC',
    code: 'BTC',
    name: 'بیت‌کوین',
    symbol: 'BTC',
    unit: 'عدد',
    category: 'crypto',
    badge: 'رمزارز',
    formulaText: 'پادشاه رمزارزها',
  },
  ETH: {
    id: 'ETH',
    code: 'ETH',
    name: 'اتریوم',
    symbol: 'ETH',
    unit: 'عدد',
    category: 'crypto',
    badge: 'رمزارز',
    formulaText: 'رمزارز شبکه اتریوم',
  },
};

// ── 6. Master Canonical Asset Registry ──────────────────────────────────────
export const CANONICAL_ASSET_REGISTRY = {};

// Register Gold
Object.values(GOLD_SPECS).forEach(item => {
  CANONICAL_ASSET_REGISTRY[item.id] = item;
  CANONICAL_ASSET_REGISTRY[item.id.toLowerCase()] = item;
});

// Register Coins
Object.values(COIN_SPECS).forEach(item => {
  CANONICAL_ASSET_REGISTRY[item.id] = item;
  CANONICAL_ASSET_REGISTRY[item.id.toLowerCase()] = item;
});

// Register Silver
Object.values(SILVER_SPECS).forEach(item => {
  CANONICAL_ASSET_REGISTRY[item.id] = item;
  CANONICAL_ASSET_REGISTRY[item.id.toLowerCase()] = item;
});

// Register Forex
FOREX_SPECS.forEach(item => {
  const spec = {
    id: item.code,
    code: item.code,
    name: item.name,
    flag: item.flag,
    symbol: item.symbol,
    unit: 'تومان',
    category: 'currency',
    badge: 'ارز',
    defaultCross: item.defaultCross,
  };
  CANONICAL_ASSET_REGISTRY[item.code] = spec;
  CANONICAL_ASSET_REGISTRY[item.code.toLowerCase()] = spec;
});

// Register Crypto
Object.values(CRYPTO_SPECS).forEach(item => {
  CANONICAL_ASSET_REGISTRY[item.id] = item;
  CANONICAL_ASSET_REGISTRY[item.id.toLowerCase()] = item;
});

// Standard Aliases for historical / alternate identifiers
const ALIAS_MAP = {
  // Gold Aliases
  gold_melted: 'melted_gold',
  gold_ounce: 'ons_gold',
  // Coin Aliases
  full_new: 'full_coin',
  half: 'half_coin',
  quarter: 'quarter_coin',
  bank_gram: 'gerami_coin',
  gram: 'gerami_coin',
  // Silver Aliases
  silver_ounce: 'ons_silver',
  silver_999: 'silver_gram',
  // Currency / Forex Aliases
  usd: 'USD',
  usd_toman: 'USD',
};

for (const [alias, canonicalId] of Object.entries(ALIAS_MAP)) {
  const target = CANONICAL_ASSET_REGISTRY[canonicalId];
  if (target) {
    CANONICAL_ASSET_REGISTRY[alias] = target;
    CANONICAL_ASSET_REGISTRY[alias.toLowerCase()] = target;
  }
}

// ── 7. Canonical Name & Metadata Resolution Helpers ─────────────────────────

/**
 * Retrieve the full canonical asset specification object
 * @param {string} assetId
 * @returns {object|null}
 */
export function getCanonicalAssetSpec(assetId) {
  if (!assetId) return null;
  const clean = String(assetId).replace(/^src_def_/, '').replace(/^derived_/, '').trim();
  return (
    CANONICAL_ASSET_REGISTRY[clean] ||
    CANONICAL_ASSET_REGISTRY[clean.toLowerCase()] ||
    CANONICAL_ASSET_REGISTRY[clean.toUpperCase()] ||
    null
  );
}

/**
 * Retrieve the canonical Persian display name of an asset by ID
 * @param {string} assetId
 * @param {string} fallbackName
 * @returns {string}
 */
export function getCanonicalAssetName(assetId, fallbackName = '') {
  const spec = getCanonicalAssetSpec(assetId);
  if (spec && spec.name) return spec.name;
  return fallbackName || assetId || '';
}

/**
 * Retrieve the canonical unit of an asset by ID
 * @param {string} assetId
 * @param {string} fallbackUnit
 * @returns {string}
 */
export function getCanonicalAssetUnit(assetId, fallbackUnit = 'واحد') {
  const spec = getCanonicalAssetSpec(assetId);
  if (spec && spec.unit) return spec.unit;
  return fallbackUnit;
}

/**
 * Retrieve the canonical category of an asset by ID
 * @param {string} assetId
 * @param {string} fallbackCategory
 * @returns {string}
 */
export function getCanonicalAssetCategory(assetId, fallbackCategory = 'custom') {
  const spec = getCanonicalAssetSpec(assetId);
  if (spec && spec.category) return spec.category;
  return fallbackCategory;
}

/**
 * Retrieve the canonical badge text of an asset by ID
 * @param {string} assetId
 * @param {string} fallbackBadge
 * @returns {string}
 */
export function getCanonicalAssetBadge(assetId, fallbackBadge = '') {
  const spec = getCanonicalAssetSpec(assetId);
  if (spec && spec.badge) return spec.badge;
  return fallbackBadge;
}

// ── 8. Standard Mathematical Calculation Helpers ─────────────────────────────

/**
 * Calculate pure 24k gold gram value in Tomans
 * @param {number} goldUsd - Spot price of 1 troy ounce of gold in USD
 * @param {number} usdToman - USD price in Tomans
 * @returns {number}
 */
export function calculateGold24kGram(goldUsd, usdToman) {
  if (!goldUsd || !usdToman || goldUsd <= 0 || usdToman <= 0) return 0;
  return (goldUsd / TROY_OUNCE_GRAMS) * usdToman;
}

/**
 * Calculate intrinsic value in Tomans for a given gold or coin spec
 * @param {object} spec - Specification object (GOLD_SPECS or COIN_SPECS)
 * @param {number} goldUsd - Gold spot price in USD
 * @param {number} usdToman - USD price in Tomans
 * @returns {number}
 */
export function calculateIntrinsicValue(spec, goldUsd, usdToman) {
  const gold24kGram = calculateGold24kGram(goldUsd, usdToman);
  if (gold24kGram <= 0 || !spec) return 0;
  const weight = spec.gold24kWeight || spec.weight || 0;
  return Math.round(gold24kGram * weight);
}

/**
 * Calculate Toman price for a Forex currency based on its USD cross-rate
 * @param {number} usdCrossRate - Currency value relative to 1 USD
 * @param {number} usdToman - USD price in Tomans
 * @returns {number}
 */
export function calculateForexTomanPrice(usdCrossRate, usdToman) {
  const cross = Number(usdCrossRate || 0);
  const usd = Number(usdToman || 0);
  if (cross <= 0 || usd <= 0) return 0;
  return Math.round(cross * usd);
}
