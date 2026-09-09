/**
 * priceSources.js — Unified Price Sources Service
 * Supports multiple Telegram channels and JSON API feeds with custom regex,
 * configurable fetch intervals, primary source routing, and live testing.
 */

import {
  dbGetPriceSources,
  dbUpdateSourceLastPrice,
  dbRecordPriceHistory,
} from "../lib/db.js";
import { getGlobalSettings } from "../lib/settings.js";
import {
  normalizeDigits,
  getTelegramFetchTarget,
  extractValueByPath,
  parseUsdTelegramHtml,
  parseGoldTelegramHtml,
} from "./telegramPrices.js";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Module in-memory cache for speed
let memoryPricesCache = {};
let lastFetchTime = 0;

/**
 * Extract number from text using custom regular expression
 * @param {string} text
 * @param {string} regexPattern
 * @returns {number|null}
 */
export function extractPriceWithRegex(text, regexPattern) {
  if (!text || !regexPattern) return null;

  try {
    const normalized = normalizeDigits(text);
    const regex = new RegExp(regexPattern, "ims");
    const match = normalized.match(regex);
    if (!match) return null;

    // Use group 1 if captured, otherwise full match
    const targetStr = match[1] !== undefined ? match[1] : match[0];
    const cleanedDigits = targetStr.replace(/[, \s]/g, "").trim();
    const num = parseFloat(cleanedDigits);

    return (!isNaN(num) && num > 0) ? num : null;
  } catch (e) {
    console.error("extractPriceWithRegex error:", e);
    return null;
  }
}

/**
 * Fetch raw content from endpoint (with cache/deduplication support)
 * @param {string} sourceType
 * @param {string} endpoint
 * @returns {Promise<string>}
 */
export async function fetchRawEndpointContent(sourceType, endpoint) {
  if (sourceType === "api_url") {
    const trimmedUrl = (endpoint || "").trim();
    if (!/^https?:\/\//i.test(trimmedUrl)) {
      throw new Error("آدرس وب‌سرویس باید با http:// یا https:// آغاز شود.");
    }
    const res = await fetch(trimmedUrl, {
      headers: {
        "User-Agent": UA,
        "Accept": "application/json, text/plain, */*",
      },
    });
    if (!res.ok) {
      throw new Error(`خطای ارتباط با وب‌سرویس API (کد ${res.status} ${res.statusText})`);
    }
    return await res.text();
  } else {
    // Telegram
    const target = getTelegramFetchTarget(endpoint);
    const res = await fetch(target.url, {
      headers: { "User-Agent": UA },
    }).catch(() => null);

    if (res && res.ok) {
      return await res.text();
    }

    if (target.type === "post" && target.fallbackUrl) {
      const fallbackRes = await fetch(target.fallbackUrl, {
        headers: { "User-Agent": UA },
      }).catch(() => null);
      if (fallbackRes && fallbackRes.ok) {
        return await fallbackRes.text();
      }
    }

    throw new Error(`امکان اتصال به کانال تلگرام «${target.channel || endpoint}» وجود ندارد.`);
  }
}

/**
 * Parse price from raw content for a specific source definition
 * @param {object} source - { sourceType, priceType, endpoint, regex, jsonPath, name }
 * @param {string} rawContent
 * @returns {{ price: number, datetime: string, label: string }}
 */
export function parseSourceContent(source, rawContent) {
  const sourceType = source.sourceType === "api_url" ? "api_url" : "telegram";
  const nowIso = new Date().toISOString();

  if (sourceType === "api_url") {
    let data;
    try {
      data = JSON.parse(rawContent);
    } catch {
      const directNum = extractPriceWithRegex(rawContent, source.regex || "([\\d,]+)");
      if (directNum && directNum > 0) {
        return {
          price: Math.round(directNum),
          datetime: nowIso,
          label: source.name || "API URL",
        };
      }
      throw new Error("پاسخ وب‌سرویس JSON معتبر نیست.");
    }

    // If jsonPath is given or regex is not given
    let extractedVal = extractValueByPath(data, source.jsonPath || "");
    if (source.regex && (typeof extractedVal === "string" || typeof extractedVal === "number")) {
      const regexNum = extractPriceWithRegex(String(extractedVal), source.regex);
      if (regexNum && regexNum > 0) extractedVal = regexNum;
    } else if (source.regex && extractedVal === null) {
      // Try regex on the entire serialized json
      const regexNum = extractPriceWithRegex(rawContent, source.regex);
      if (regexNum && regexNum > 0) extractedVal = regexNum;
    }

    if (extractedVal === null || isNaN(extractedVal) || extractedVal <= 0) {
      throw new Error(
        source.jsonPath
          ? `مقدار معتبری در مسیر «${source.jsonPath}» پاسخ JSON یافت نشد.`
          : "قیمت معتبری در پاسخ وب‌سرویس JSON یافت نشد."
      );
    }

    return {
      price: Math.round(extractedVal),
      datetime: nowIso,
      label: source.name || "سورس خارجی API",
    };
  }

  // Telegram Parsing
  const target = getTelegramFetchTarget(source.endpoint);
  const html = rawContent;

  // 1. If custom regex is specified, search telegram message blocks
  if (source.regex && source.regex.trim()) {
    const messageBlocks = html.split(/<div class="tgme_widget_message\b/);

    for (let bIdx = messageBlocks.length - 1; bIdx >= 0; bIdx--) {
      const block = messageBlocks[bIdx];
      const timeMatch = block.match(/<time datetime="([^"]+)"/) || block.match(/datetime="([^"]+)"/);
      const datetime = timeMatch ? timeMatch[1] : nowIso;

      const textMatch = block.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
      if (!textMatch) continue;

      const rawText = normalizeDigits(textMatch[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim());
      const parsedNum = extractPriceWithRegex(rawText, source.regex.trim());

      if (parsedNum && parsedNum > 0) {
        return {
          price: Math.round(parsedNum),
          datetime,
          label: source.name || target.channel,
        };
      }
    }

    throw new Error(`قیمتی با الگوی ریجکس «${source.regex}» در پیام‌های اخیر کانال یافت نشد.`);
  }

  // 2. No custom regex: use built-in smart parsers
  if (source.priceType === "usd") {
    const parsedUsd = parseUsdTelegramHtml(html, target.channel);
    if (parsedUsd && parsedUsd.price) {
      return {
        price: parsedUsd.price,
        datetime: parsedUsd.datetime || nowIso,
        label: source.name || parsedUsd.label,
      };
    }
    throw new Error(`قیمت دلار در پیام‌های اخیر کانال «${target.channel}» یافت نشد.`);
  }

  // Gold or coin price types
  const parsedGold = parseGoldTelegramHtml(html);
  const matchedItem = parsedGold[source.priceType];
  if (matchedItem && matchedItem.price) {
    return {
      price: matchedItem.price,
      datetime: matchedItem.datetime || nowIso,
      label: source.name || matchedItem.label,
    };
  }

  throw new Error(`قیمت ${source.priceType} در پیام‌های کانال «${target.channel}» یافت نشد.`);
}

/**
 * Test a price source configuration without saving
 * @param {object} config - { sourceType, priceType, endpoint, regex, jsonPath, name }
 * @returns {Promise<object>}
 */
export async function testPriceSourceConfig(config = {}) {
  const sourceType = config.sourceType || config.source_type || "telegram";
  const priceType = config.priceType || config.price_type || "usd";
  const endpoint = config.endpoint || config.channelUsername || config.apiUrl || config.usd_telegram_channel || config.usd_api_url || "";
  const regex = config.regex || config.regexPattern || "";
  const jsonPath = config.jsonPath || config.json_path || config.usd_api_json_path || "";
  const name = config.name || "سورس تست";

  if (!endpoint || !endpoint.trim()) {
    return {
      success: false,
      error: sourceType === "api_url" ? "لطفاً آدرس API URL را وارد کنید." : "لطفاً نام یا لینک کانال تلگرام را وارد کنید.",
    };
  }

  try {
    const raw = await fetchRawEndpointContent(sourceType, endpoint.trim());
    const parsed = parseSourceContent(
      { sourceType, priceType, endpoint: endpoint.trim(), regex, jsonPath, name },
      raw
    );

    return {
      success: true,
      sourceType,
      priceType,
      price: parsed.price,
      datetime: parsed.datetime,
      label: parsed.label,
      message: `قیمت با موفقیت استخراج شد: ${parsed.price.toLocaleString("fa-IR")} تومان`,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || "خطا در بررسی سورس",
    };
  }
}

/**
 * Fetch all active price sources, parallelized and grouped by endpoint
 * @param {object} env
 * @param {boolean} [forceRefresh=false]
 * @param {object} [settings=null]
 * @returns {Promise<object>}
 */
export async function fetchAllPrices(env, forceRefresh = false, settings = null) {
  const nowMs = Date.now();
  let stored = { ...memoryPricesCache };

  // Read existing cached prices from KV
  if (env && env.REALRATE_KV) {
    try {
      const kvVal = await env.REALRATE_KV.get("tg_prices", "json");
      if (kvVal) stored = { ...stored, ...kvVal };
    } catch (e) {
      console.error("KV Read Error in fetchAllPrices:", e);
    }
  }

  const lastCheckMs = stored.last_channel_check_time
    ? new Date(stored.last_channel_check_time).getTime()
    : lastFetchTime;
  const isFresh = (nowMs - lastCheckMs) < 60000;

  if (isFresh && !forceRefresh && Object.keys(stored).length > 2) {
    return stored;
  }

  // Fetch sources list from DB or KV
  let sources = [];
  try {
    sources = await dbGetPriceSources(env);
  } catch (e) {
    console.error("Error fetching price sources list:", e);
  }

  // If no sources defined yet, return fallback
  if (!Array.isArray(sources) || sources.length === 0) {
    return stored;
  }

  const activeSources = sources.filter(s => s.isActive);
  if (activeSources.length === 0) {
    return stored;
  }

  // Deduplicate network requests by (sourceType + "::" + endpoint)
  const endpointRequests = new Map();
  for (const src of activeSources) {
    const key = `${src.sourceType}::${src.endpoint}`;
    if (!endpointRequests.has(key)) {
      endpointRequests.set(key, fetchRawEndpointContent(src.sourceType, src.endpoint).catch(err => {
        console.warn(`Failed to fetch endpoint ${key}:`, err.message);
        return null;
      }));
    }
  }

  // Wait for all unique endpoint fetches
  const endpointKeys = Array.from(endpointRequests.keys());
  const rawResults = await Promise.all(endpointRequests.values());
  const endpointContentMap = new Map();
  for (let i = 0; i < endpointKeys.length; i++) {
    endpointContentMap.set(endpointKeys[i], rawResults[i]);
  }

  // Parse each active source
  const sourceResults = [];
  for (const src of activeSources) {
    const key = `${src.sourceType}::${src.endpoint}`;
    const raw = endpointContentMap.get(key);
    if (!raw) continue;

    try {
      const parsed = parseSourceContent(src, raw);
      if (parsed && parsed.price) {
        sourceResults.push({
          source: src,
          price: parsed.price,
          datetime: parsed.datetime,
          label: parsed.label,
        });

        // Update DB last price & record history in background
        if (env) {
          dbUpdateSourceLastPrice(env, src.id, parsed.price, parsed.datetime).catch(() => {});
          dbRecordPriceHistory(env, {
            sourceId: src.id,
            priceType: src.priceType,
            sourceName: src.name,
            price: parsed.price,
            timestamp: parsed.datetime,
          }).catch(() => {});
        }
      }
    } catch (parseErr) {
      console.warn(`Failed to parse source ${src.name} (${src.id}):`, parseErr.message);
    }
  }

  // Group by priceType and pick the primary source
  // Standard price types: usd, gold_18k, full_coin, half_coin, quarter_coin, mesghal
  const priceTypes = ["usd", "gold_18k", "full_coin", "half_coin", "quarter_coin", "mesghal"];

  for (const pType of priceTypes) {
    const candidates = sourceResults.filter(r => r.source.priceType === pType);
    let chosen = candidates.find(r => r.source.isPrimary) || candidates[0];

    // If no candidate fetched in this cycle, retain existing cached value or use lastPrice from DB
    if (!chosen) {
      const dbFallback = activeSources.find(s => s.priceType === pType && s.lastPrice > 0);
      if (dbFallback) {
        chosen = {
          source: dbFallback,
          price: dbFallback.lastPrice,
          datetime: dbFallback.lastFetched || new Date().toISOString(),
          label: dbFallback.name,
        };
      }
    }

    if (chosen) {
      const itemKey = pType === "usd" ? "usd_toman" : pType;
      const existing = stored[itemKey];

      stored[itemKey] = (existing && existing.price === chosen.price)
        ? { price: existing.price, datetime: existing.datetime || chosen.datetime, label: chosen.label }
        : { price: chosen.price, datetime: chosen.datetime, label: chosen.label };

      // Also set 'usd' key alongside 'usd_toman' for convenience
      if (pType === "usd") {
        stored.usd = stored.usd_toman;
      }
    }
  }

  stored.last_channel_check_time = new Date().toISOString();
  memoryPricesCache = { ...stored };
  lastFetchTime = nowMs;

  // Persist combined prices to KV
  if (env && env.REALRATE_KV) {
    try {
      await env.REALRATE_KV.put("tg_prices", JSON.stringify(stored));
    } catch (e) {
      console.error("KV Write Error in fetchAllPrices:", e);
    }
  }

  return stored;
}
