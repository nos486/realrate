/**
 * charismaFunds.source.adapter.js — Charisma's investment funds (charisma.ir/funds)
 *
 * The funds page carries every fund in its Next.js data (`__NEXT_DATA__`, grouped in tabs); a
 * fund's closing price is its `sellOrClosedPriceInfo` field (else `buyOrLastPriceInfo`), in rials.
 * Its exchange ticker comes from Charisma's API (`metaEndpoint`, optional: `shortSymbol`), else
 * from the source's `symbolMap` (its English name → ticker). The adapter only reads; keeping funds
 * a fetch leaves out is the pipeline's (domain/priceSources.js mergeCatalogItems).
 */

import { USER_AGENT } from "./parsingUtils.js";
import { logger } from "../../../lib/logger.js";

const PAGE_TIMEOUT_MS = 10_000;
const META_TIMEOUT_MS = 5_000;

/** A fund's price field (rials), else 0 */
const fieldRials = (fund, key) => Number(fund.fields?.find((f) => f?.key === key)?.value) || 0;

/**
 * The funds of Charisma's page as { id, name, price } in tomans; one without a price is left out
 * @param {Array<object>} funds - the page's funds (with `shortSymbol` from the API where known)
 * @param {Record<string, string>} [symbolMap] - English name → exchange ticker
 * @returns {Array<{ id: string, name: string, price: number }>}
 */
export function charismaFundItemsOf(funds, symbolMap = {}) {
  const items = [];
  for (const fund of Array.isArray(funds) ? funds : []) {
    if (!fund || typeof fund !== "object") continue;
    const id = String(fund.shortSymbol || symbolMap[fund.englishTitle] || symbolMap[fund.enSymbol] || fund.englishTitle || "").trim();
    const rial = fieldRials(fund, "sellOrClosedPriceInfo") || fieldRials(fund, "buyOrLastPriceInfo");
    const price = Math.round(rial / 10);
    if (!id || !(price > 0)) continue;
    items.push({ id, name: String(fund.subtitle || fund.title || id).trim() || id, price });
  }
  return items;
}

/** Every fund of the page's Next.js data, once (a fund can be in several tabs) */
function fundsOfPage(html) {
  const match = String(html).match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error("داده‌ی صندوق‌ها (__NEXT_DATA__) در صفحه‌ی کاریزما پیدا نشد.");
  const tabs = JSON.parse(match[1])?.props?.pageProps?.funds;
  const byId = new Map();
  for (const tab of Array.isArray(tabs) ? tabs : []) {
    for (const fund of Array.isArray(tab?.data) ? tab.data : []) {
      if (fund?.id && !byId.has(fund.id)) byId.set(fund.id, { ...fund });
    }
  }
  return byId;
}

/** @type {import("./ISourceAdapter.js").SourceAdapter} */
export const charismaFundsSourceAdapter = {
  id: "charisma_funds",
  name: "صندوق‌های کاریزما",

  /** @returns {Promise<Array<object>>} the page's funds, with their API ticker where known */
  async fetchRaw(src) {
    const res = await fetch(src.endpoint, {
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml", "Accept-Language": "fa,en;q=0.8" },
    });
    if (!res.ok) throw new Error(`پاسخ صفحه‌ی صندوق‌های کاریزما: ${res.status}`);
    const funds = fundsOfPage(await res.text());

    // The exchange tickers (optional: without them the symbolMap names the funds)
    if (src.metaEndpoint) {
      try {
        const meta = await fetch(src.metaEndpoint, { signal: AbortSignal.timeout(META_TIMEOUT_MS), headers: { "User-Agent": USER_AGENT } });
        const list = meta.ok ? await meta.json() : [];
        for (const m of Array.isArray(list) ? list : []) {
          const fund = funds.get(m?.id);
          if (fund && (m.shortSymbol || m.symbol)) fund.shortSymbol = m.shortSymbol || m.symbol;
        }
      } catch (err) {
        logger.warn("[Charisma] fund tickers not read — the symbol map names the funds", { error: err?.message });
      }
    }
    return [...funds.values()];
  },

  parse(raw, src) {
    const items = charismaFundItemsOf(Array.isArray(raw) ? raw : [], src?.symbolMap);
    if (items.length === 0) throw new Error("صندوق قیمت‌داری در صفحه‌ی کاریزما نبود.");
    return { items, datetime: new Date().toISOString() };
  },
};
