/**
 * emofidFunds.source.adapter.js — Emofid's investment funds (emofid.com/api/funds)
 *
 * Each fund's issue price (`subscriptionNav`, in rials) under its ticker (`enTitle`). The adapter
 * only reads that answer; keeping funds a fetch leaves out is the pipeline's (a catalog's list is
 * merged with its previous one, domain/priceSources.js mergeCatalogItems).
 */

import { USER_AGENT } from "./parsingUtils.js";

const FETCH_TIMEOUT_MS = 10_000;

/** A rial amount however the feed writes it, else 0 */
const rials = (v) => Number(String(v ?? "").replace(/,/g, "").trim()) || 0;

/**
 * The funds of an Emofid answer as { id, name, price } in tomans; one without a price is left out
 * @param {Array<object>} rows
 * @returns {Array<{ id: string, name: string, price: number }>}
 */
export function emofidItemsOf(rows) {
  const items = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== "object") continue;
    const id = String(row.enTitle ?? row.symbol ?? "").trim();
    const price = Math.round(rials(row.subscriptionNav) / 10);
    if (!id || !(price > 0)) continue;
    items.push({ id, name: String(row.fullTitle ?? row.title ?? id).trim() || id, price });
  }
  return items;
}

/** @type {import("./ISourceAdapter.js").SourceAdapter} */
export const emofidFundsSourceAdapter = {
  id: "emofid_funds",
  name: "صندوق‌های مفید",

  async fetchRaw(src) {
    const res = await fetch(src.endpoint, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT, Accept: "application/json, text/plain, */*" },
    });
    if (!res.ok) throw new Error(`پاسخ وب‌سرویس مفید: ${res.status}`);
    return res.json();
  },

  parse(raw) {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    const rows = Array.isArray(data) ? data : (data?.value || data?.data || data?.items || []);
    const items = emofidItemsOf(rows);
    if (items.length === 0) throw new Error("صندوق قیمت‌داری در پاسخ مفید نبود.");
    return { items, datetime: new Date().toISOString() };
  },
};
