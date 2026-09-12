/**
 * priceSources.js — Unified Price Sources Service
 * Supports multiple Telegram channels and JSON API feeds with custom regex,
 * configurable fetch intervals, primary source routing, and live testing.
 */

import {
  dbGetPriceSources,
  dbUpdateSourceLastPrice,
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

export const PROMINENT_FOREX_CURRENCIES = [
  { code: 'EUR', name: 'یورو اروپا' },
  { code: 'GBP', name: 'پوند انگلیس' },
  { code: 'AED', name: 'درهم امارات' },
  { code: 'TRY', name: 'لیر ترکیه' },
  { code: 'CHF', name: 'فرانک سوئیس' },
  { code: 'CAD', name: 'دلار کانادا' },
  { code: 'AUD', name: 'دلار استرالیا' },
  { code: 'CNY', name: 'یوان چین' },
  { code: 'JPY', name: 'ین ژاپن' },
  { code: 'SAR', name: 'ریال عربستان' },
  { code: 'QAR', name: 'ریال قطر' },
  { code: 'KWD', name: 'دینار کویت' },
  { code: 'OMR', name: 'ریال عمان' },
  { code: 'BHD', name: 'دینار بحرین' },
  { code: 'IQD', name: 'دینار عراق' },
  { code: 'RUB', name: 'روبل روسیه' },
  { code: 'AFN', name: 'افغانی افغانستان' },
  { code: 'AZN', name: 'منات آذربایجان' },
  { code: 'INR', name: 'روپیه هند' },
  { code: 'SEK', name: 'کرون سوئد' },
  { code: 'NOK', name: 'کرون نروژ' },
  { code: 'SGD', name: 'دلار سنگاپور' },
  { code: 'KRW', name: 'وون کره جنوبی' },
  { code: 'BRL', name: 'رئال برزیل' },
];

export const WORLD_FOREX_NAMES = {
  USD: 'دلار آمریکا',
  EUR: 'یورو اروپا',
  GBP: 'پوند انگلیس',
  AED: 'درهم امارات',
  TRY: 'لیر ترکیه',
  CHF: 'فرانک سوئیس',
  CAD: 'دلار کانادا',
  AUD: 'دلار استرالیا',
  CNY: 'یوان چین',
  JPY: 'ین ژاپن',
  KWD: 'دینار کویت',
  SAR: 'ریال عربستان',
  QAR: 'ریال قطر',
  OMR: 'ریال عمان',
  BHD: 'دینار بحرین',
  IQD: 'دینار عراق',
  RUB: 'روبل روسیه',
  INR: 'روپیه هند',
  PKR: 'روپیه پاکستان',
  AFN: 'افغانی افغانستان',
  SEK: 'کرون سوئد',
  NOK: 'کرون نروژ',
  DKK: 'کرون دانمارک',
  SGD: 'دلار سنگاپور',
  HKD: 'دلار هنگ‌کنگ',
  KRW: 'وون کره جنوبی',
  THB: 'بات تایلند',
  MYR: 'رینگیت مالزی',
  NZD: 'دلار نیوزیلند',
  BRL: 'رئال برزیل',
  ZAR: 'رند آفریقای جنوبی',
  AZN: 'منات آذربایجان',
  GEL: 'لاری گرجستان',
  AMD: 'درام ارمنستان',
  TMT: 'منات ترکمنستان',
  TJS: 'سامانی تاجیکستان',
  KZT: 'تنگه قزاقستان',
  UZS: 'سوم ازبکستان',
  EGP: 'پوند مصر',
  SYP: 'لیر سوریه',
  LBP: 'لیر لبنان',
  JOD: 'دینار اردن',
  IDR: 'روپیه اندونزی',
  PHP: 'پزو فیلیپین',
  VND: 'دانگ ویتنام',
  MXN: 'پزو مکزیک',
  PLN: 'زلوتی لهستان',
  CZK: 'کرونا چک',
  HUF: 'فورینت مجارستان',
  ILS: 'شکل اسرائیل',
  CLP: 'پزو شیلی',
  COP: 'پزو کلمبیا',
  PEN: 'سول پرو',
  ARS: 'پزو آرژانتین',
  BGN: 'لو بلغارستان',
  RON: 'لئو رومانی',
  ISK: 'کرون ایسلند',
  HRK: 'کونا کرواسی',
  RSD: 'دینار صربستان',
  LYD: 'دینار لیبی',
  TND: 'دینار تونس',
  MAD: 'درهم مراکش',
  DZD: 'دینار الجزایر',
  USDT: 'تتر (USDT)',
};

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
  // Currencies typically stronger than USD (EUR, GBP, CHF, KWD, BHD, OMR, JOD)
  if (['eur', 'gbp', 'chf', 'kwd', 'bhd', 'omr', 'jod', 'kyd', 'gip'].includes(p)) {
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
      } catch { }
    } else if (source.field_mapping) {
      try {
        fieldMapping = typeof source.field_mapping === "string" ? JSON.parse(source.field_mapping) : source.field_mapping;
      } catch { }
    }

    // Multi-output detection: explicit forex, bourse, category multi_output, or fieldMapping
    const isForex = source.priceType === "forex" || (source.endpoint && source.endpoint.includes("open.er-api.com"));
    const isBourse = source.priceType === "bourse" || source.priceType === "bourse_fund" || (source.endpoint && source.endpoint.includes("AllSymbols.php"));

    // 1. Forex Direct Processing (Prominent Currencies relative to USD from open.er-api.com)
    if (isForex) {
      const rates = (data && data.rates && typeof data.rates === "object") ? data.rates : data;
      if (!rates || typeof rates !== "object") {
        throw new Error("بخش نرخ‌های ارز (rates) در پاسخ وب‌سرویس یافت نشد.");
      }

      const multiData = {};
      const compactList = [];
      const currencyList = [];

      for (const cur of PROMINENT_FOREX_CURRENCIES) {
        const rawRate = Number(rates[cur.code]);
        if (!rawRate || isNaN(rawRate) || rawRate <= 0) continue;

        // Relative to USD: 1 / rate
        const usdCross = parseFloat((1 / rawRate).toFixed(5));
        multiData[cur.code.toLowerCase()] = usdCross;

        compactList.push({
          s: cur.code,
          n: `${cur.name} (${cur.code})`,
          p: usdCross,
        });

        currencyList.push({
          key: cur.code.toLowerCase(),
          code: cur.code,
          label: cur.name,
          rawRate,
          usdCrossRate: usdCross,
          price: usdCross,
        });
      }

      if (compactList.length === 0) {
        throw new Error("هیچ یک از ارزهای مطرح در پاسخ وب‌سرویس یافت نشد.");
      }

      return {
        price: compactList.length,
        multiData,
        currencyList,
        compactList,
        sampleItems: compactList.slice(0, 30),
        datetime: nowIso,
        label: source.name || "ارزهای جهانی (فارکس)",
      };
    }

    // 2. Bourse Direct Processing (Strictly Symbol l18, Name l30, Price pl / 10 in Tomans)
    if (isBourse) {
      let rawArray = Array.isArray(data) ? data : (data.symbols || data.data || []);
      if (!Array.isArray(rawArray) || rawArray.length === 0) {
        throw new Error("آرایه نمادهای بورس در پاسخ وب‌سرویس یافت نشد.");
      }

      const compactList = [];
      for (const item of rawArray) {
        if (!item || typeof item !== "object") continue;
        const sym = (item.l18 || item.symbol || "").trim();
        const name = (item.l30 || item.name || sym).trim();
        if (!sym || !name) continue;

        let rawPrice = Number(item.pl);
        if (!rawPrice || isNaN(rawPrice) || rawPrice <= 0) {
          rawPrice = Number(item.pc) || 0;
        }
        if (rawPrice <= 0) continue;

        // Price in Tomans (pl / 10)
        const priceToman = Math.round(rawPrice / 10);

        compactList.push({
          s: sym,
          n: name,
          p: priceToman,
        });
      }

      if (compactList.length === 0) {
        throw new Error("هیچ نماد معتبری با قیمت در پاسخ بورس یافت نشد.");
      }

      return {
        price: compactList.length,
        multiData: {
          totalSymbols: compactList.length,
          updatedAt: nowIso,
        },
        compactList,
        sampleItems: compactList.slice(0, 30),
        sampleSymbols: compactList.slice(0, 10).map(x => x.s),
        datetime: nowIso,
        label: source.name || "بورس اوراق بهادار تهران",
      };
    }

    // 3. Fallback for other Multi-Output Array feeds
    if (source.category === "multi_output" || (fieldMapping && (fieldMapping.isMultiOutput || fieldMapping.symbolField))) {
      let rawArray = Array.isArray(data) ? data : (data.data || data.items || data.symbols || []);
      if (Array.isArray(rawArray) && rawArray.length > 0) {
        const symKey = fieldMapping?.symbolField || "symbol";
        const nameKey = fieldMapping?.nameField || "name";
        const priceKey = fieldMapping?.priceField || "price";
        const multiplier = Number(fieldMapping?.multiplier) > 0 ? Number(fieldMapping.multiplier) : 1;

        const compactList = [];
        for (const item of rawArray) {
          if (!item || typeof item !== "object") continue;
          const sym = String(item[symKey] || "").trim();
          const name = String(item[nameKey] || sym).trim();
          const price = Number(item[priceKey]) || 0;
          if ((!sym && !name) || price <= 0) continue;

          compactList.push({
            s: sym || name,
            n: name,
            p: Math.round(price * multiplier),
          });
        }

        if (compactList.length > 0) {
          return {
            price: compactList.length,
            multiData: { total: compactList.length },
            compactList,
            sampleItems: compactList.slice(0, 30),
            datetime: nowIso,
            label: source.name || "فید چند خروجی",
          };
        }
      }
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
    const isForexSingle = ['eur', 'try', 'aed', 'gbp', 'chf', 'cad', 'aud', 'cny'].includes((source.priceType || '').toLowerCase());
    let finalPrice;
    if (isForexSingle) {
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
      {
        sourceType,
        priceType,
        endpoint: endpoint.trim(),
        regex,
        jsonPath,
        fieldMapping,
        name,
        excludedOutputs: config.excludedOutputs || config.excluded_outputs || [],
        includedOutputs: config.includedOutputs || config.included_outputs || [],
      },
      raw
    );

    const isForex = ['eur', 'try', 'aed', 'gbp', 'chf', 'cad', 'aud', 'cny'].includes((priceType || '').toLowerCase());
    let displayMsg = '';
    if (priceType === 'forex' || parsed.currencyList) {
      const keys = parsed.multiData ? Object.keys(parsed.multiData).map(k => k.toUpperCase()).join('، ') : '';
      displayMsg = `فید چند خروجی با موفقیت تست شد (${parsed.price} آیتم استخراج شد: ${keys.slice(0, 80)}${keys.length > 80 ? '...' : ''})`;
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
      sampleItems: parsed.compactList ? parsed.compactList.slice(0, 30) : null,
      compactList: parsed.compactList || null,
      currencyList: parsed.currencyList || null,
      labels: parsed.labels || null,
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
      const entries = Object.entries(node);
      const isRateDict = entries.length >= 3 && entries.every(([k, v]) => typeof v === 'number' || (typeof v === 'string' && !isNaN(Number(v))));
      if (isRateDict) {
        const allItems = entries.slice(0, 500).map(([k, v]) => {
          const sym = k.toUpperCase();
          return {
            key: k,
            code: sym,
            name: WORLD_FOREX_NAMES[sym] || sym,
            rate: Number(v),
            price: Number(v),
          };
        });
        candidateArrays.push({
          path: currentPath,
          length: entries.length,
          sampleItem: allItems[0] || null,
          sampleItems: allItems.slice(0, 20),
          allItems,
          keys: ['symbol', 'code', 'name', 'rate', 'price'],
          isKeyValDictionary: true,
        });
      }

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
        } catch { }
      }
      let excluded = [];
      if (forexSource.excludedOutputs) {
        try {
          excluded = Array.isArray(forexSource.excludedOutputs)
            ? forexSource.excludedOutputs
            : JSON.parse(forexSource.excludedOutputs);
        } catch { }
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
      } catch { }
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
      } catch { }
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
        } catch { }
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
      } catch { }
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

          // Synchronize unified bourse symbols & funds in KV if needed
          if ((src.priceType === "bourse" || src.priceType === "bourse_fund") && env.REALRATE_KV) {
            updates.push(
              fetchAndStoreBourseSymbols(env).catch(() => { })
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
              ).catch(() => { })
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
