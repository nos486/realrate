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
import { fetchAndStoreBourseSymbols } from "./bourseSymbols.js";

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

    let fieldMapping = null;
    if (source.fieldMapping) {
      try {
        fieldMapping = typeof source.fieldMapping === "string" ? JSON.parse(source.fieldMapping) : source.fieldMapping;
      } catch {}
    } else if (source.field_mapping) {
      try {
        fieldMapping = typeof source.field_mapping === "string" ? JSON.parse(source.field_mapping) : source.field_mapping;
      } catch {}
    }

    // Multi-output handler: Unified Forex feed (Dynamic Currencies)
    if (source.priceType === "forex") {
      const ratesPath = (fieldMapping && fieldMapping.ratesPath) || source.jsonPath || "rates";
      let ratesObj = extractValueByPath(data, ratesPath);
      if (!ratesObj && data && typeof data.rates === "object") {
        ratesObj = data.rates;
      }
      if (!ratesObj && typeof data === "object") {
        ratesObj = data;
      }
      if (!ratesObj || typeof ratesObj !== "object") {
        throw new Error(`بخش نرخ‌ها (مسیر «${ratesPath}») در پاسخ وب‌سرویس JSON یافت نشد.`);
      }

      // Read configured currencies from fieldMapping, or fallback to default 8 world currencies
      const currencyConfigs = Array.isArray(fieldMapping?.currencies) && fieldMapping.currencies.length > 0
        ? fieldMapping.currencies
        : [
            { key: 'eur', path: 'EUR', mode: 'invert', label: 'یورو اروپا' },
            { key: 'try', path: 'TRY', mode: 'invert', label: 'لیر ترکیه' },
            { key: 'aed', path: 'AED', mode: 'invert', label: 'درهم امارات' },
            { key: 'gbp', path: 'GBP', mode: 'invert', label: 'پوند انگلیس' },
            { key: 'chf', path: 'CHF', mode: 'invert', label: 'فرانک سوئیس' },
            { key: 'cad', path: 'CAD', mode: 'invert', label: 'دلار کانادا' },
            { key: 'aud', path: 'AUD', mode: 'invert', label: 'دلار استرالیا' },
            { key: 'cny', path: 'CNY', mode: 'invert', label: 'یوان چین' },
          ];

      const multiData = {};
      const currencyList = [];
      // Parse excluded outputs (currency codes to skip)
      const excludedSet = new Set(
        Array.isArray(source.excludedOutputs)
          ? source.excludedOutputs.map(k => String(k).toLowerCase())
          : []
      );
      for (const cfg of currencyConfigs) {
        const key = String(cfg.key || cfg.code || '').trim().toLowerCase();
        if (!key) continue;
        if (excludedSet.has(key)) continue; // skip excluded currencies
        const pathKey = cfg.path || key.toUpperCase();
        const rawRate = extractValueByPath(ratesObj, pathKey) !== null
          ? extractValueByPath(ratesObj, pathKey)
          : (ratesObj[pathKey] !== undefined ? ratesObj[pathKey] : ratesObj[key]);

        if (rawRate !== undefined && rawRate !== null && Number(rawRate) > 0) {
          const numVal = Number(rawRate);
          let usdRate;
          if (cfg.mode === 'direct') {
            usdRate = numVal;
          } else if (cfg.mode === 'multiply' && Number(cfg.multiplier) > 0) {
            usdRate = numVal * Number(cfg.multiplier);
          } else if (cfg.mode === 'invert') {
            usdRate = 1 / numVal;
          } else {
            usdRate = normalizeForexToUsdCrossRate(key, numVal);
          }

          const finalRate = parseFloat(usdRate.toFixed(5));
          multiData[key] = finalRate;
          currencyList.push({
            key,
            code: key.toUpperCase(),
            label: cfg.label || key.toUpperCase(),
            rawRate: numVal,
            usdCrossRate: finalRate,
          });
        }
      }

      const count = Object.keys(multiData).length;
      if (count === 0) {
        throw new Error("هیچ‌کدام از ارزهای تعریف‌شده فارکس در پاسخ وب‌سرویس یافت نشد.");
      }

      return {
        price: count,
        multiData,
        currencyList,
        datetime: nowIso,
        label: source.name || "نرخ‌های جهانی فارکس",
      };
    }

    // Generic Multi-Output Handler (Bourse, Cars, Crypto, Commodities, Housing, or custom multi-item feeds)
    const isMultiOutput = source.category === "multi_output" ||
      fieldMapping?.isMultiOutput ||
      source.priceType === "bourse" ||
      source.priceType === "bourse_fund" ||
      (fieldMapping && (fieldMapping.symbolField || fieldMapping.idField || fieldMapping.priceField));

    if (isMultiOutput && source.priceType !== "forex") {
      const isFundSource = source.priceType === "bourse_fund" || (source.endpoint && source.endpoint.includes("Fund.php"));
      const bMap = fieldMapping || (isFundSource ? {
        arrayPath: "data",
        symbolField: "l18",
        nameField: "l30",
        priceField: "pl",
        altPriceField: "pc",
        changeField: "plc",
        changePercentField: "plp",
        volumeField: "tno",
        priceUnit: "rial",
      } : (source.priceType === "bourse" ? {
        arrayPath: "",
        symbolField: "l18",
        nameField: "l30",
        priceField: "pl",
        altPriceField: "pc",
        changeField: "plc",
        changePercentField: "plp",
        volumeField: "tno",
        priceUnit: "rial",
      } : {}));

      const arrayPath = bMap.arrayPath !== undefined ? bMap.arrayPath : (isFundSource ? "data" : "");
      let rawArray = arrayPath ? extractValueByPath(data, arrayPath, true) : data;
      if (!Array.isArray(rawArray) && data) {
        if (Array.isArray(data.data)) rawArray = data.data;
        else if (Array.isArray(data.items)) rawArray = data.items;
        else if (Array.isArray(data.symbols)) rawArray = data.symbols;
        else if (Array.isArray(data.results)) rawArray = data.results;
        else if (Array.isArray(data.result)) rawArray = data.result;
        else if (Array.isArray(data.list)) rawArray = data.list;
      }

      if (!Array.isArray(rawArray) || rawArray.length === 0) {
        throw new Error(`آرایه اقلام در مسیر «${arrayPath || 'ریشه'}» پاسخ وب‌سرویس یافت نشد.`);
      }

      const symKey = bMap.idField || bMap.symbolField || (source.priceType === 'bourse' || source.priceType === 'bourse_fund' ? 'l18' : 'id');
      const nameKey = bMap.titleField || bMap.nameField || (source.priceType === 'bourse' || source.priceType === 'bourse_fund' ? 'l30' : 'name');
      const priceKey = bMap.priceField || (source.priceType === 'bourse' || source.priceType === 'bourse_fund' ? 'pl' : 'price');
      const altPriceKey = bMap.altPriceField || (source.priceType === 'bourse' || source.priceType === 'bourse_fund' ? 'pc' : 'altPrice');
      const changeKey = bMap.changeField || 'plc';
      const changePctKey = bMap.changePercentField || 'plp';
      const volumeKey = bMap.extraField || bMap.volumeField || 'tno';
      const categoryKey = bMap.categoryField || 'category';

      const isRial = bMap.priceUnit === "rial";
      const multiplier = Number(bMap.multiplier) > 0 ? Number(bMap.multiplier) : (isRial ? 0.1 : 1);
      const labels = bMap.labels || {};

      // Parse excluded outputs (symbol/code/title to omit)
      const excludedSet = new Set(
        Array.isArray(source.excludedOutputs)
          ? source.excludedOutputs.map(s => String(s).trim().toLowerCase())
          : []
      );

      const compactList = [];
      for (const item of rawArray) {
        if (!item || typeof item !== "object") continue;
        const sym = String(item[symKey] || item.symbol || item.id || item.code || item.l18 || item.slug || "").trim();
        const name = String(item[nameKey] || item.name || item.title || item.l30 || item.car_name || item.model || sym).trim();
        if (!sym && !name) continue;

        // Skip excluded items (check against code, symbol, or name)
        if (excludedSet.size > 0 && (
          (sym && excludedSet.has(sym.toLowerCase())) ||
          (name && excludedSet.has(name.toLowerCase()))
        )) {
          continue;
        }

        let rawPrice = Number(item[priceKey]);
        if (!rawPrice || isNaN(rawPrice) || rawPrice <= 0) {
          rawPrice = Number(item[altPriceKey]) || Number(item.pl) || Number(item.pc) || Number(item.lastPrice) || Number(item.price) || 0;
        }
        if (rawPrice <= 0) continue;

        const finalPrice = Math.round(rawPrice * multiplier);
        let altFinalPrice = 0;
        if (item[altPriceKey] !== undefined && Number(item[altPriceKey]) > 0) {
          altFinalPrice = Math.round(Number(item[altPriceKey]) * multiplier);
        }

        const c = Number(item[changeKey] !== undefined ? item[changeKey] : (item.plc !== undefined ? item.plc : 0)) || 0;
        const cp = Number(item[changePctKey] !== undefined ? item[changePctKey] : (item.plp !== undefined ? item.plp : (item.percent || 0))) || 0;
        const extraVal = item[volumeKey] !== undefined ? item[volumeKey] : (item.tno !== undefined ? item.tno : "");
        const catVal = item[categoryKey] !== undefined ? item[categoryKey] : (item.brand || item.group || "");

        compactList.push({
          s: sym || name,
          n: name,
          p: isRial ? Math.round(rawPrice) : finalPrice,
          priceTomans: finalPrice,
          priceFinal: finalPrice,
          altPrice: altFinalPrice,
          c,
          cp,
          t: typeof extraVal === "number" ? extraVal : 0,
          extra: extraVal,
          cat: catVal,
          ...(isFundSource ? { f: 1 } : {}),
        });
      }

      if (compactList.length === 0) {
        throw new Error(`هیچ آیتم معتبری با کلیدهای شناسه (${symKey}) و قیمت (${priceKey}) در پاسخ یافت نشد.`);
      }

      if (compactList.some(x => x.t > 0)) {
        compactList.sort((a, b) => b.t - a.t);
      }

      return {
        price: compactList.length,
        multiData: {
          totalCount: compactList.length,
          totalSymbols: compactList.length,
          topSymbols: compactList.slice(0, 20).map(x => x.s),
          sampleItems: compactList.slice(0, 500),
          items: compactList.slice(0, 500),
          compactList: compactList.slice(0, 500),
          labels,
          updatedAt: nowIso,
        },
        compactList,
        sampleSymbols: compactList.slice(0, 10),
        labels,
        datetime: nowIso,
        label: source.name || (source.priceType === "bourse_fund" ? "بورس اوراق بهادار تهران (صندوق)" : "فید چند خروجی"),
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

    // Optional multiplier support (e.g. 0.1 for Rial to Toman conversion)
    if (fieldMapping && Number(fieldMapping.multiplier) > 0) {
      extractedVal = Number(extractedVal) * Number(fieldMapping.multiplier);
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

  const fieldMapping = config.fieldMapping || config.field_mapping || null;

  if (!endpoint || !endpoint.trim()) {
    return {
      success: false,
      error: sourceType === "api_url" ? "لطفاً آدرس API URL را وارد کنید." : "لطفاً نام یا لینک کانال تلگرام را وارد کنید.",
    };
  }

  let raw = "";
  try {
    raw = await fetchRawEndpointContent(sourceType, endpoint.trim());
  } catch (fetchErr) {
    return {
      success: false,
      error: fetchErr.message || "خطا در برقراری ارتباط با منبع",
    };
  }

  const rawSnippet = raw && raw.length > 2500 ? raw.slice(0, 2500) + "\n... (ادامه متن کوتاه شد)" : raw;

  try {
    const parsed = parseSourceContent(
      { sourceType, priceType, endpoint: endpoint.trim(), regex, jsonPath, fieldMapping, name },
      raw
    );

    const isForex = ['eur', 'try', 'aed', 'gbp', 'chf', 'cad', 'aud', 'cny'].includes((priceType || '').toLowerCase());
    let displayMsg = '';
    if (priceType === 'forex') {
      const keys = parsed.multiData ? Object.keys(parsed.multiData).map(k => k.toUpperCase()).join('، ') : '';
      displayMsg = `سورس تجمیعی فارکس با موفقیت تست شد (${parsed.price} ارز استخراج شد: ${keys})`;
    } else if (priceType === 'bourse_fund') {
      displayMsg = `اطلاعات صندوق‌های بورس با موفقیت تست شد (${parsed.price.toLocaleString("fa-IR")} صندوق استخراج شد)`;
    } else if (priceType === 'bourse') {
      displayMsg = `اطلاعات نمادهای بورس با موفقیت تست شد (${parsed.price.toLocaleString("fa-IR")} نماد استخراج شد)`;
    } else if (parsed.compactList && parsed.compactList.length > 0) {
      displayMsg = `فید چند خروجی با موفقیت تست شد (${parsed.price.toLocaleString("fa-IR")} آیتم استخراج شد)`;
    } else if (isForex) {
      displayMsg = `نرخ برابری استخراج شد: ۱ واحد = ${parsed.price} دلار آمریکا`;
    } else if (priceType === 'ons_gold' || priceType === 'ons_silver') {
      displayMsg = `قیمت جهانی با موفقیت استخراج شد: ${parsed.price} دلار`;
    } else {
      displayMsg = `قیمت با موفقیت استخراج شد: ${parsed.price.toLocaleString("fa-IR")}`;
    }

    return {
      success: true,
      sourceType,
      priceType,
      price: parsed.price,
      rawSnippet,
      multiData: parsed.multiData || null,
      sampleSymbols: parsed.sampleSymbols || null,
      sampleItems: parsed.compactList ? parsed.compactList.slice(0, 10) : null,
      labels: parsed.labels || null,
      currencyList: parsed.currencyList || null,
      datetime: parsed.datetime,
      label: parsed.label,
      message: displayMsg,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || "خطا در پردازش داده‌های منبع",
      rawSnippet,
    };
  }
}

/**
 * Inspect an API endpoint structure to discover arrays and JSON keys
 * @param {string} endpointUrl
 * @param {object} [customHeaders]
 * @returns {Promise<object>}
 */
export async function inspectApiEndpointStructure(endpointUrl, customHeaders = {}) {
  if (!endpointUrl || !endpointUrl.startsWith("http")) {
    throw new Error("آدرس وب‌سرویس معتبر نیست. لطفاً یک URL کامل با http یا https وارد کنید.");
  }

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) RealRateWorker/1.0",
    "Accept": "application/json, text/plain, */*",
    ...customHeaders,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  let res;
  try {
    res = await fetch(endpointUrl, { headers, signal: controller.signal });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error("مهلت زمان اتصال به وب‌سرویس به پایان رسید (Timeout 12s).");
    }
    throw new Error(`خطا در اتصال به وب‌سرویس: ${err.message}`);
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    throw new Error(`پاسخ وب‌سرویس با خطا مواجه شد (کد وضعیت HTTP: ${res.status})`);
  }

  const rawText = await res.text();
  let json;
  try {
    json = JSON.parse(rawText);
  } catch (e) {
    throw new Error("پاسخ وب‌سرویس در قالب معتبر JSON نیست.");
  }

  // Recursive search for candidate arrays
  const candidateArrays = [];

  function traverse(node, currentPath, depth) {
    if (depth > 4) return;
    if (Array.isArray(node)) {
      if (node.length > 0) {
        const keysSet = new Set();
        const sampleItems = node.slice(0, 5);
        for (const item of sampleItems) {
          if (item && typeof item === "object") {
            for (const k of Object.keys(item)) {
              keysSet.add(k);
            }
          }
        }
        candidateArrays.push({
          path: currentPath,
          length: node.length,
          sampleItem: node[0] && typeof node[0] === 'object' ? node[0] : null,
          sampleItems: sampleItems.filter(x => x && typeof x === 'object'),
          keys: Array.from(keysSet),
        });
      }
      return;
    }

    if (node && typeof node === "object") {
      for (const [key, val] of Object.entries(node)) {
        const nextPath = currentPath ? `${currentPath}.${key}` : key;
        traverse(val, nextPath, depth + 1);
      }
    }
  }

  traverse(json, "", 0);

  candidateArrays.sort((a, b) => {
    const aPriority = a.path === 'data' || a.path === '' || a.path === 'items' || a.path === 'result' ? 10 : 0;
    const bPriority = b.path === 'data' || b.path === '' || b.path === 'items' || b.path === 'result' ? 10 : 0;
    if (aPriority !== bPriority) return bPriority - aPriority;
    return b.length - a.length;
  });

  return {
    success: true,
    totalArraysFound: candidateArrays.length,
    candidateArrays,
    rawPreview: rawText.substring(0, 500),
  };
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
      let forexShowOnHome = true;
      if (forexSource.displayConfig) {
        try {
          const dc = typeof forexSource.displayConfig === 'string' ? JSON.parse(forexSource.displayConfig) : forexSource.displayConfig;
          if (dc && dc.showOnHomePage !== undefined) forexShowOnHome = Boolean(dc.showOnHomePage);
        } catch {}
      }
      let excluded = [];
      if (forexSource.excludedOutputs) {
        try {
          excluded = Array.isArray(forexSource.excludedOutputs)
            ? forexSource.excludedOutputs
            : JSON.parse(forexSource.excludedOutputs);
        } catch {}
      }
      const excludedSet = new Set(excluded.map(x => String(x).toUpperCase()));

      const multi = typeof forexSource.lastMultiData === 'string'
        ? JSON.parse(forexSource.lastMultiData)
        : forexSource.lastMultiData;
      if (multi && typeof multi === 'object') {
        for (const [k, val] of Object.entries(multi)) {
          if (Number(val) > 0 && !excludedSet.has(k.toUpperCase())) {
            result[k.toLowerCase()] = {
              price: Number(val),
              datetime: forexSource.lastFetched || new Date().toISOString(),
              label: `${forexSource.name} (${k.toUpperCase()})`,
              sourceId: forexSource.id,
              isPrimary: true,
              showOnHomePage: forexShowOnHome,
            };
          }
        }
      }
    } catch (e) {
      console.warn("Error parsing forex lastMultiData in compileLatestMarketRates:", e);
    }
  }

  // Tehran Stock Exchange (Bourse Equities):
  const bourseSource = sources.find(s => s.priceType === "bourse" && s.isActive);
  if (bourseSource) {
    let bourseShowOnHome = true;
    if (bourseSource.displayConfig) {
      try {
        const dc = typeof bourseSource.displayConfig === 'string' ? JSON.parse(bourseSource.displayConfig) : bourseSource.displayConfig;
        if (dc && dc.showOnHomePage !== undefined) bourseShowOnHome = Boolean(dc.showOnHomePage);
      } catch {}
    }
    result.bourse = {
      price: Number(bourseSource.lastPrice) || 0,
      datetime: bourseSource.lastFetched || new Date().toISOString(),
      label: bourseSource.name,
      sourceId: bourseSource.id,
      isPrimary: true,
      showOnHomePage: bourseShowOnHome,
    };
  }

  // Tehran Stock Exchange (Bourse Investment Funds):
  const bourseFundSource = sources.find(s => s.priceType === "bourse_fund" && s.isActive);
  if (bourseFundSource) {
    let fundShowOnHome = true;
    if (bourseFundSource.displayConfig) {
      try {
        const dc = typeof bourseFundSource.displayConfig === 'string' ? JSON.parse(bourseFundSource.displayConfig) : bourseFundSource.displayConfig;
        if (dc && dc.showOnHomePage !== undefined) fundShowOnHome = Boolean(dc.showOnHomePage);
      } catch {}
    }
    result.bourse_fund = {
      price: Number(bourseFundSource.lastPrice) || 0,
      datetime: bourseFundSource.lastFetched || new Date().toISOString(),
      label: bourseFundSource.name,
      sourceId: bourseFundSource.id,
      isPrimary: true,
      showOnHomePage: fundShowOnHome,
    };
  }

  // 2. Process single output price sources
  for (const pType of supportedTypes) {
    const candidates = sources.filter(s => s.priceType === pType && s.isActive);
    const chosen = candidates.find(s => s.isPrimary) || candidates[0];

    if (chosen) {
      const itemKey = pType === "usd" ? "usd_toman" : pType;
      let showOnHome = true;
      if (chosen.displayConfig) {
        try {
          const dc = typeof chosen.displayConfig === 'string' ? JSON.parse(chosen.displayConfig) : chosen.displayConfig;
          if (dc && dc.showOnHomePage !== undefined) {
            showOnHome = Boolean(dc.showOnHomePage);
          }
        } catch {}
      }

      result[itemKey] = {
        price: chosen.lastPrice,
        datetime: chosen.lastFetched || new Date().toISOString(),
        label: chosen.name,
        sourceId: chosen.id,
        isPrimary: !!chosen.isPrimary,
        showOnHomePage: showOnHome,
      };

      if (pType === "usd") {
        result.usd = result.usd_toman;
      }
    }
  }

  // Also include any other active custom single sources that aren't in supportedTypes
  for (const src of sources) {
    if (!src.isActive || Number(src.lastPrice) <= 0 || !src.priceType) continue;
    const lowerType = src.priceType.toLowerCase();
    if (result[src.priceType] || result[lowerType]) continue;
    let showOnHome = true;
    if (src.displayConfig) {
      try {
        const dc = typeof src.displayConfig === 'string' ? JSON.parse(src.displayConfig) : src.displayConfig;
        if (dc && dc.showOnHomePage !== undefined) {
          showOnHome = Boolean(dc.showOnHomePage);
        }
      } catch {}
    }
    result[lowerType] = {
      price: src.lastPrice,
      datetime: src.lastFetched || new Date().toISOString(),
      label: src.name,
      sourceId: src.id,
      isPrimary: !!src.isPrimary,
      showOnHomePage: showOnHome,
    };
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
          } else if ((src.priceType === "bourse" || src.priceType === "bourse_fund") && env.REALRATE_KV) {
            // Synchronize unified bourse symbols & funds in KV
            updates.push(
              fetchAndStoreBourseSymbols(env).catch(() => {})
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
 * Instantly recompile latest rates from DB active sources and update KV + memory cache.
 * Called immediately after any price source is created, updated, or deleted.
 * @param {object} env
 * @returns {Promise<object|null>}
 */
export async function refreshMarketRatesCache(env) {
  if (!env) return null;
  try {
    const sources = await dbGetPriceSources(env);
    if (Array.isArray(sources)) {
      const activeSources = sources.filter(s => s.isActive);
      const latestRates = compileLatestMarketRates(activeSources);
      if (env.REALRATE_KV) {
        try {
          await env.REALRATE_KV.put("latest_rates", JSON.stringify(latestRates));
        } catch (e) {
          console.warn("KV put error in refreshMarketRatesCache:", e.message);
        }
      }
      memoryPricesCache = { ...latestRates };
      lastFetchTime = Date.now();
      return latestRates;
    }
  } catch (e) {
    console.warn("refreshMarketRatesCache error:", e.message);
  }
  return null;
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
