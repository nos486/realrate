/**
 * emofidFund.source.adapter.js — Source Adapter for Emofid Investment Funds
 *
 * Supports BOTH:
 * 1. Multi-Output Mode: Fetches ALL 19 Emofid funds (پیشتاز، پیشرو، عیار، آتیه، آوند و...)
 *    in a SINGLE HTTP request via the official https://www.emofid.com/api/funds/ endpoint.
 * 2. Single Fund Mode: Extracts a specific fund (e.g. آتیه) from the unified API or falls back
 *    to SSR HTML parsing of the fund's dedicated page.
 */

import { USER_AGENT } from "./parsingUtils.js";
import { logger } from "../../../lib/logger.js";

export const EMOFID_API_FUNDS_ENDPOINT = "https://www.emofid.com/api/funds/";

/**
 * Converts Persian/Arabic digits to ASCII digits
 * @param {string} str
 * @returns {string}
 */
export function persianToEnglishDigits(str) {
  if (!str) return "";
  return String(str)
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
}

/**
 * Normalizes a single fund item from emofid API JSON object
 * @param {object} f
 * @param {object} [config]
 * @returns {object}
 */
export function normalizeEmofidFundItem(f, config = {}) {
  const isRial = (config.priceUnit === "rial" || config.unit === "rial");
  const cancelNavRial = Number(f.cancelNav || f.subscriptionNav || 0);
  const subscriptionNavRial = Number(f.subscriptionNav || f.cancelNav || 0);

  const priceToman = Math.round(cancelNavRial / 10);
  const subscriptionPriceToman = Math.round(subscriptionNavRial / 10);

  const primaryPrice = isRial ? cancelNavRial : priceToman;

  return {
    id: f.id,
    s: f.enTitle || f.key || String(f.id),
    symbol: f.enTitle || f.key || String(f.id),
    enTitle: f.enTitle,
    n: f.title,
    name: f.title,
    fullTitle: f.fullTitle || f.title,
    p: primaryPrice,
    price: primaryPrice,
    priceToman,
    priceRial: cancelNavRial,
    subscriptionPriceToman,
    subscriptionPriceRial: subscriptionNavRial,
    unit: isRial ? "ریال" : "تومان",
    type: f.type || "صدور ابطالی",
    fundType: f.fundType || "",
    updatedOn: f.updatedOn || null,
    isin: f.isin || null,
    code: f.code || null,
    aum: f.aum || null,
    investorsNumber: f.investorsNumber || null,
    returns: f.returns || null,
  };
}

/**
 * Parses raw JSON payload from emofid API endpoint (https://www.emofid.com/api/funds/)
 * @param {object|string} rawJson
 * @param {object} [config]
 * @returns {object}
 */
export function parseEmofidApiFundsJson(rawJson, config = {}) {
  let data = rawJson;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      throw new Error("پاسخ وب‌سرویس صندوق‌های مفید JSON معتبر نیست.");
    }
  }

  const rawList = Array.isArray(data)
    ? data
    : (data?.value || data?.data || data?.funds || data?.items || []);

  if (!Array.isArray(rawList) || rawList.length === 0) {
    throw new Error("آرایه اطلاعات صندوق‌ها در پاسخ وب‌سرویس مفید یافت نشد.");
  }

  const nowIso = new Date().toISOString();

  // If a specific fund is targeted (e.g. fundKey: 'atieh' or endpoint: '/funds/atieh/')
  const targetKey = config.fundKey || extractFundKeyFromUrl(config.endpoint);
  if (targetKey && config.category !== "multi_output" && config.priceType !== "emofid_funds") {
    const keyLower = String(targetKey).toLowerCase();
    const found = rawList.find(
      (it) =>
        String(it.enTitle || "").toLowerCase() === keyLower ||
        String(it.title || "").includes(targetKey) ||
        String(it.code || "") === targetKey ||
        String(it.key || "") === targetKey
    );

    if (found) {
      const item = normalizeEmofidFundItem(found, config);
      return {
        price: item.price,
        priceToman: item.priceToman,
        priceRial: item.priceRial,
        subscriptionPriceToman: item.subscriptionPriceToman,
        subscriptionPriceRial: item.subscriptionPriceRial,
        unit: item.unit,
        updatedOn: item.updatedOn,
        datetime: nowIso,
        label: config.name || item.fullTitle || item.name,
        multiData: {
          cancelNavRial: item.priceRial,
          cancelNavToman: item.priceToman,
          subscriptionNavRial: item.subscriptionPriceRial,
          subscriptionNavToman: item.subscriptionPriceToman,
          updatedOn: item.updatedOn,
          unit: item.unit,
          type: item.type,
        },
      };
    }
  }

  // Multi-Output Mode: All funds in one consolidated payload
  const compactList = [];
  const multiData = {};

  for (const f of rawList) {
    if (!f || typeof f !== "object") continue;
    const item = normalizeEmofidFundItem(f, config);
    compactList.push(item);
    if (item.enTitle) {
      multiData[item.enTitle] = item.price;
    }
  }

  return {
    price: compactList.length,
    datetime: nowIso,
    label: config.name || "صندوق‌های سرمایه‌گذاری مفید",
    isCatalog: true,
    totalCount: compactList.length,
    compactList,
    sampleItems: compactList.slice(0, 30),
    multiData,
  };
}

/**
 * Extracts fund slug from a URL like https://www.emofid.com/funds/atieh/
 * @param {string} url
 * @returns {string|null}
 */
export function extractFundKeyFromUrl(url) {
  if (!url || typeof url !== "string") return null;
  const m = url.match(/\/funds\/([a-zA-Z0-9_\-]+)\/?$/i);
  if (m && m[1] && m[1].toLowerCase() !== "funds") {
    return m[1].toLowerCase();
  }
  return null;
}

/**
 * Parses fund details from emofid HTML content (Fallback for SSR pages)
 * @param {string} rawHtml
 * @param {object} [config]
 * @returns {object}
 */
export function parseEmofidFundHtml(rawHtml, config = {}) {
  const rawStr = String(rawHtml || "").trim();
  if (!rawStr) {
    throw new Error("محتوای صفحه صندوق مفید خالی است.");
  }

  // If the content is actually JSON from /api/funds/
  if (rawStr.startsWith("{") || rawStr.startsWith("[")) {
    try {
      return parseEmofidApiFundsJson(rawStr, config);
    } catch {
      // Continue to HTML parsing fallback
    }
  }

  let cancelNav = null;
  let subscriptionNav = null;
  let updatedOn = null;

  // 1. Primary Strategy: Extract from Next.js App Router streaming RSC payload
  const rscCancelMatch = rawStr.match(/\\?"cancelNav\\?":\s*(\d+)/i);
  if (rscCancelMatch && rscCancelMatch[1]) {
    cancelNav = Number(rscCancelMatch[1]);
  }

  const rscSubMatch = rawStr.match(/\\?"subscriptionNav\\?":\s*(\d+)/i);
  if (rscSubMatch && rscSubMatch[1]) {
    subscriptionNav = Number(rscSubMatch[1]);
  }

  const rscDateMatch = rawStr.match(/\\?"cancelNav\\?":\s*\d+[\s\S]{1,600}?\\?"updatedOn\\?":\s*\\?"([^\\"]+)\\?"/i);
  if (rscDateMatch && rscDateMatch[1]) {
    updatedOn = rscDateMatch[1].trim();
  }

  // 2. Secondary Strategy: Fallback to rendered HTML markup elements
  if (!cancelNav || isNaN(cancelNav)) {
    const htmlCancelMatch = rawStr.match(/قیمت ابطال[\s\S]{1,160}?>([۰-۹0-9,،\u066C\s]+)\s*ریال/i);
    if (htmlCancelMatch && htmlCancelMatch[1]) {
      const cleanNum = persianToEnglishDigits(htmlCancelMatch[1]).replace(/[,،\u066C\s]/g, "");
      if (cleanNum && !isNaN(cleanNum)) {
        cancelNav = Number(cleanNum);
      }
    }
  }

  if (!subscriptionNav || isNaN(subscriptionNav)) {
    const htmlSubMatch = rawStr.match(/قیمت صدور[\s\S]{1,160}?>([۰-۹0-9,،\u066C\s]+)\s*ریال/i);
    if (htmlSubMatch && htmlSubMatch[1]) {
      const cleanNum = persianToEnglishDigits(htmlSubMatch[1]).replace(/[,،\u066C\s]/g, "");
      if (cleanNum && !isNaN(cleanNum)) {
        subscriptionNav = Number(cleanNum);
      }
    }
  }

  if (!cancelNav || isNaN(cancelNav) || cancelNav <= 0) {
    logger.warn("Failed to extract cancelNav from emofid fund HTML", {
      url: config.endpoint || "emofid.com",
      snippet: rawStr.slice(0, 1000),
    });
    throw new Error("امکان استخراج قیمت ابطال (NAV) از صفحه صندوق آتیه مفید وجود ندارد. ساختار صفحه ممکن است تغییر کرده باشد.");
  }

  const isRial = (config.priceUnit === "rial" || config.unit === "rial");
  const priceRial = cancelNav;
  const priceToman = Math.round(cancelNav / 10);
  const primaryPrice = isRial ? priceRial : priceToman;

  const nowIso = new Date().toISOString();
  const fundLabel = config.name || "صندوق آتیه مفید";

  return {
    price: primaryPrice,
    priceToman,
    priceRial,
    subscriptionPriceToman: subscriptionNav ? Math.round(subscriptionNav / 10) : null,
    subscriptionPriceRial: subscriptionNav || null,
    unit: isRial ? "ریال" : "تومان",
    updatedOn: updatedOn || null,
    datetime: nowIso,
    label: fundLabel,
    multiData: {
      cancelNavRial: priceRial,
      cancelNavToman: priceToman,
      subscriptionNavRial: subscriptionNav || null,
      subscriptionNavToman: subscriptionNav ? Math.round(subscriptionNav / 10) : null,
      updatedOn: updatedOn || null,
      unit: isRial ? "ریال" : "تومان",
    },
  };
}

/**
 * Emofid Fund Source Adapter Implementation
 * @type {import("./ISourceAdapter.js").SourceAdapter}
 */
export const emofidFundSourceAdapter = {
  id: "emofid_fund",
  name: "صندوق‌های سرمایه‌گذاری مفید (emofid.com)",

  supports(sourceConfig) {
    if (!sourceConfig) return false;
    const type = String(sourceConfig.sourceType || sourceConfig.source_type || "").toLowerCase().trim();
    if (type === "emofid_fund" || type === "emofid" || type === "emofid_funds") return true;

    const endpoint = String(sourceConfig.endpoint || sourceConfig.apiUrl || "").toLowerCase();
    return endpoint.includes("emofid.com/funds/") || endpoint.includes("emofid.com/api/funds");
  },

  async fetchRaw(sourceConfig) {
    let url = String(sourceConfig.endpoint || sourceConfig.apiUrl || "").trim();

    // If multi-output mode or no specific page specified, default to fast JSON API
    if (!url || sourceConfig.category === "multi_output" || sourceConfig.priceType === "emofid_funds") {
      url = EMOFID_API_FUNDS_ENDPOINT;
    }

    if (!/^https?:\/\//i.test(url)) {
      throw new Error("آدرس وب‌سایت باید با http:// یا https:// آغاز شود.");
    }

    const isJsonApi = url.includes("/api/funds");
    const headers = {
      "User-Agent": USER_AGENT,
      "Accept": isJsonApi
        ? "application/json, text/plain, */*"
        : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
    };

    let res;
    try {
      res = await fetch(url, { headers });
    } catch (err) {
      logger.error("Network error fetching emofid endpoint", { url, error: err });
      throw new Error(`خطای ارتباط با سرور مفید (${err.message})`);
    }

    if (!res.ok) {
      throw new Error(`خطای پاسخ سرور مفید (کد وضعیت ${res.status} ${res.statusText})`);
    }

    return await res.text();
  },

  parse(rawContent, sourceConfig) {
    const rawStr = String(rawContent || "").trim();
    if (rawStr.startsWith("{") || rawStr.startsWith("[")) {
      return parseEmofidApiFundsJson(rawStr, sourceConfig);
    }
    return parseEmofidFundHtml(rawContent, sourceConfig);
  },

  async test(sourceConfig, env = null) {
    try {
      const raw = await this.fetchRaw(sourceConfig, env);
      const parsed = this.parse(raw, sourceConfig);
      const rawSnippet = typeof raw === "string" && raw.length > 2500 ? raw.slice(0, 2500) + "\n... (ادامه متن کوتاه شد)" : raw;

      const isMulti = parsed.isCatalog || Array.isArray(parsed.compactList);

      return {
        success: true,
        source_type: "emofid_fund",
        price: parsed.price,
        multiData: parsed.multiData,
        compactList: parsed.compactList,
        sampleItems: parsed.sampleItems,
        datetime: parsed.datetime,
        label: parsed.label,
        rawSnippet,
        message: isMulti
          ? `تعداد ${parsed.price.toLocaleString("fa-IR")} صندوق سرمایه‌گذاری با موفقیت دریافت و پردازش شد.`
          : `قیمت ابطال (NAV) با موفقیت دریافت شد: ${parsed.price.toLocaleString("fa-IR")} ${parsed.unit}` +
            (parsed.multiData?.updatedOn ? ` (بروزرسانی: ${parsed.multiData.updatedOn})` : ""),
      };
    } catch (e) {
      return { success: false, error: e.message || "خطا در تست سورس صندوق‌های مفید" };
    }
  },
};
