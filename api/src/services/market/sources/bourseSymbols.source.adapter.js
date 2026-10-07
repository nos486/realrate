/**
 * bourseSymbols.source.adapter.js — The Tehran Stock Exchange's symbols (TSETMC, through BRS API)
 *
 * One request gives every symbol: `l18` its ticker, `l30` its name, `pl` its last price in rials.
 * The adapter only reads that answer; keeping symbols a fetch leaves out is the pipeline's
 * (a catalog's list is merged with its previous one, domain/priceSources.js mergeCatalogItems).
 */

import { USER_AGENT } from "./parsingUtils.js";
import { resolveApiUrl } from "./apiUrl.source.adapter.js";

/** A rial amount however the feed writes it ("1,234" or 1234), else 0 */
const rials = (v) => Number(String(v ?? "").replace(/,/g, "").trim()) || 0;

/**
 * The symbols of a BRS API answer as { id, name, price } in tomans; one without a price is left out
 * @param {Array<object>} rows
 * @returns {Array<{ id: string, name: string, price: number }>}
 */
export function bourseItemsOf(rows) {
  const items = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== "object") continue;
    const id = String(row.l18 ?? row.symbol ?? "").trim();
    const price = Math.round(rials(row.pl ?? row.priceRial) / 10);
    if (!id || !(price > 0)) continue;
    items.push({ id, name: String(row.l30 ?? row.name ?? id).trim() || id, price });
  }
  return items;
}

/** @type {import("./ISourceAdapter.js").SourceAdapter} */
export const bourseSymbolsSourceAdapter = {
  id: "bourse_symbols",
  name: "بورس تهران (BRS API)",

  async fetchRaw(src, env = null) {
    const res = await fetch(resolveApiUrl(src, env), {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`پاسخ وب‌سرویس بورس: ${res.status}`);
    return res.json();
  },

  parse(raw) {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    const rows = Array.isArray(data) ? data : (data?.symbols || data?.data || []);
    const items = bourseItemsOf(rows);
    if (items.length === 0) throw new Error("نماد قیمت‌داری در پاسخ بورس نبود.");
    return { items, datetime: new Date().toISOString() };
  },
};
