/**
 * forexApi.source.adapter.js — Adapter for International Forex Cross Rates
 * Connects to open.er-api.com to fetch global exchange rates against USD and computes cross-rates.
 */

import { USER_AGENT } from "./parsingUtils.js";
import {
  FOREX_SPECS as PROMINENT_FOREX_CURRENCIES,
  normalizeForexToUsdCrossRate,
} from "../../../lib/financialSpecs.js";
import { dbBatchUpdateForexPrices } from "../../../repositories/priceSource.repository.js";
import {
  getLastForexD1RecordTime,
  setLastForexD1RecordTime,
  setForexRatesCache,
} from "../../../repositories/kvCache.repository.js";
import { FOREX_HISTORY_EXPIRATION_TTL } from "../../../config/constants.js";
import { logger } from "../../../lib/logger.js";

export { PROMINENT_FOREX_CURRENCIES };

export const FOREX_API_DEFAULT_URL = "https://open.er-api.com/v6/latest/USD";

export const FOREX_FALLBACK = {
  EUR: 0.915,
  AED: 3.6725,
  TRY: 33.50,
  CNY: 7.18,
  GBP: 0.782,
  CAD: 1.370,
  AUD: 1.520,
  CHF: 0.865,
  JPY: 147.50,
  SAR: 3.75,
  QAR: 3.64,
  KWD: 0.306,
  RUB: 88.50,
  IQD: 1310.0,
  AFN: 70.50,
};

/**
 * Forex Source Adapter Implementation
 * @type {import("./ISourceAdapter.js").SourceAdapter}
 */
export const forexApiSourceAdapter = {
  id: "forex_api",
  name: "نرخ‌های جهانی فارکس (Open ER-API)",

  supports(sourceConfig) {
    const pType = (sourceConfig.priceType || sourceConfig.price_type || "").toLowerCase();
    const endpoint = String(sourceConfig.endpoint || sourceConfig.apiUrl || "").toLowerCase();
    return pType === "forex" || endpoint.includes("open.er-api.com");
  },

  async fetchRaw(sourceConfig) {
    const url = (sourceConfig.endpoint || sourceConfig.apiUrl || FOREX_API_DEFAULT_URL).trim();
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "application/json, text/plain, */*",
      },
    });

    if (!res.ok) {
      throw new Error(`خطای دریافت نرخ‌های فارکس از وب‌سرویس (کد ${res.status})`);
    }

    return await res.json();
  },

  async parse(raw, sourceConfig, env = null) {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    const rates = (data && data.rates && typeof data.rates === "object") ? data.rates : data;

    if (!rates || typeof rates !== "object") {
      throw new Error("بخش نرخ‌های ارز (rates) در پاسخ وب‌سرویس یافت نشد.");
    }

    const nowIso = new Date().toISOString();
    const multiData = {};
    const compactList = [];
    const currencyList = [];

    for (const cur of PROMINENT_FOREX_CURRENCIES) {
      const rawRate = Number(rates[cur.code]);
      if (!rawRate || isNaN(rawRate) || rawRate <= 0) continue;

      // Relative to USD: 1 / rate
      const usdCross = parseFloat((1 / rawRate).toFixed(5));
      multiData[cur.code.toLowerCase()] = usdCross;

      compactList.push({
        s: cur.code,
        n: `${cur.name} (${cur.code})`,
        p: usdCross,
      });

      currencyList.push({
        key: cur.code.toLowerCase(),
        code: cur.code,
        label: cur.name,
        rawRate,
        usdCrossRate: usdCross,
        price: usdCross,
      });
    }

    if (compactList.length === 0) {
      throw new Error("هیچ یک از ارزهای مطرح در پاسخ وب‌سرویس یافت نشد.");
    }

    // Cache entire forex rates payload in KV
    if (env) {
      await setForexRatesCache(env, { rates: { ...FOREX_FALLBACK, ...rates }, last_updated: nowIso }).catch(() => {});

      // Record to D1 price_sources table (throttled to at most once per 15 minutes)
      this.syncToPriceSourcesD1(env, rates).catch(() => {});
    }

    return {
      price: compactList.length,
      multiData,
      currencyList,
      compactList,
      sampleItems: compactList.slice(0, 30),
      datetime: nowIso,
      label: sourceConfig.name || "نرخ‌های جهانی فارکس (Open ER-API)",
    };
  },

  async syncToPriceSourcesD1(env, fetchedRates) {
    if (!env?.DB || !fetchedRates) return;
    try {
      const nowMs = Date.now();
      let lastRecordMs = 0;
      const val = await getLastForexD1RecordTime(env);
      if (val) lastRecordMs = parseInt(val, 10) || 0;

      if (nowMs - lastRecordMs < 900000) return; // 15-minute throttle

      const nowIso = new Date(nowMs).toISOString();
      const currenciesToRecord = ['EUR', 'TRY', 'AED', 'GBP', 'CHF', 'CAD', 'AUD', 'CNY'];
      const updates = [];

      for (const code of currenciesToRecord) {
        const raw = fetchedRates[code];
        if (raw && Number(raw) > 0) {
          const priceType = code.toLowerCase();
          const crossRate = normalizeForexToUsdCrossRate(priceType, raw);
          if (!crossRate || crossRate <= 0) continue;
          updates.push({ priceType, crossRate });
        }
      }

      if (updates.length > 0) {
        await dbBatchUpdateForexPrices(env, updates, nowIso);
      }

      await setLastForexD1RecordTime(env, nowMs, FOREX_HISTORY_EXPIRATION_TTL);
    } catch (err) {
      logger.warn("[ForexAdapter] Error recording history in D1:", { error: err.message });
    }
  },

  async test(sourceConfig) {
    try {
      const raw = await this.fetchRaw(sourceConfig);
      const parsed = await this.parse(raw, sourceConfig);
      return {
        success: true,
        source_type: "api_url",
        price: parsed.price,
        multiData: parsed.multiData,
        sampleItems: parsed.sampleItems,
        datetime: parsed.datetime,
        label: parsed.label,
        message: `تعداد ${parsed.price} نرخ جهانی فارکس با موفقیت دریافت و پردازش شد.`,
      };
    } catch (e) {
      return { success: false, error: e.message || "خطا در تست وب‌سرویس فارکس" };
    }
  },
};
