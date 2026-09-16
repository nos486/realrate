/**
 * emofidFund.source.adapter.js — Source Adapter for Emofid Investment Funds (e.g. Atieh Fund)
 *
 * Scrapes and parses fund NAV data directly from emofid.com Next.js Server-Side Rendered (SSR) pages.
 * Extracts both cancelNav (قیمت ابطال) and subscriptionNav (قیمت صدور) from the Next.js RSC payload
 * and HTML structure, converting Rials to Tomans for consistent valuation across RealRate.
 */

import { USER_AGENT } from "./parsingUtils.js";
import { logger } from "../../../lib/logger.js";

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
 * Parses fund details from emofid HTML content
 * @param {string} rawHtml
 * @param {object} [config]
 * @returns {object}
 */
export function parseEmofidFundHtml(rawHtml, config = {}) {
  const rawStr = String(rawHtml || "").trim();
  if (!rawStr) {
    throw new Error("محتوای صفحه صندوق مفید خالی است.");
  }

  let cancelNav = null;
  let subscriptionNav = null;
  let updatedOn = null;

  // 1. Primary Strategy: Extract from Next.js App Router streaming RSC payload
  // Targets cancelNav and subscriptionNav in JSON segments like \"cancelNav\":45022
  const rscCancelMatch = rawStr.match(/\\?"cancelNav\\?":\s*(\d+)/i);
  if (rscCancelMatch && rscCancelMatch[1]) {
    cancelNav = Number(rscCancelMatch[1]);
  }

  const rscSubMatch = rawStr.match(/\\?"subscriptionNav\\?":\s*(\d+)/i);
  if (rscSubMatch && rscSubMatch[1]) {
    subscriptionNav = Number(rscSubMatch[1]);
  }

  // Extract updatedOn date associated with the fund details block
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

  // Determine pricing unit (standard Iranian funds quote in Rials; RealRate uses Tomans by default)
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
  name: "صندوق سرمایه‌گذاری مفید (emofid.com)",

  supports(sourceConfig) {
    if (!sourceConfig) return false;
    const type = String(sourceConfig.sourceType || sourceConfig.source_type || "").toLowerCase().trim();
    if (type === "emofid_fund" || type === "emofid") return true;

    const endpoint = String(sourceConfig.endpoint || sourceConfig.apiUrl || "").toLowerCase();
    return endpoint.includes("emofid.com/funds/");
  },

  async fetchRaw(sourceConfig) {
    const url = String(sourceConfig.endpoint || sourceConfig.apiUrl || "").trim();
    if (!url) {
      throw new Error("آدرس صفحه صندوق مفید وارد نشده است.");
    }
    if (!/^https?:\/\//i.test(url)) {
      throw new Error("آدرس وب‌سایت باید با http:// یا https:// آغاز شود.");
    }

    const headers = {
      "User-Agent": USER_AGENT,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
    };

    let res;
    try {
      res = await fetch(url, { headers });
    } catch (err) {
      logger.error("Network error fetching emofid fund page", { url, error: err });
      throw new Error(`خطای ارتباط با سرور مفید (${err.message})`);
    }

    if (!res.ok) {
      throw new Error(`خطای پاسخ سرور مفید (کد وضعیت ${res.status} ${res.statusText})`);
    }

    return await res.text();
  },

  parse(rawContent, sourceConfig) {
    return parseEmofidFundHtml(rawContent, sourceConfig);
  },

  async test(sourceConfig, env = null) {
    try {
      const raw = await this.fetchRaw(sourceConfig, env);
      const parsed = this.parse(raw, sourceConfig);
      const rawSnippet = typeof raw === "string" && raw.length > 2500 ? raw.slice(0, 2500) + "\n... (ادامه متن کوتاه شد)" : raw;

      return {
        success: true,
        source_type: "emofid_fund",
        price: parsed.price,
        multiData: parsed.multiData,
        datetime: parsed.datetime,
        label: parsed.label,
        rawSnippet,
        message: `قیمت ابطال (NAV) با موفقیت دریافت شد: ${parsed.price.toLocaleString("fa-IR")} ${parsed.unit}` +
          (parsed.multiData?.updatedOn ? ` (بروزرسانی: ${parsed.multiData.updatedOn})` : ""),
      };
    } catch (e) {
      return { success: false, error: e.message || "خطا در تست سورس صندوق مفید" };
    }
  },
};
