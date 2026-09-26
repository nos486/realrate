/**
 * forexApi.source.adapter.js — Adapter for International Forex Cross Rates
 * Connects to open.er-api.com to fetch global exchange rates against USD and computes cross-rates.
 */

import { USER_AGENT } from "./parsingUtils.js";
import {
  FOREX_SPECS as PROMINENT_FOREX_CURRENCIES,
} from "../../../domain/specs/index.js";
import { getSourceItems } from "../../../repositories/sourceItems.repository.js";

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
    const sType = (sourceConfig.sourceType || sourceConfig.source_type || "").toLowerCase();
    if (sType === "forex_api") return true;
    if (sType === "api_url") return false;
    const pType = (sourceConfig.priceType || sourceConfig.price_type || "").toLowerCase();
    return pType === "forex";
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

  async parse(raw) {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    const rates = (data && data.rates && typeof data.rates === "object") ? data.rates : data;

    if (!rates || typeof rates !== "object") {
      throw new Error("بخش نرخ‌های ارز (rates) در پاسخ وب‌سرویس یافت نشد.");
    }

    const nowIso = new Date().toISOString();
    const items = [];

    for (const cur of PROMINENT_FOREX_CURRENCIES) {
      // The feed is priced in USD, so its own USD is always 1 — not a rate. The dollar's price
      // comes from its own source (usd_toman); a "usd" of 1 here would shadow it.
      if (cur.code === "USD") continue;
      const rawRate = Number(rates[cur.code]);
      if (!rawRate || isNaN(rawRate) || rawRate <= 0) continue;

      // Relative to USD: 1 / rate
      const usdCross = parseFloat((1 / rawRate).toFixed(5));

      items.push({
        id: cur.code,
        name: `${cur.name} (${cur.code})`,
        price: usdCross,
      });
    }

    if (items.length === 0) {
      throw new Error("هیچ یک از ارزهای مطرح در پاسخ وب‌سرویس یافت نشد.");
    }

    return {
      items,
      datetime: nowIso,
    };
  },

  async getItems(env = null) {
    // What the last sync stored
    const stored = env ? await getSourceItems(env, "src_def_forex") : [];
    if (stored.length > 0) return stored;
    const raw = await this.fetchRaw({ endpoint: FOREX_API_DEFAULT_URL }, env);
    const parsed = await this.parse(raw, { name: this.name }, env);
    return parsed.items || [];
  },

  async test(sourceConfig) {
    try {
      const raw = await this.fetchRaw(sourceConfig);
      const parsed = await this.parse(raw, sourceConfig);
      const count = parsed.items.length;
      return {
        success: true,
        source_type: "api_url",
        price: count,
        items: parsed.items,
        sampleItems: parsed.items.slice(0, 30),
        datetime: parsed.datetime,
        label: sourceConfig.name || "نرخ‌های جهانی فارکس (Open ER-API)",
        message: `تعداد ${count} نرخ جهانی فارکس با موفقیت دریافت و پردازش شد.`,
      };
    } catch (e) {
      return { success: false, error: e.message || "خطا در تست وب‌سرویس فارکس" };
    }
  },
};
