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
 * Normalize raw forex quote to USD cross rate (value of 1 unit of foreign currency in USD)
 * @param {string} priceType - e.g. 'eur', 'try', 'aed', 'gbp', 'chf', 'cad', 'aud', 'cny'
 * @param {number|string} rawVal
 * @returns {number}
 */
export function normalizeForexToUsdCrossRate(priceType, rawVal) {
  const num = Number(rawVal);
  if (!num || num <= 0) return 0;

  const p = (priceType || '').toLowerCase();
  // Currencies typically stronger than USD (EUR, GBP, CHF)
  if (p === 'eur' || p === 'gbp' || p === 'chf') {
    return num < 1 ? parseFloat((1 / num).toFixed(5)) : parseFloat(num.toFixed(5));
  }
  // All other currencies (TRY, AED, CAD, AUD, CNY, etc.)
  if (num > 1) {
    return parseFloat((1 / num).toFixed(5));
  }
  return parseFloat(num.toFixed(5));
}

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

    // Multi-output handler: Unified Forex feed
    if (source.priceType === "forex") {
      let ratesObj = null;
      if (source.jsonPath) {
        ratesObj = extractValueByPath(data, source.jsonPath);
      }
      if (!ratesObj && data && typeof data.rates === "object") {
        ratesObj = data.rates;
      }
      if (!ratesObj && typeof data === "object") {
        ratesObj = data;
      }
      if (!ratesObj || typeof ratesObj !== "object") {
        throw new Error("بخش نرخ‌ها (rates) در پاسخ وب‌سرویس JSON یافت نشد.");
      }

      const forexKeys = ['eur', 'try', 'aed', 'gbp', 'chf', 'cad', 'aud', 'cny'];
      const multiData = {};
      for (const k of forexKeys) {
        const uppercaseK = k.toUpperCase();
        const rawRate = ratesObj[uppercaseK] !== undefined ? ratesObj[uppercaseK] : ratesObj[k];
        if (rawRate !== undefined && Number(rawRate) > 0) {
          multiData[k] = normalizeForexToUsdCrossRate(k, rawRate);
        }
      }

      const count = Object.keys(multiData).length;
      if (count === 0) {
        throw new Error("هیچ‌کدام از ارزهای پشتیبانی‌شده فارکس (EUR, TRY, AED, ...) در پاسخ وب‌سرویس یافت نشد.");
      }

      return {
        price: count,
        multiData,
        datetime: nowIso,
        label: source.name || "نرخ‌های جهانی فارکس",
      };
    }

    // Multi-output handler: Tehran Stock Exchange (BRS API)
    if (source.priceType === "bourse") {
      let rawArray = data;
      if (!Array.isArray(rawArray) && data && Array.isArray(data.symbols)) {
        rawArray = data.symbols;
      }
      if (!Array.isArray(rawArray) || rawArray.length === 0) {
        throw new Error("داده‌های نمادهای بورس در پاسخ وب‌سرویس یافت نشد.");
      }

      const compactList = [];
      for (const item of rawArray) {
        const sym = (item.l18 || item.l18_formatted || "").trim();
        if (!sym) continue;
        const price = Number(item.pl) || Number(item.pc) || 0;
        if (price <= 0) continue;
        compactList.push({
          s: sym,
          n: (item.l30 || item.title || sym).trim(),
          p: price,
          c: Number(item.plc) || 0,
          cp: Number(item.plp) || 0,
          t: Number(item.tno) || 0,
        });
      }

      if (compactList.length === 0) {
        throw new Error("هیچ نماد معتبری در پاسخ بورس یافت نشد.");
      }

      compactList.sort((a, b) => b.t - a.t);

      return {
        price: compactList.length,
        multiData: {
          totalSymbols: compactList.length,
          topSymbols: compactList.slice(0, 10).map(x => x.s),
        },
        compactList,
        datetime: nowIso,
        label: source.name || "بورس اوراق بهادار تهران",
      };
    }

    // Standard Single-Output JSON parsing
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

    const isUsdAsset = source.priceType === "ons_gold" || source.priceType === "ons_silver";
    const isForex = ['eur', 'try', 'aed', 'gbp', 'chf', 'cad', 'aud', 'cny'].includes((source.priceType || '').toLowerCase());
    let finalPrice;
    if (isForex) {
      finalPrice = normalizeForexToUsdCrossRate(source.priceType, extractedVal);
    } else if (isUsdAsset) {
      finalPrice = Math.round(Number(extractedVal) * 100) / 100;
    } else {
      finalPrice = Math.round(Number(extractedVal));
    }

    return {
      price: finalPrice,
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
        const isUsdAsset = source.priceType === "ons_gold" || source.priceType === "ons_silver";
        return {
          price: isUsdAsset ? Math.round(parsedNum * 100) / 100 : Math.round(parsedNum),
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

    const isForex = ['eur', 'try', 'aed', 'gbp', 'chf', 'cad', 'aud', 'cny'].includes((priceType || '').toLowerCase());
    let displayMsg = '';
    if (priceType === 'forex') {
      const keys = parsed.multiData ? Object.keys(parsed.multiData).map(k => k.toUpperCase()).join('، ') : '';
      displayMsg = `سورس تجمیعی فارکس با موفقیت تست شد (${parsed.price} ارز با یک درخواست: ${keys})`;
    } else if (priceType === 'bourse') {
      displayMsg = `اطلاعات نمادهای بورس با موفقیت تست شد (${parsed.price.toLocaleString("fa-IR")} نماد)`;
    } else if (isForex) {
      displayMsg = `نرخ برابری استخراج شد: ۱ واحد = ${parsed.price} دلار آمریکا`;
    } else if (priceType === 'ons_gold' || priceType === 'ons_silver') {
      displayMsg = `قیمت جهانی با موفقیت استخراج شد: ${parsed.price} دلار`;
    } else {
      displayMsg = `قیمت با موفقیت استخراج شد: ${parsed.price.toLocaleString("fa-IR")} تومان`;
    }

    return {
      success: true,
      sourceType,
      priceType,
      price: parsed.price,
      multiData: parsed.multiData || null,
      datetime: parsed.datetime,
      label: parsed.label,
      message: displayMsg,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || "خطا در بررسی سورس",
    };
  }
}

/**
 * Compile unified market rates from active sources (picking primary or latest for each priceType)
 * @param {Array<object>} sources
 * @returns {object}
 */
export function compileLatestMarketRates(sources) {
  const supportedTypes = [
    "usd",
    "gold_18k",
    "full_coin",
    "half_coin",
    "quarter_coin",
    "mesghal",
    "ons_gold",
    "ons_silver",
    "eur",
    "try",
    "aed",
    "gbp",
    "chf",
    "cad",
    "aud",
    "cny",
  ];

  const result = {
    last_updated: new Date().toISOString(),
  };

  if (!Array.isArray(sources)) return result;

  // 1. Process multi-output sources first
  // Unified Forex feed: inject individual currencies
  const forexSource = sources.find(s => s.priceType === "forex" && s.isActive);
  if (forexSource && forexSource.lastMultiData) {
    try {
      const multi = typeof forexSource.lastMultiData === 'string'
        ? JSON.parse(forexSource.lastMultiData)
        : forexSource.lastMultiData;
      if (multi && typeof multi === 'object') {
        for (const [k, val] of Object.entries(multi)) {
          if (Number(val) > 0) {
            result[k.toLowerCase()] = {
              price: Number(val),
              datetime: forexSource.lastFetched || new Date().toISOString(),
              label: `${forexSource.name} (${k.toUpperCase()})`,
              sourceId: forexSource.id,
              isPrimary: true,
            };
          }
        }
      }
    } catch (e) {
      console.warn("Error parsing forex lastMultiData in compileLatestMarketRates:", e);
    }
  }

  // Tehran Stock Exchange (Bourse):
  const bourseSource = sources.find(s => s.priceType === "bourse" && s.isActive);
  if (bourseSource) {
    result.bourse = {
      price: Number(bourseSource.lastPrice) || 0,
      datetime: bourseSource.lastFetched || new Date().toISOString(),
      label: bourseSource.name,
      sourceId: bourseSource.id,
      isPrimary: true,
    };
  }

  // 2. Process single output price sources
  for (const pType of supportedTypes) {
    const candidates = sources.filter(s => s.priceType === pType && s.isActive && Number(s.lastPrice) > 0);
    const chosen = candidates.find(s => s.isPrimary) || candidates[0];

    if (chosen) {
      const itemKey = pType === "usd" ? "usd_toman" : pType;
      result[itemKey] = {
        price: chosen.lastPrice,
        datetime: chosen.lastFetched || new Date().toISOString(),
        label: chosen.name,
        sourceId: chosen.id,
        isPrimary: !!chosen.isPrimary,
      };

      if (pType === "usd") {
        result.usd = result.usd_toman;
      }
    }
  }

  return result;
}

/**
 * Handle scheduled automatic price extraction runner:
 * Checks each active source against its configured interval (fetch_interval_sec).
 * If (now - lastFetched) >= interval (or forceAll is true), fetches and extracts price.
 * Updates D1 last_price, records D1 history, and saves latest prices into KV.
 *
 * @param {object} env
 * @param {boolean} [forceAll=false]
 * @returns {Promise<{ extractedCount: number, rates: object }>}
 */
export async function handleScheduledPriceExtraction(env, forceAll = false) {
  if (!env) return { extractedCount: 0, rates: {} };

  let sources = [];
  try {
    sources = await dbGetPriceSources(env);
  } catch (e) {
    console.error("Error fetching price sources for scheduled extraction:", e);
    return { extractedCount: 0, rates: {} };
  }

  if (!Array.isArray(sources) || sources.length === 0) {
    return { extractedCount: 0, rates: {} };
  }

  const activeSources = sources.filter(s => s.isActive);
  if (activeSources.length === 0) {
    return { extractedCount: 0, rates: {} };
  }

  const nowMs = Date.now();
  const dueSources = forceAll
    ? activeSources
    : activeSources.filter(s => {
        const intervalMs = Math.max(15, (s.fetchIntervalSec || 60)) * 1000;
        const lastFetchedMs = s.lastFetched ? new Date(s.lastFetched).getTime() : 0;
        return (nowMs - lastFetchedMs) >= intervalMs;
      });

  let extractedCount = 0;

  if (dueSources.length > 0) {
    // 1. Deduplicate network requests by (sourceType + "::" + endpoint)
    const endpointRequests = new Map();
    for (const src of dueSources) {
      const key = `${src.sourceType}::${src.endpoint}`;
      if (!endpointRequests.has(key)) {
        endpointRequests.set(
          key,
          fetchRawEndpointContent(src.sourceType, src.endpoint).catch(err => {
            console.warn(`[PriceSources] Fetch failed for ${key}:`, err.message);
            return null;
          })
        );
      }
    }

    const endpointKeys = Array.from(endpointRequests.keys());
    const rawResults = await Promise.all(endpointRequests.values());
    const endpointContentMap = new Map();
    for (let i = 0; i < endpointKeys.length; i++) {
      endpointContentMap.set(endpointKeys[i], rawResults[i]);
    }

    // 2. Parse and record each due source
    const updates = [];
    for (const src of dueSources) {
      const key = `${src.sourceType}::${src.endpoint}`;
      const raw = endpointContentMap.get(key);
      if (!raw) continue;

      try {
        const parsed = parseSourceContent(src, raw);
        if (parsed && (parsed.price > 0 || (parsed.multiData && Object.keys(parsed.multiData).length > 0))) {
          extractedCount++;
          src.lastPrice = parsed.price;
          src.lastFetched = parsed.datetime;
          if (parsed.multiData) {
            src.lastMultiData = parsed.multiData;
          }

          // Update D1 last price and last_multi_data
          updates.push(
            dbUpdateSourceLastPrice(env, src.id, parsed.price, parsed.datetime, parsed.multiData || null)
          );

          // If multi forex data, record individual currency histories
          if (src.priceType === "forex" && parsed.multiData) {
            for (const [k, val] of Object.entries(parsed.multiData)) {
              if (Number(val) > 0) {
                updates.push(
                  dbRecordPriceHistory(env, {
                    sourceId: src.id,
                    priceType: k.toLowerCase(),
                    sourceName: `${src.name} (${k.toUpperCase()})`,
                    price: val,
                    timestamp: parsed.datetime,
                  })
                );
              }
            }
          } else if (src.priceType === "bourse" && parsed.compactList && env.REALRATE_KV) {
            // Cache bourse compact symbols in KV
            updates.push(
              env.REALRATE_KV.put("bourse_symbols_compact", JSON.stringify(parsed.compactList), {
                expirationTtl: 86400 * 2,
              }).catch(() => {})
            );
          } else {
            // Standard single asset history
            updates.push(
              dbRecordPriceHistory(env, {
                sourceId: src.id,
                priceType: src.priceType,
                sourceName: src.name,
                price: parsed.price,
                timestamp: parsed.datetime,
              })
            );
          }

          // Save individual source price into KV for instant single-source lookups
          if (env.REALRATE_KV) {
            updates.push(
              env.REALRATE_KV.put(
                `source_price:${src.id}`,
                JSON.stringify({
                  price: parsed.price,
                  lastFetched: parsed.datetime,
                  priceType: src.priceType,
                  name: src.name,
                  lastMultiData: parsed.multiData || undefined,
                })
              ).catch(() => {})
            );
          }
        }
      } catch (parseErr) {
        console.warn(`[PriceSources] Parse failed for ${src.name} (${src.id}):`, parseErr.message);
      }
    }

    if (updates.length > 0) {
      await Promise.allSettled(updates);
    }
  }

  // 3. Compile clean latest_rates for all active sources
  const latestRates = compileLatestMarketRates(activeSources);

  // 4. Save latest_rates to KV
  if (env.REALRATE_KV) {
    try {
      await env.REALRATE_KV.put("latest_rates", JSON.stringify(latestRates));
    } catch (e) {
      console.error("KV write error for latest_rates:", e);
    }
  }

  memoryPricesCache = { ...latestRates };
  lastFetchTime = Date.now();

  return { extractedCount, rates: latestRates };
}

/**
 * Get latest market rates instantly from KV (with fallback to scheduled extraction if empty)
 * @param {object} env
 * @returns {Promise<object>}
 */
export async function getLatestMarketRates(env) {
  // 1. In-memory cache
  if (
    memoryPricesCache &&
    Object.keys(memoryPricesCache).length > 2 &&
    Date.now() - lastFetchTime < 60000
  ) {
    return memoryPricesCache;
  }

  // 2. Read directly from KV (fastest access, sub-5ms)
  if (env && env.REALRATE_KV) {
    try {
      const kvVal = await env.REALRATE_KV.get("latest_rates", "json");
      if (kvVal && Object.keys(kvVal).length > 2) {
        memoryPricesCache = kvVal;
        lastFetchTime = Date.now();
        return kvVal;
      }
    } catch (e) {
      console.error("KV read error in getLatestMarketRates:", e);
    }
  }

  // 3. Fallback: If KV is cold/empty, trigger extraction immediately
  const { rates } = await handleScheduledPriceExtraction(env, true);
  return rates;
}

/**
 * Fetch all prices (compatible wrapper)
 * @param {object} env
 * @param {boolean} [forceRefresh=false]
 * @param {object} [settings=null]
 * @returns {Promise<object>}
 */
export async function fetchAllPrices(env, forceRefresh = false, settings = null) {
  if (forceRefresh) {
    const { rates } = await handleScheduledPriceExtraction(env, true);
    return rates;
  }
  return await getLatestMarketRates(env);
}
