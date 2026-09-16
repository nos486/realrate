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
    sourceType: "api_url",
    isCatalog: true,
    endpoint: "https://api.brsapi.ir/Tsetmc/AllSymbols.php?type=1&key=${BRS_API_KEY}",
    regex: "",
    jsonPath: "",
    fieldMapping: null,
    excludedOutputs: [],
    displayConfig: { showOnHomePage: false },
    fetchIntervalSec: 86400,
    isActive: true,
    isPrimary: true,

    /**
     * فانکشن پارسر اختصاصی بورس اوراق بهادار تهران:
     * دریافت مستقیم داده‌های TSETMC / BRS API و استانداردسازی به کاتالوگ نمادها
     * @param {Array|object} data - داده خام دریافتی از وب‌سرویس
     * @param {object} sourceConfig - کانفیگ سورس
     * @returns {object} - ساختار استاندارد کاتالوگ با اقلام تبدیل‌شده (ریال به تومان)
     */
    customParser: (data, sourceConfig) => {
      const rawList = Array.isArray(data) ? data : (data?.symbols || data?.data || []);
      if (!Array.isArray(rawList) || rawList.length === 0) {
        throw new Error("آرایه نمادهای بورس در پاسخ وب‌سرویس یافت نشد.");
      }

      const items = rawList.map((item) => {
        const symbol = String(item.l18 || item.symbol || item.s || "").trim();
        const name = String(item.l30 || item.name || item.n || symbol).trim();
        const rial = Number(item.pl !== undefined && item.pl !== null ? item.pl : (item.pc || item.priceRial || 0));
        const toman = rial > 0 ? Math.round(rial / 10) : (Number(item.price || item.p || 0));
        const isFund = Boolean(
          item.isFund ||
          name.includes("صندوق") ||
          name.includes("ص.س.") ||
          name.includes("ص. س.") ||
          name.includes("ETF") ||
          symbol.includes("دارا") ||
          symbol.includes("پالایش")
        );

        return {
          s: symbol,
          symbol,
          n: name,
          name,
          p: toman,
          price: toman,
          priceToman: toman,
          priceRial: rial || (toman * 10),
          isFund,
          category: isFund ? "صندوق سرمایه‌گذاری" : "سهام بورس",
        };
      }).filter((it) => it.symbol);

      return {
        isCatalog: true,
        totalCount: items.length,
        items,
        compactList: items,
        sampleItems: items.slice(0, 50),
        datetime: new Date().toISOString(),
      };
    },
  },
  {
    id: "src_def_emofid",
    name: "صندوق‌های سرمایه‌گذاری مفید (Emofid)",
    priceType: "emofid_funds",
    sourceType: "emofid_funds",
    isCatalog: true,
    manager: "مفید (Emofid)",
    endpoint: "https://www.emofid.com/api/funds/",
    regex: "",
    jsonPath: "value",
    fieldMapping: null,
    excludedOutputs: [],
    displayConfig: { showOnHomePage: false },
    fetchIntervalSec: 1800,
    isActive: true,
    isPrimary: true,

    /**
     * فانکشن پارسر اختصاصی صندوق‌های سرمایه‌گذاری مفید:
     * استخراج تنها دو فیلد نام و قیمت صدور (subscriptionNav)
     */
    customParser: (data, sourceConfig) => {
      const rawList = Array.isArray(data)
        ? data
        : (Array.isArray(data?.value)
          ? data.value
          : (Array.isArray(data?.data) ? data.data : []));

      if (!Array.isArray(rawList) || rawList.length === 0) {
        throw new Error("آرایه صندوق‌های سرمایه‌گذاری مفید در پاسخ وب‌سرویس یافت نشد.");
      }

      const items = rawList
        .filter((item) => item && typeof item === "object")
        .map((item) => {
          const symbol = String(item.enTitle || item.key || item.code || item.id || "").trim();
          const name = String(item.fullTitle || item.title || item.name || symbol).trim();
          const rawNav = item.subscriptionNav !== undefined && item.subscriptionNav !== null
            ? Number(String(item.subscriptionNav).replace(/,/g, "").trim())
            : 0;
          const rial = Math.round(rawNav);
          const toman = Math.round(rial / 10);

          return {
            s: symbol,
            symbol,
            n: name,
            name,
            p: toman,
            price: toman,
            priceToman: toman,
            priceRial: rial,
            unit: "IRR",
            isFund: true,
            category: "صندوق سرمایه‌گذاری",
            type: item.type || "صندوق",
            manager: "مفید (Emofid)",
          };
        })
        .filter((it) => it.symbol);

      return {
        isCatalog: true,
        totalCount: items.length,
        items,
        compactList: items,
        sampleItems: items.slice(0, 50),
        datetime: new Date().toISOString(),
      };
    },
  },
  {
    id: "src_def_charisma",
    name: "صندوق‌های سرمایه‌گذاری کاریزما (Charisma)",
    priceType: "charisma_funds",
    sourceType: "charisma_funds",
    isCatalog: true,
    manager: "کاریزما (Charisma)",
    endpoint: "https://charisma.ir/funds",
    regex: "",
    jsonPath: "data",
    fieldMapping: null,
    excludedOutputs: [],
    displayConfig: { showOnHomePage: false },
    fetchIntervalSec: 1800,
    isActive: true,
    isPrimary: true,

    /**
     * فانکشن پارسر اختصاصی صندوق‌های سرمایه‌گذاری کاریزما:
     * استخراج نماد، نام و قیمت پایانی (sellOrClosedPriceInfo)
     */
    customParser: (data, sourceConfig) => {
      const rawList = Array.isArray(data)
        ? data
        : (Array.isArray(data?.funds)
          ? data.funds
          : (Array.isArray(data?.data) ? data.data : []));

      if (!Array.isArray(rawList) || rawList.length === 0) {
        throw new Error("آرایه صندوق‌های سرمایه‌گذاری کاریزما در پاسخ یافت نشد.");
      }

      const items = rawList
        .filter((item) => item && typeof item === "object")
        .map((item) => {
          const rawSymbol = item.shortSymbol || item.symbol || item.englishTitle || item.enSymbol || item.title || item.id;
          const symbol = String(rawSymbol).trim();
          const name = String(item.subtitle || item.title || item.name || symbol).trim();

          let rawClosingPrice = 0;
          if (Array.isArray(item.fields)) {
            const closedField = item.fields.find((f) => f.key === "sellOrClosedPriceInfo");
            if (closedField && closedField.value !== undefined && closedField.value !== null) {
              rawClosingPrice = Number(closedField.value);
            }
            if (!rawClosingPrice) {
              const lastField = item.fields.find((f) => f.key === "buyOrLastPriceInfo");
              if (lastField && lastField.value !== undefined && lastField.value !== null) {
                rawClosingPrice = Number(lastField.value);
              }
            }
          } else if (item.priceRial || item.closedPriceRials) {
            rawClosingPrice = Number(item.priceRial || item.closedPriceRials);
          }

          const rial = Math.round(rawClosingPrice);
          const toman = Math.round(rial / 10);

          return {
            s: symbol,
            symbol,
            n: name,
            name,
            p: toman,
            price: toman,
            priceToman: toman,
            priceRial: rial,
            unit: "IRR",
            isFund: true,
            category: "صندوق سرمایه‌گذاری",
            type: "صندوق",
            manager: "کاریزما (Charisma)",
          };
        })
        .filter((it) => it.symbol);

      return {
        isCatalog: true,
        totalCount: items.length,
        items,
        compactList: items,
        sampleItems: items.slice(0, 50),
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
