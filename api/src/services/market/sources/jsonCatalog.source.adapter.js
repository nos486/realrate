/**
 * jsonCatalog.source.adapter.js — Any JSON feed listing many priced items (e.g. car models by year)
 *
 * The feed is an array of rows (or an object holding one under the source's `rowsPath`). Which
 * fields make a row's id, name and price is the source's config (`catalogFields`), never this
 * adapter's: `id` / `name` are lists of field paths joined into one (`name` by a space, `id` by
 * "_"), `price` is one field path. Any path may list alternatives as "a|b" (the first one the
 * row has is read), so a feed whose field names are not pinned down still parses. The price is in the source's `quote`; the pipeline converts it.
 * A row without an id or a positive price is left out. Endpoints may name secrets as ${VAR}.
 */

import { USER_AGENT, extractValueByPath, normalizeDigits } from "./parsingUtils.js";
import { interpolateEnvVariables, resolveApiUrl } from "./apiUrl.source.adapter.js";

const FETCH_TIMEOUT_MS = 10_000;

/** A number however the feed writes it (digits in any script, separators), else 0 */
const numberOf = (v) => Number(normalizeDigits(String(v ?? "")).replace(/[,\s]/g, "")) || 0;

/** The value at the first of a path's "a|b" alternatives that the object has, else null */
export function valueAtAny(obj, path) {
  for (const p of String(path || "").split("|")) {
    const v = extractValueByPath(obj, p.trim(), true);
    if (v !== null && v !== undefined && String(v).trim() !== "") return v;
  }
  return null;
}

/** The text of a row's fields, joined: empty fields are skipped */
const joinFields = (row, paths, glue) =>
  (Array.isArray(paths) ? paths : [paths])
    .map((p) => String(valueAtAny(row, p) ?? "").trim())
    .filter(Boolean)
    .join(glue);

/**
 * The priced rows of a feed as { id, name, price }, by the source's `catalogFields`
 * @param {Array<object>} rows
 * @param {{ id: string[]|string, name: string[]|string, price: string }} fields
 * @returns {Array<{ id: string, name: string, price: number }>}
 */
export function catalogItemsOf(rows, fields) {
  const items = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== "object") continue;
    const id = joinFields(row, fields.id, "_");
    const price = numberOf(valueAtAny(row, fields.price));
    if (!id || !(price > 0)) continue;
    items.push({ id, name: joinFields(row, fields.name, " ") || id, price });
  }
  return items;
}

/** @type {import("./ISourceAdapter.js").SourceAdapter} */
export const jsonCatalogSourceAdapter = {
  id: "json_catalog",
  name: "فید JSON چندقلمی",

  async fetchRaw(src, env = null) {
    // A secret the endpoint names (e.g. a token) that is not set: say which, rather than calling
    for (const [, name] of String(src.endpoint || "").matchAll(/\$\{([A-Za-z0-9_]+)\}/g)) {
      if (!interpolateEnvVariables(`\${${name}}`, env)) throw new Error(`متغیر ${name} روی سرور تنظیم نشده است.`);
    }
    const url = resolveApiUrl(src, env);
    if (!/^https?:\/\//i.test(url)) throw new Error("آدرس فید سورس تنظیم نشده یا معتبر نیست.");
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT, Accept: "application/json, text/plain, */*" },
    });
    if (!res.ok) throw new Error(`پاسخ فید ${src.brand || src.name}: ${res.status}`);
    return res.json();
  },

  parse(raw, src) {
    const fields = src.catalogFields;
    if (!fields?.id || !fields?.price) throw new Error("فیلدهای فید (catalogFields) در تنظیمات سورس نیست.");
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    const rows = Array.isArray(data) ? data : valueAtAny(data, src.rowsPath || "items");
    const items = catalogItemsOf(rows, fields);
    if (items.length === 0) throw new Error("قلم قیمت‌داری در پاسخ فید نبود.");
    return { items, datetime: new Date().toISOString() };
  },
};
