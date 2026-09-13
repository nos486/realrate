/**
 * parsingUtils.js — Common Text, Regex, Digit Normalization, and Fetch Helpers
 */

import { logger } from "../../../lib/logger.js";

export const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Convert Persian and Arabic digits to ASCII digits
 * @param {string} str
 * @returns {string}
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
 * @param {string} input
 * @returns {{ type: 'channel'|'post', url: string, fallbackUrl?: string, channel: string, postId?: string }}
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
 * Extract number from text using regular expression
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
    logger.error("extractPriceWithRegex error:", { error: e.message });
    return null;
  }
}

/**
 * Extract nested values from a JSON object using dot/bracket notation (e.g. data.rates.USD or items[0].price)
 * @param {any} obj
 * @param {string} path
 * @param {boolean} [raw=false]
 * @returns {any}
 */
export function extractValueByPath(obj, path, raw = false) {
  if (obj === null || obj === undefined) return null;

  if (!path || !path.trim()) {
    if (raw) return obj;
    if (typeof obj === "number") return obj;
    if (typeof obj === "string") {
      const n = parseFloat(normalizeDigits(obj).replace(/,/g, ""));
      return isNaN(n) ? null : n;
    }
    if (typeof obj === "object" && obj !== null) {
      if (Array.isArray(obj)) return obj;
      for (const key of ["usd", "price", "rate", "usd_toman", "USD", "dollar", "value"]) {
        if (typeof obj[key] === "number") return obj[key];
        if (typeof obj[key] === "string") {
          const n = parseFloat(normalizeDigits(obj[key]).replace(/,/g, ""));
          if (!isNaN(n)) return n;
        }
      }
      return obj;
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

  if (curr === undefined) return null;
  if (raw) return curr;

  if (Array.isArray(curr) || (typeof curr === "object" && curr !== null)) {
    return curr;
  }

  if (typeof curr === "number") return curr;
  if (typeof curr === "string") {
    const parsed = parseFloat(normalizeDigits(curr).replace(/,/g, ""));
    return isNaN(parsed) ? null : parsed;
  }
  return curr;
}
