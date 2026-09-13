/**
 * telegramSource.adapter.js — Adapter for Telegram Channel and Post Price Feeds
 * Extracts market rates (USD, gold, coins, custom items) from public Telegram channels/posts.
 */

import {
  USER_AGENT,
  normalizeDigits,
  getTelegramFetchTarget,
  extractPriceWithRegex,
} from "./parsingUtils.js";
import { getCanonicalAssetName } from "../../../domain/specs/index.js";

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

    tryParse("gold_18k",     getCanonicalAssetName("gold_18k", "طلا ۱۸ عیار"),          l => l.includes("گرم 18 عیار") || l.includes("18 عیار") || l.includes("۱۸ عیار"));
    tryParse("full_coin",    getCanonicalAssetName("full_coin", "سکه تمام ۸۶"),           l => l.includes("سکه تمام 86") || l.includes("سکه تمام") || l.includes("تمام سکه") || l.includes("سکه امامی"));
    tryParse("mesghal",      getCanonicalAssetName("mesghal", "مثقال طلا (مظنه)"),   l => l.includes("آبشده نقد") || l.includes("آبشده") || l.includes("مثقال"));
    tryParse("half_coin",    getCanonicalAssetName("half_coin", "نیم سکه بهار آزادی"),    l => l.includes("نیم سکه"));
    tryParse("quarter_coin", getCanonicalAssetName("quarter_coin", "ربع سکه بهار آزادی"),    l => l.includes("ربع سکه"));
    tryParse("gerami_coin",  getCanonicalAssetName("gerami_coin", "سکه گرمی بانک مرکزی"), l => l.includes("سکه گرمی") || l.includes("سکه یک گرمی") || l.includes("گرمی بانکی"));
    if (result["gerami_coin"] && !result["bank_gram"]) {
      result["bank_gram"] = result["gerami_coin"];
    }
  }

  return result;
}

/**
 * Telegram Source Adapter Implementation
 * @type {import("./ISourceAdapter.js").SourceAdapter}
 */
export const telegramSourceAdapter = {
  id: "telegram",
  name: "کانال‌های تلگرام",

  supports(sourceConfig) {
    const type = sourceConfig.sourceType || sourceConfig.source_type;
    return type === "telegram" || (!type && Boolean(sourceConfig.channelUsername || sourceConfig.usd_telegram_channel));
  },

  async fetchRaw(sourceConfig) {
    const endpoint = sourceConfig.endpoint || sourceConfig.channelUsername || sourceConfig.usd_telegram_channel || "tahran_sabza";
    const target = getTelegramFetchTarget(endpoint);

    const res = await fetch(target.url, {
      headers: { "User-Agent": USER_AGENT },
    }).catch(() => null);

    if (res && res.ok) {
      return await res.text();
    }

    if (target.type === "post" && target.fallbackUrl) {
      const fallbackRes = await fetch(target.fallbackUrl, {
        headers: { "User-Agent": USER_AGENT },
      }).catch(() => null);
      if (fallbackRes && fallbackRes.ok) {
        return await fallbackRes.text();
      }
    }

    throw new Error(`امکان اتصال به کانال تلگرام «${target.channel || endpoint}» وجود ندارد.`);
  },

  parse(rawContent, sourceConfig) {
    const endpoint = sourceConfig.endpoint || sourceConfig.channelUsername || sourceConfig.usd_telegram_channel || "tahran_sabza";
    const target = getTelegramFetchTarget(endpoint);
    const regex = (sourceConfig.regex || sourceConfig.regexPattern || "").trim();
    const priceType = (sourceConfig.priceType || sourceConfig.price_type || "usd").toLowerCase();
    const nowIso = new Date().toISOString();
    const html = String(rawContent || "");

    // 1. If custom regex is specified, search telegram message blocks
    if (regex) {
      const messageBlocks = html.split(/<div class="tgme_widget_message\b/);

      for (let bIdx = messageBlocks.length - 1; bIdx >= 0; bIdx--) {
        const block = messageBlocks[bIdx];
        const timeMatch = block.match(/<time datetime="([^"]+)"/) || block.match(/datetime="([^"]+)"/);
        const datetime = timeMatch ? timeMatch[1] : nowIso;

        const textMatch = block.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
        if (!textMatch) continue;

        const rawText = normalizeDigits(textMatch[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim());
        const parsedNum = extractPriceWithRegex(rawText, regex);

        if (parsedNum && parsedNum > 0) {
          const isUsdAsset = priceType === "ons_gold" || priceType === "ons_silver";
          return {
            price: isUsdAsset ? Math.round(parsedNum * 100) / 100 : Math.round(parsedNum),
            datetime,
            label: sourceConfig.name || target.channel,
          };
        }
      }

      throw new Error(`قیمتی با الگوی ریجکس «${regex}» در پیام‌های اخیر کانال یافت نشد.`);
    }

    // 2. Built-in smart parsers
    if (priceType === "usd") {
      const parsedUsd = parseUsdTelegramHtml(html, target.channel);
      if (parsedUsd && parsedUsd.price) {
        return {
          price: parsedUsd.price,
          datetime: parsedUsd.datetime || nowIso,
          label: sourceConfig.name || parsedUsd.label,
        };
      }
      throw new Error(`قیمت دلار در پیام‌های اخیر کانال «${target.channel}» یافت نشد.`);
    }

    // Gold or coin price types
    const parsedGold = parseGoldTelegramHtml(html);
    const matchedItem = parsedGold[priceType];
    if (matchedItem && matchedItem.price) {
      return {
        price: matchedItem.price,
        datetime: matchedItem.datetime || nowIso,
        label: sourceConfig.name || matchedItem.label,
      };
    }

    throw new Error(`قیمت ${priceType} در پیام‌های کانال «${target.channel}» یافت نشد.`);
  },

  async test(sourceConfig) {
    const endpoint = (sourceConfig.endpoint || sourceConfig.channelUsername || sourceConfig.usd_telegram_channel || "tahran_sabza").trim();
    if (!endpoint) {
      return { success: false, error: "لطفاً نام یا لینک کانال تلگرام را وارد کنید." };
    }

    try {
      const raw = await this.fetchRaw(sourceConfig);
      const parsed = this.parse(raw, sourceConfig);
      const rawSnippet = raw && raw.length > 2500 ? raw.slice(0, 2500) + "\n... (ادامه متن کوتاه شد)" : raw;

      return {
        success: true,
        source_type: "telegram",
        price: parsed.price,
        datetime: parsed.datetime,
        label: parsed.label,
        channel: endpoint,
        rawSnippet,
        message: `قیمت با موفقیت از کانال تلگرام «${endpoint}» خوانده شد: ${parsed.price.toLocaleString("fa-IR")}`,
      };
    } catch (e) {
      return { success: false, error: e.message || "خطا در ارتباط با سرورهای تلگرام" };
    }
  },
};
