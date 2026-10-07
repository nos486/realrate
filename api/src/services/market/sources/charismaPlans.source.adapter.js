/**
 * charismaPlans.source.adapter.js — Charisma's investment plans (gold, silver, copper, the stock
 * index, real estate), from the source's endpoint (a webhook relaying Charisma's plan prices)
 *
 * Each plan's code (`id`), title (`planTitle`) and unit price in tomans (`priceToman`, or
 * `priceRial` ÷ 10). The adapter only reads; keeping plans a fetch leaves out is the pipeline's
 * (domain/priceSources.js mergeCatalogItems).
 */

import { USER_AGENT } from "./parsingUtils.js";

const FETCH_TIMEOUT_MS = 10_000;

/** A plan's price in tomans, else 0 */
const tomansOf = (row) => Math.round(Number(row.priceToman) || Number(row.price) || (Number(row.priceRial) || 0) / 10);

/**
 * The plans of an answer as { id, name, price } in tomans; one without a price is left out
 * @param {Array<object>} rows
 * @returns {Array<{ id: string, name: string, price: number }>}
 */
export function charismaPlanItemsOf(rows) {
  const items = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== "object") continue;
    const id = String(row.id ?? row.key ?? "").trim();
    const price = tomansOf(row);
    if (!id || !(price > 0)) continue;
    items.push({ id, name: String(row.planTitle ?? row.name ?? row.title ?? id).trim() || id, price });
  }
  return items;
}

/** @type {import("./ISourceAdapter.js").SourceAdapter} */
export const charismaPlansSourceAdapter = {
  id: "charisma_plans",
  name: "طرح‌های کاریزما",

  async fetchRaw(src) {
    const res = await fetch(src.endpoint, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT, Accept: "application/json, text/plain, */*" },
    });
    if (!res.ok) throw new Error(`پاسخ وب‌سرویس طرح‌های کاریزما: ${res.status}`);
    return res.json();
  },

  parse(raw) {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    const rows = Array.isArray(data) ? data : (data?.data || data?.plans || data?.items || []);
    const items = charismaPlanItemsOf(rows);
    if (items.length === 0) throw new Error("طرح قیمت‌داری در پاسخ کاریزما نبود.");
    return { items, datetime: new Date().toISOString() };
  },
};
