/**
 * apiUrl.source.adapter.js — Any JSON (or plain-text) endpoint giving one price
 *
 * The price is read with the source's `customParser(data, src)` (a number, or `{ items }` for a
 * list), else its `jsonPath` (with an optional `regex` over the value or the raw text). Units and
 * rounding are the price book's (the source's `quote`); a dollar quote keeps its cents here.
 * Endpoints may name secrets as ${VAR} (resolveApiUrl): they are filled from the Worker's env.
 */

import {
  USER_AGENT,
  extractPriceWithRegex,
  extractValueByPath,
} from "./parsingUtils.js";
import { roundUsd } from "../../../domain/priceBook.js";

/**
 * Generic environment variable interpolator.
 * Replaces any ${VAR_NAME}, {{VAR_NAME}}, or {VAR_NAME} in a string
 * with the corresponding variable from Worker env or process.env.
 *
 * @param {string} str
 * @param {object} [env]
 * @returns {string}
 */
export function interpolateEnvVariables(str, env = null) {
  if (!str || typeof str !== "string") return str || "";

  const lookup = (key) => {
    if (env && env[key] !== undefined && env[key] !== null) return String(env[key]);
    if (typeof process !== "undefined" && process.env && process.env[key] !== undefined && process.env[key] !== null) {
      return String(process.env[key]);
    }
    return "";
  };

  // Support ${VAR}, {{VAR}}, and {VAR}
  return str.replace(/\$\{([A-Za-z0-9_]+)\}|\{\{([A-Za-z0-9_]+)\}\}|\{([A-Za-z0-9_]+)\}/g, (match, p1, p2, p3) => {
    const varName = p1 || p2 || p3;
    return lookup(varName);
  });
}

/**
 * Universally resolves an API URL for any source configuration:
 * 1. Interpolates any environment variables: ${VAR_NAME}, {{VAR_NAME}}, or {VAR_NAME}
 * 2. Injects optional `apiKeyEnv` / `apiKeyParam` declared on sourceConfig
 * 3. Graceful fallback for legacy URLs
 *
 * @param {string|object} urlOrConfig - URL string or full sourceConfig object
 * @param {object} [env] - Environment variables object
 * @returns {string}
 */
export function resolveApiUrl(urlOrConfig, env = null) {
  const config = typeof urlOrConfig === "string" ? { endpoint: urlOrConfig } : (urlOrConfig || {});
  let url = (config.endpoint || config.apiUrl || "").trim();
  if (!url) return "";

  // 1. Generic template interpolation for ANY environment variable
  url = interpolateEnvVariables(url, env);

  // 2. Explicit apiKeyEnv parameter configured on sourceConfig (e.g. apiKeyEnv: 'NOBITEX_KEY')
  if (config.apiKeyEnv) {
    const envVal = (env && env[config.apiKeyEnv]) || (typeof process !== "undefined" && process.env?.[config.apiKeyEnv]) || "";
    const paramName = config.apiKeyParam || "key";
    if (envVal && !url.includes(`${paramName}=`)) {
      const sep = url.includes("?") ? "&" : "?";
      url = `${url}${sep}${paramName}=${envVal}`;
    }
  }

  return url;
}

/** One item under the source's own id and name */
const ownItem = (src, price) => ({ id: src.id || src.priceType, name: src.name || src.id, price });

/** @type {import("./ISourceAdapter.js").SourceAdapter} */
export const apiUrlSourceAdapter = {
  id: "api_url",
  name: "وب‌سرویس JSON",

  async fetchRaw(src, env = null) {
    const url = resolveApiUrl(src, env);
    if (!/^https?:\/\//i.test(url)) throw new Error("آدرس وب‌سرویس سورس معتبر نیست.");
    const headers = { "User-Agent": USER_AGENT, Accept: "application/json, text/plain, */*" };
    for (const [k, v] of Object.entries(src.headers || {})) headers[k] = interpolateEnvVariables(String(v), env);
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`پاسخ وب‌سرویس: ${res.status} ${res.statusText}`.trim());
    return res.text();
  },

  parse(raw, src) {
    const text = typeof raw === "string" ? raw.trim() : JSON.stringify(raw ?? null);
    let data = null;
    try {
      data = typeof raw === "string" ? JSON.parse(text) : raw;
    } catch {
      // Not JSON: only a regex can read it
      const value = extractPriceWithRegex(text, src.regex || "([\\d,]+)");
      if (!(value > 0)) throw new Error("پاسخ وب‌سرویس JSON نیست و عددی در آن پیدا نشد.");
      return { items: [ownItem(src, value)], datetime: new Date().toISOString() };
    }

    if (typeof src.customParser === "function") {
      let out;
      try {
        out = src.customParser(data, src);
      } catch (err) {
        throw new Error(`پارسر سورس: ${err.message}`);
      }
      if (Array.isArray(out?.items)) return { items: out.items, datetime: out.datetime || new Date().toISOString() };
      if (!(Number(out) > 0)) throw new Error("پارسر سورس قیمتی برنگرداند.");
      return { items: [ownItem(src, this.priceOf(out, src))], datetime: new Date().toISOString() };
    }

    let value = extractValueByPath(data, src.jsonPath || "");
    if (src.regex) value = extractPriceWithRegex(String(value ?? text), src.regex) || value;
    if (!(Number(value) > 0)) {
      throw new Error(src.jsonPath ? `مقداری در مسیر «${src.jsonPath}» پاسخ پیدا نشد.` : "قیمتی در پاسخ وب‌سرویس پیدا نشد.");
    }
    return { items: [ownItem(src, this.priceOf(value, src))], datetime: new Date().toISOString() };
  },

  /** The price as the feed gives it; a dollar quote keeps its cents (the book rounds the rest) */
  priceOf(value, src) {
    return src.quote === "usd" ? roundUsd(value) : Number(value);
  },
};
