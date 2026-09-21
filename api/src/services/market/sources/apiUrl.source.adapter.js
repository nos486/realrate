/**
 * apiUrl.source.adapter.js — Adapter for Generic JSON API Endpoints
 * Supports single-value extraction via jsonPath/regex, unit multipliers, and custom multi-output arrays.
 */

import {
  USER_AGENT,
  extractPriceWithRegex,
  extractValueByPath,
} from "./parsingUtils.js";
import { normalizeForexToUsdCrossRate } from "../../../domain/formulas.js";

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
  let url = (config.endpoint || config.apiUrl || config.usd_api_url || "").trim();
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

/**
 * Generic API URL Source Adapter Implementation
 * @type {import("./ISourceAdapter.js").SourceAdapter}
 */
export const apiUrlSourceAdapter = {
  id: "api_url",
  name: "وب‌سرویس عمومی JSON",

  supports(sourceConfig) {
    const type = (sourceConfig.sourceType || sourceConfig.source_type || "").toLowerCase();
    return type === "api_url" || Boolean(sourceConfig.apiUrl || sourceConfig.endpoint || sourceConfig.usd_api_url);
  },

  async fetchRaw(sourceConfig, env = null) {
    const url = resolveApiUrl(sourceConfig, env);
    if (!url) {
      throw new Error("آدرس وب‌سرویس وارد نشده است.");
    }
    if (!/^https?:\/\//i.test(url)) {
      throw new Error("آدرس وب‌سرویس باید با http:// یا https:// آغاز شود.");
    }

    const headers = {
      "User-Agent": USER_AGENT,
      "Accept": "application/json, text/plain, */*",
    };
    if (sourceConfig.headers && typeof sourceConfig.headers === "object") {
      for (const [k, v] of Object.entries(sourceConfig.headers)) {
        headers[k] = interpolateEnvVariables(String(v), env);
      }
    }

    const res = await fetch(url, { headers });

    if (!res.ok) {
      throw new Error(`خطای ارتباط با وب‌سرویس API (کد ${res.status} ${res.statusText})`);
    }

    return await res.text();
  },

  parse(rawContent, sourceConfig) {
    const nowIso = new Date().toISOString();
    let data;

    if (rawContent && typeof rawContent === "object") {
      data = rawContent;
    } else {
      const rawStr = String(rawContent || "").trim();
      try {
        data = JSON.parse(rawStr);
      } catch {
        const directNum = extractPriceWithRegex(rawStr, sourceConfig.regex || "([\\d,]+)");
        if (directNum && directNum > 0) {
          return {
            items: [{
              id: sourceConfig.id || sourceConfig.priceType || "api_source",
              name: sourceConfig.name || "API URL",
              price: Math.round(directNum),
            }],
            datetime: nowIso,
          };
        }
        throw new Error("پاسخ وب‌سرویس JSON معتبر نیست.");
      }
    }

    // 0. Custom parser function support directly on sourceConfig
    if (typeof sourceConfig.customParser === "function") {
      try {
        const parsed = sourceConfig.customParser(data, sourceConfig);
        if (typeof parsed === "number" && !isNaN(parsed)) {
          return {
            items: [{
              id: sourceConfig.id || sourceConfig.priceType || "api_source",
              name: sourceConfig.name || "سورس سفارشی",
              price: parsed,
            }],
            datetime: nowIso,
          };
        }
        if (parsed && typeof parsed === "object") {
          const rawItems = Array.isArray(parsed.items)
            ? parsed.items
            : (Array.isArray(parsed.compactList) ? parsed.compactList : null);

          if (Array.isArray(rawItems)) {
            const items = rawItems.map((it) => ({
              id: String(it.id || it.symbol || it.s || "").trim(),
              name: String(it.name || it.n || it.title || "").trim(),
              price: Number(it.price || it.priceToman || it.p || 0),
            }));
            return {
              items,
              datetime: parsed.datetime || nowIso,
            };
          }
          if (parsed.price !== undefined) {
            return {
              items: [{
                id: sourceConfig.id || sourceConfig.priceType || "api_source",
                name: sourceConfig.name || parsed.label || "سورس سفارشی",
                price: Number(parsed.price),
              }],
              datetime: parsed.datetime || nowIso,
            };
          }
        }
      } catch (err) {
        throw new Error(`خطا در اجرای customParser سورس: ${err.message}`);
      }
    }

    let fieldMapping = null;
    if (sourceConfig.fieldMapping) {
      try {
        fieldMapping = typeof sourceConfig.fieldMapping === "string" ? JSON.parse(sourceConfig.fieldMapping) : sourceConfig.fieldMapping;
      } catch {}
    } else if (sourceConfig.field_mapping) {
      try {
        fieldMapping = typeof sourceConfig.field_mapping === "string" ? JSON.parse(sourceConfig.field_mapping) : sourceConfig.field_mapping;
      } catch {}
    }

    // 1. Multi-Output Array Feeds
    if (sourceConfig.category === "multi_output" || (fieldMapping && (fieldMapping.isMultiOutput || fieldMapping.symbolField))) {
      let rawArray = Array.isArray(data) ? data : (data.data || data.items || data.symbols || []);
      if (Array.isArray(rawArray) && rawArray.length > 0) {
        const symKey = fieldMapping?.symbolField || "symbol";
        const nameKey = fieldMapping?.nameField || "name";
        const priceKey = fieldMapping?.priceField || "price";
        const isRialFeed = (fieldMapping && fieldMapping.priceUnit === "rial");
        const multiplier = Number(fieldMapping?.multiplier) > 0 ? Number(fieldMapping.multiplier) : (isRialFeed ? 0.1 : 1);

        const items = [];
        for (const item of rawArray) {
          if (!item || typeof item !== "object") continue;
          const sym = String(item[symKey] || "").trim();
          const name = String(item[nameKey] || sym).trim();
          const rawPrice = Number(item[priceKey] || item.pl || item.pc) || 0;
          if ((!sym && !name) || rawPrice <= 0) continue;

          const priceToman = Math.round(rawPrice * multiplier);
          items.push({
            id: sym || name,
            name: name,
            price: priceToman,
          });
        }

        if (items.length > 0) {
          return {
            items,
            datetime: nowIso,
          };
        }
      }
    }

    // 2. Standard Single-Output JSON parsing
    const jsonPath = sourceConfig.jsonPath || sourceConfig.json_path || sourceConfig.usd_api_json_path || "";
    let extractedVal = extractValueByPath(data, jsonPath);

    if (sourceConfig.regex && (typeof extractedVal === "string" || typeof extractedVal === "number")) {
      const regexNum = extractPriceWithRegex(String(extractedVal), sourceConfig.regex);
      if (regexNum && regexNum > 0) extractedVal = regexNum;
    } else if (sourceConfig.regex && extractedVal === null) {
      const regexNum = extractPriceWithRegex(rawStr, sourceConfig.regex);
      if (regexNum && regexNum > 0) extractedVal = regexNum;
    }

    if (extractedVal === null || isNaN(extractedVal) || extractedVal <= 0) {
      throw new Error(
        jsonPath
          ? `مقدار معتبری در مسیر «${jsonPath}» پاسخ JSON یافت نشد.`
          : "قیمت معتبری در پاسخ وب‌سرویس JSON یافت نشد."
      );
    }

    // Optional multiplier support (e.g. 0.1 for Rial to Toman conversion)
    const isRialFeed = (fieldMapping && fieldMapping.priceUnit === "rial");
    if (fieldMapping && Number(fieldMapping.multiplier) > 0) {
      extractedVal = Number(extractedVal) * Number(fieldMapping.multiplier);
    } else if (isRialFeed) {
      extractedVal = Number(extractedVal) * 0.1;
    }

    const priceType = (sourceConfig.priceType || sourceConfig.price_type || "").toLowerCase();
    const isUsdAsset = priceType === "ons_gold" || priceType === "ons_silver";
    const isForexSingle = ['eur', 'try', 'aed', 'gbp', 'chf', 'cad', 'aud', 'cny'].includes(priceType);

    let finalPrice;
    if (isForexSingle) {
      finalPrice = normalizeForexToUsdCrossRate(priceType, extractedVal);
    } else if (isUsdAsset) {
      finalPrice = Math.round(Number(extractedVal) * 100) / 100;
    } else if (sourceConfig.decimals !== undefined && sourceConfig.decimals !== null) {
      finalPrice = Number(Number(extractedVal).toFixed(Number(sourceConfig.decimals)));
    } else if (Number(extractedVal) < 100 && !Number.isInteger(Number(extractedVal))) {
      finalPrice = Number(Number(extractedVal).toFixed(4));
    } else {
      finalPrice = Math.round(Number(extractedVal));
    }

    return {
      items: [{
        id: sourceConfig.id || sourceConfig.priceType || sourceConfig.price_type || "api_source",
        name: sourceConfig.name || "سورس خارجی API",
        price: finalPrice,
      }],
      datetime: nowIso,
    };
  },

  async getItems(env = null) {
    return [];
  },

  async test(sourceConfig, env = null) {
    const url = (sourceConfig.endpoint || sourceConfig.apiUrl || sourceConfig.usd_api_url || "").trim();
    if (!url) {
      return { success: false, error: "لطفاً آدرس API URL را وارد کنید." };
    }

    try {
      const raw = await this.fetchRaw(sourceConfig, env);
      const parsed = this.parse(raw, sourceConfig);
      const count = parsed.items?.length || 0;
      const firstPrice = parsed.items?.[0]?.price || 0;
      const rawSnippet = raw && raw.length > 2500 ? raw.slice(0, 2500) + "\n... (ادامه متن کوتاه شد)" : (typeof raw === "object" ? JSON.stringify(raw, null, 2).slice(0, 2500) : String(raw || ""));

      return {
        success: true,
        source_type: "api_url",
        price: firstPrice,
        items: parsed.items,
        datetime: parsed.datetime,
        label: sourceConfig.name || "وب‌سرویس JSON",
        rawSnippet,
        message: count > 1
          ? `تعداد ${count} آیتم با موفقیت دریافت و پردازش شد.`
          : `قیمت با موفقیت دریافت شد: ${firstPrice.toLocaleString("fa-IR")}`,
      };
    } catch (e) {
      return { success: false, error: e.message || "خطا در برقراری ارتباط با منبع API" };
    }
  },
};
