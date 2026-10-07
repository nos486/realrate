/**
 * forexApi.source.adapter.js — Adapter for International Forex Cross Rates
 * Connects to open.er-api.com to fetch global exchange rates against USD and computes cross-rates.
 */

import { USER_AGENT } from "./parsingUtils.js";
import {
  FOREX_SPECS as PROMINENT_FOREX_CURRENCIES,
} from "../../../domain/specs/index.js";

export { PROMINENT_FOREX_CURRENCIES };

/**
 * Forex Source Adapter Implementation
 * @type {import("./ISourceAdapter.js").SourceAdapter}
 */
export const forexApiSourceAdapter = {
  id: "forex_api",
  name: "نرخ‌های جهانی فارکس (Open ER-API)",


  async fetchRaw(sourceConfig) {
    const res = await fetch(sourceConfig.endpoint, {
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
};
