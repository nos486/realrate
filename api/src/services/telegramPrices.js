/**
 * telegramPrices.js — Backward-compatible wrapper for Telegram & USD Source functions
 * Extracted into market/sources/ adapters.
 */

import {
  normalizeDigits,
  getTelegramFetchTarget,
  extractValueByPath,
} from "./market/sources/parsingUtils.js";
import {
  telegramSourceAdapter,
  parseUsdTelegramHtml,
  parseGoldTelegramHtml,
} from "./market/sources/telegramSource.adapter.js";
import { apiUrlSourceAdapter } from "./market/sources/apiUrl.source.adapter.js";

export {
  normalizeDigits,
  getTelegramFetchTarget,
  extractValueByPath,
  parseUsdTelegramHtml,
  parseGoldTelegramHtml,
};

/**
 * Fetch USD price from an external JSON API URL
 */
export async function fetchUsdFromApiUrl(url, jsonPath = "") {
  const raw = await apiUrlSourceAdapter.fetchRaw({ apiUrl: url });
  const parsed = apiUrlSourceAdapter.parse(raw, { apiUrl: url, jsonPath, priceType: "usd" });
  return {
    price: parsed.price,
    datetime: parsed.datetime,
    label: parsed.label || "سورس خارجی API",
  };
}

/**
 * Fetch and parse USD price from Telegram channel or post embed
 */
export async function fetchUsdPriceFromTelegram(channelInput) {
  try {
    const raw = await telegramSourceAdapter.fetchRaw({ channelUsername: channelInput });
    return telegramSourceAdapter.parse(raw, { channelUsername: channelInput, priceType: "usd" });
  } catch {
    return null;
  }
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
