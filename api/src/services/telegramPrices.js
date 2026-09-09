/**
 * telegramPrices.js — Fetch & parse live Iranian market prices from Telegram channels or external JSON APIs
 * Gold/Coin: @zarmagoldd | USD/Toman: Dynamic (Telegram channel or external API URL)
 * Throttled to 1 minute. Cached in KV + in-memory.
 */

import { getGlobalSettings } from "../lib/settings.js";
import { fetchAllPrices } from "./priceSources.js";

// Module-level in-memory cache
let tgCache = {};
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Convert Persian and Arabic digits to ASCII digits
 */
export function normalizeDigits(str) {
  if (!str) return "";
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  let res = String(str);
  for (let i = 0; i < 10; i++) {
    res = res.replaceAll(persianDigits[i], String(i)).replaceAll(arabicDigits[i], String(i));
  }
  return res;
}

/**
 * Resolve a Telegram username, full link, or specific post link into fetch target
 */
export function getTelegramFetchTarget(input) {
  if (!input || !input.trim()) {
    return {
      type: "channel",
      url: "https://t.me/s/tahran_sabza",
      channel: "tahran_sabza",
    };
  }

  const trimmed = input.trim();
  const postMatch = trimmed.match(/(?:https?:\/\/)?t\.me\/([a-zA-Z0-9_]+)\/(\d+)/i);
  if (postMatch) {
    const channel = postMatch[1];
    const postId = postMatch[2];
    return {
      type: "post",
      url: `https://t.me/${channel}/${postId}?embed=1`,
      fallbackUrl: `https://t.me/s/${channel}`,
      channel,
      postId,
    };
  }

  let channel = trimmed
    .replace(/^https?:\/\/(www\.)?t\.me\/(s\/)?/i, "")
    .replace(/^@/, "")
    .replace(/\/.*$/, "")
    .trim();

  if (!channel) channel = "tahran_sabza";

  return {
    type: "channel",
    url: `https://t.me/s/${channel}`,
    channel,
  };
}

/**
 * Extract nested values from a JSON object using dot/bracket notation (e.g. data.rates.USD or items[0].price)
 */
export function extractValueByPath(obj, path) {
  if (!path || !path.trim()) {
    if (typeof obj === "number") return obj;
    if (typeof obj === "string") {
      const n = parseFloat(normalizeDigits(obj).replace(/,/g, ""));
      return isNaN(n) ? null : n;
    }
    if (typeof obj === "object" && obj !== null) {
      for (const key of ["usd", "price", "rate", "usd_toman", "USD", "dollar", "value"]) {
        if (typeof obj[key] === "number") return obj[key];
        if (typeof obj[key] === "string") {
          const n = parseFloat(normalizeDigits(obj[key]).replace(/,/g, ""));
          if (!isNaN(n)) return n;
        }
      }
    }
    return null;
  }

  const cleanPath = path.trim().replace(/^(\$\.|\/)/, "");
  const parts = cleanPath.split(/\.|\//).map(p => p.trim()).filter(Boolean);
  let curr = obj;
  for (const part of parts) {
    if (curr === null || curr === undefined) return null;
    const arrayMatch = part.match(/^([a-zA-Z0-9_-]+)\[(\d+)\]$/);
    if (arrayMatch) {
      curr = curr[arrayMatch[1]];
      if (Array.isArray(curr)) {
        curr = curr[parseInt(arrayMatch[2], 10)];
      } else {
        return null;
      }
    } else if (Array.isArray(curr) && /^\d+$/.test(part)) {
      curr = curr[parseInt(part, 10)];
    } else {
      curr = curr[part];
    }
  }

  if (typeof curr === "number") return curr;
  if (typeof curr === "string") {
    const parsed = parseFloat(normalizeDigits(curr).replace(/,/g, ""));
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Fetch USD price from an external JSON API URL
 */
export async function fetchUsdFromApiUrl(url, jsonPath = "") {
  if (!url || !url.trim()) {
    throw new Error("آدرس URL وارد نشده است.");
  }

  const trimmedUrl = url.trim();
  if (!/^https?:\/\//i.test(trimmedUrl)) {
    throw new Error("آدرس URL باید با http:// یا https:// آغاز شود.");
  }

  const res = await fetch(trimmedUrl, {
    headers: {
      "User-Agent": UA,
      "Accept": "application/json, text/plain, */*",
    },
  });

  if (!res.ok) {
    throw new Error(`خطای سرور خارجی (کد ${res.status} ${res.statusText})`);
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const num = parseFloat(normalizeDigits(text).replace(/,/g, "").trim());
    if (!isNaN(num) && num > 0) {
      data = num;
    } else {
      throw new Error("پاسخ دریافتی از آدرس داده شده با فرمت معتبر JSON نیست.");
    }
  }

  const val = extractValueByPath(data, jsonPath);
  if (val === null || isNaN(val) || val <= 0) {
    throw new Error(
      jsonPath
        ? `مقدار معتبری در مسیر «${jsonPath}» از پاسخ JSON یافت نشد.`
        : "قیمت معتبری در پاسخ JSON یافت نشد. لطفاً مسیر JSON را مشخص نمایید."
    );
  }

  return {
    price: Math.round(val),
    datetime: new Date().toISOString(),
    label: "سورس خارجی API",
  };
}

/**
 * Parse USD/Toman price from Telegram channel HTML
 * @param {string} html
 * @param {string} [channelName=""]
 * @returns {{ price: number, datetime: string, label: string }|null}
 */
export function parseUsdTelegramHtml(html, channelName = "") {
  const messageBlocks = html.split(/<div class="tgme_widget_message\b/);

  for (let bIdx = messageBlocks.length - 1; bIdx >= 0; bIdx--) {
    const block = messageBlocks[bIdx];

    const timeMatch = block.match(/<time datetime="([^"]+)"/) || block.match(/datetime="([^"]+)"/);
    const datetime = timeMatch ? timeMatch[1] : null;

    const textMatch = block.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (!textMatch) continue;

    const rawText = normalizeDigits(textMatch[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim());

    const isDollarRelated = rawText.includes("دلار") || rawText.includes("USD");
    if (!isDollarRelated) continue;

    const lines = rawText.split("\n").map(l => l.trim()).filter(Boolean);

    for (const line of lines) {
      // Pattern 1: 228,000 فروش
      const m1 = line.match(/([\d,]{5,10})\s*فروش/);
      if (m1) {
        const num = parseInt(m1[1].replace(/,/g, ""), 10);
        if (num >= 10000 && num <= 2000000) {
          return { price: num, datetime, label: `دلار (${channelName || "تلگرام"})` };
        }
      }

      // Pattern 2: فروش : 228,000
      const m2 = line.match(/فروش\s*:\s*([\d,]{5,10})/);
      if (m2) {
        const num = parseInt(m2[1].replace(/,/g, ""), 10);
        if (num >= 10000 && num <= 2000000) {
          return { price: num, datetime, label: `دلار (${channelName || "تلگرام"})` };
        }
      }

      // Pattern 3: دلار ... : 228,000
      const m3 = line.match(/(?:دلار|USD)[^:\d]*[:\s\-–]+([\d,]{5,10})/);
      if (m3) {
        const num = parseInt(m3[1].replace(/,/g, ""), 10);
        if (num >= 10000 && num <= 2000000) {
          return { price: num, datetime, label: `دلار (${channelName || "تلگرام"})` };
        }
      }
    }

    // Fallback: If line has dollar/fardaye/naghdi and any 5-7 digit number
    for (const line of lines) {
      if (line.includes("دلار") || line.includes("فردایی") || line.includes("نقدی") || line.includes("سبزه") || line.includes("افشار")) {
        const numMatch = line.match(/(\d{2,3}[,\s]?\d{3})/);
        if (numMatch) {
          const num = parseInt(numMatch[1].replace(/[, \s]/g, ""), 10);
          if (num >= 20000 && num <= 2000000) {
            return { price: num, datetime, label: `دلار (${channelName || "تلگرام"})` };
          }
        }
      }
    }
  }

  return null;
}

/**
 * Fetch and parse USD price from Telegram channel or post embed
 */
export async function fetchUsdPriceFromTelegram(channelInput) {
  const target = getTelegramFetchTarget(channelInput);
  const res = await fetch(target.url, { headers: { "User-Agent": UA } }).catch(() => null);

  if (res && res.ok) {
    const html = await res.text();
    const parsed = parseUsdTelegramHtml(html, target.channel);
    if (parsed) return parsed;
  }

  // If was a single post and didn't find price, try channel preview
  if (target.type === "post" && target.fallbackUrl) {
    const fallbackRes = await fetch(target.fallbackUrl, { headers: { "User-Agent": UA } }).catch(() => null);
    if (fallbackRes && fallbackRes.ok) {
      const html = await fallbackRes.text();
      const parsed = parseUsdTelegramHtml(html, target.channel);
      if (parsed) return parsed;
    }
  }

  return null;
}

/**
 * Test a USD source configuration without saving
 * @param {object} config - { usd_source_type, usd_telegram_channel, usd_api_url, usd_api_json_path }
 */
export async function testUsdSource(config = {}) {
  const sourceType = config.usd_source_type === "api_url" ? "api_url" : "telegram";

  if (sourceType === "api_url") {
    if (!config.usd_api_url || !config.usd_api_url.trim()) {
      return { success: false, error: "لطفاً آدرس اینترنتی (URL) سورس API را وارد کنید." };
    }
    try {
      const result = await fetchUsdFromApiUrl(config.usd_api_url.trim(), config.usd_api_json_path);
      return {
        success: true,
        source_type: "api_url",
        price: result.price,
        datetime: result.datetime,
        label: result.label,
        message: `قیمت دلار با موفقیت دریافت شد: ${result.price.toLocaleString("fa-IR")} تومان`,
      };
    } catch (e) {
      return { success: false, error: e.message || "خطا در دریافت قیمت از API" };
    }
  } else {
    const channelInput = (config.usd_telegram_channel || "tahran_sabza").trim();
    try {
      const result = await fetchUsdPriceFromTelegram(channelInput);
      if (result && result.price) {
        return {
          success: true,
          source_type: "telegram",
          price: result.price,
          datetime: result.datetime,
          label: result.label,
          channel: channelInput,
          message: `قیمت دلار با موفقیت از کانال تلگرام «${channelInput}» خوانده شد: ${result.price.toLocaleString("fa-IR")} تومان`,
        };
      }
      return {
        success: false,
        error: `قیمت دلار در پیام‌های اخیر کانال یا پست «${channelInput}» یافت نشد. لطفاً نام کانال یا فرمت پیام را بررسی نمایید.`,
      };
    } catch (e) {
      return { success: false, error: e.message || "خطا در ارتباط با سرورهای تلگرام" };
    }
  }
}

/**
 * Fetch and cache market prices from Telegram channels or configured external source
 * @param {object} env
 * @param {boolean} [forceRefresh=false]
 * @param {object} [settings=null]
 * @returns {object} market prices object
 */
export async function fetchTelegramPrices(env, forceRefresh = false, settings = null) {
  // Delegate to unified priceSources service
  try {
    const unified = await fetchAllPrices(env, forceRefresh, settings);
    if (unified && (unified.usd_toman || unified.gold_18k)) {
      return unified;
    }
  } catch (err) {
    console.error("Unified fetchAllPrices delegation error:", err);
  }

  let stored = { ...tgCache };
  const nowMs = Date.now();

  if (env && env.REALRATE_KV) {
    try {
      const kvVal = await env.REALRATE_KV.get("tg_prices", "json");
      if (kvVal) stored = { ...stored, ...kvVal };
    } catch (e) {
      console.error("KV Read Error:", e);
    }
  }

  const lastCheckMs = stored.last_channel_check_time
    ? new Date(stored.last_channel_check_time).getTime()
    : 0;
  const isFresh = (nowMs - lastCheckMs) < 60000; // 1-minute throttle

  if (isFresh && !forceRefresh && Object.keys(stored).length > 1) {
    return stored;
  }

  // Load global settings if not provided
  let globalSettings = settings;
  if (!globalSettings && env) {
    try {
      globalSettings = await getGlobalSettings(env);
    } catch (e) {
      console.error("Error loading settings in telegramPrices:", e);
    }
  }

  try {
    // 1. Fetch Gold/Coin from Telegram (zarmagoldd)
    const goldPromise = fetch("https://t.me/s/zarmagoldd", { headers: { "User-Agent": UA } }).catch(() => null);

    // 2. Fetch USD based on configured source
    let usdPromise;
    const sourceType = globalSettings?.usd_source_type === "api_url" ? "api_url" : "telegram";

    if (sourceType === "api_url" && globalSettings?.usd_api_url) {
      usdPromise = fetchUsdFromApiUrl(globalSettings.usd_api_url, globalSettings.usd_api_json_path).catch(() => null);
    } else {
      const channel = globalSettings?.usd_telegram_channel || "tahran_sabza";
      usdPromise = fetchUsdPriceFromTelegram(channel).catch(() => null);
    }

    const [goldRes, parsedUsd] = await Promise.all([goldPromise, usdPromise]);

    if (goldRes && goldRes.ok) {
      const goldHtml = await goldRes.text();
      const parsedGold = parseGoldTelegramHtml(goldHtml);
      for (const [key, item] of Object.entries(parsedGold)) {
        if (item && item.price) {
          const existingItem = stored[key];
          stored[key] = (existingItem && existingItem.price === item.price)
            ? { ...item, datetime: existingItem.datetime || item.datetime }
            : item;
        }
      }
    }

    if (parsedUsd && parsedUsd.price) {
      const existingUsd = stored.usd_toman;
      stored.usd_toman = (existingUsd && existingUsd.price === parsedUsd.price)
        ? { price: existingUsd.price, datetime: existingUsd.datetime || parsedUsd.datetime, label: parsedUsd.label || "دلار نقدی تهران" }
        : { price: parsedUsd.price, datetime: parsedUsd.datetime || new Date().toISOString(), label: parsedUsd.label || "دلار نقدی تهران" };
    }

    stored.last_channel_check_time = new Date().toISOString();
    tgCache = { ...stored };

    if (env && env.REALRATE_KV) {
      try {
        await env.REALRATE_KV.put("tg_prices", JSON.stringify(stored));
      } catch (e) {
        console.error("KV Write Error:", e);
      }
    }
  } catch (err) {
    console.error("Market fetch error:", err);
  }

  return stored;
}

/**
 * Parse gold and coin prices from Telegram channel HTML
 * @param {string} html
 * @returns {object}
 */
export function parseGoldTelegramHtml(html) {
  const result = {};
  const messageBlocks = html.split(/<div class="tgme_widget_message\b/);

  for (let bIdx = messageBlocks.length - 1; bIdx >= 0; bIdx--) {
    const block = messageBlocks[bIdx];

    const timeMatch = block.match(/<time datetime="([^"]+)"/);
    const datetime = timeMatch ? timeMatch[1] : null;

    const textMatch = block.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (!textMatch) continue;

    const rawText = normalizeDigits(textMatch[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim());
    const lines = rawText.split("\n").map(l => l.trim()).filter(Boolean);

    const tryParse = (key, label, matcher) => {
      if (result[key]) return;
      for (let i = 0; i < lines.length; i++) {
        if (matcher(lines[i])) {
          const chunk = lines.slice(i, i + 3).join(" ");
          const saleMatch = chunk.match(/فروش:\s*([\d,]+)/);
          if (saleMatch) {
            const rawNum = parseInt(saleMatch[1].replace(/,/g, ""), 10);
            if (rawNum > 0) result[key] = { price: rawNum, datetime, label };
          }
        }
      }
    };

    tryParse("gold_18k",     "طلا ۱۸ عیار",              l => l.includes("گرم 18 عیار") || l.includes("18 عیار") || l.includes("۱۸ عیار"));
    tryParse("full_coin",    "سکه تمام ۸۶",               l => l.includes("سکه تمام 86") || l.includes("سکه تمام") || l.includes("تمام سکه") || l.includes("سکه امامی"));
    tryParse("mesghal",      "مثقال طلا (۱۷ عیار)",       l => l.includes("آبشده نقد") || l.includes("آبشده") || l.includes("مثقال"));
    tryParse("half_coin",    "نیم سکه بهار آزادی",        l => l.includes("نیم سکه"));
    tryParse("quarter_coin", "ربع سکه بهار آزادی",        l => l.includes("ربع سکه"));
  }

  return result;
}

