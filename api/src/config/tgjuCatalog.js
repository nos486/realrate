/**
 * tgjuCatalog.js — tgju.org series offered for backfilling the price history
 *
 * Each entry is a tgju indicator (the last part of its page address, tgju.org/profile/<slug>)
 * with the unit its numbers are in (`rial`, `toman`, or `usd` — a dollar price, turned into
 * tomans with each day's dollar from our own history) and the price book id it usually maps to.
 * It is a starting list: any other slug can be mapped by hand, and every series is previewed and
 * checked against the item's live price before anything is written.
 */

/** @type {Array<{ slug: string, label: string, group: string, unit: 'rial'|'toman'|'usd', suggest?: string }>} */
export const TGJU_CATALOG = [
  // Currencies (free market, rials)
  { slug: "price_dollar_rl", label: "دلار آزاد", group: "ارز", unit: "rial", suggest: "usd" },
  { slug: "price_eur", label: "یورو", group: "ارز", unit: "rial", suggest: "eur" },
  { slug: "price_gbp", label: "پوند انگلیس", group: "ارز", unit: "rial", suggest: "gbp" },
  { slug: "price_aed", label: "درهم امارات", group: "ارز", unit: "rial", suggest: "aed" },
  { slug: "price_try", label: "لیر ترکیه", group: "ارز", unit: "rial", suggest: "try" },
  { slug: "price_cny", label: "یوان چین", group: "ارز", unit: "rial", suggest: "cny" },
  { slug: "price_chf", label: "فرانک سوئیس", group: "ارز", unit: "rial", suggest: "chf" },
  { slug: "price_cad", label: "دلار کانادا", group: "ارز", unit: "rial", suggest: "cad" },
  { slug: "price_aud", label: "دلار استرالیا", group: "ارز", unit: "rial", suggest: "aud" },
  { slug: "price_jpy", label: "ین ژاپن (۱۰ ین)", group: "ارز", unit: "rial", suggest: "jpy" },
  { slug: "price_rub", label: "روبل روسیه", group: "ارز", unit: "rial", suggest: "rub" },
  { slug: "price_iqd", label: "دینار عراق (۱۰۰ دینار)", group: "ارز", unit: "rial", suggest: "iqd" },
  { slug: "price_kwd", label: "دینار کویت", group: "ارز", unit: "rial", suggest: "kwd" },
  { slug: "price_sar", label: "ریال عربستان", group: "ارز", unit: "rial", suggest: "sar" },
  { slug: "price_qar", label: "ریال قطر", group: "ارز", unit: "rial", suggest: "qar" },
  { slug: "price_omr", label: "ریال عمان", group: "ارز", unit: "rial", suggest: "omr" },
  { slug: "price_bhd", label: "دینار بحرین", group: "ارز", unit: "rial", suggest: "bhd" },
  { slug: "price_inr", label: "روپیه هند", group: "ارز", unit: "rial", suggest: "inr" },
  { slug: "price_afn", label: "افغانی", group: "ارز", unit: "rial", suggest: "afn" },
  { slug: "price_amd", label: "درام ارمنستان", group: "ارز", unit: "rial", suggest: "amd" },
  { slug: "price_azn", label: "منات آذربایجان", group: "ارز", unit: "rial", suggest: "azn" },
  { slug: "price_gel", label: "لاری گرجستان", group: "ارز", unit: "rial", suggest: "gel" },
  { slug: "price_sek", label: "کرون سوئد", group: "ارز", unit: "rial", suggest: "sek" },
  { slug: "price_nok", label: "کرون نروژ", group: "ارز", unit: "rial", suggest: "nok" },
  { slug: "price_dkk", label: "کرون دانمارک", group: "ارز", unit: "rial", suggest: "dkk" },
  { slug: "price_hkd", label: "دلار هنگ‌کنگ", group: "ارز", unit: "rial", suggest: "hkd" },
  { slug: "price_sgd", label: "دلار سنگاپور", group: "ارز", unit: "rial", suggest: "sgd" },
  { slug: "price_myr", label: "رینگیت مالزی", group: "ارز", unit: "rial", suggest: "myr" },
  { slug: "price_thb", label: "بات تایلند", group: "ارز", unit: "rial", suggest: "thb" },

  // Gold (rials)
  { slug: "geram18", label: "طلای ۱۸ عیار (گرم)", group: "طلا", unit: "rial", suggest: "gold_18k" },
  { slug: "geram24", label: "طلای ۲۴ عیار (گرم)", group: "طلا", unit: "rial", suggest: "gold_24k" },
  { slug: "gold_740k", label: "طلای ۱۸ عیار ۷۴۰", group: "طلا", unit: "rial" },
  { slug: "mesghal", label: "مثقال طلا", group: "طلا", unit: "rial", suggest: "mesghal" },

  // Coins (rials)
  { slug: "sekee", label: "سکه امامی (تمام بهار آزادی)", group: "سکه", unit: "rial", suggest: "full_coin" },
  { slug: "sekeb", label: "سکه بهار آزادی طرح قدیم", group: "سکه", unit: "rial" },
  { slug: "nim", label: "نیم سکه", group: "سکه", unit: "rial", suggest: "half_coin" },
  { slug: "rob", label: "ربع سکه", group: "سکه", unit: "rial", suggest: "quarter_coin" },
  { slug: "gerami", label: "سکه گرمی", group: "سکه", unit: "rial", suggest: "gerami_coin" },

  // Coin bubbles (rials): the coin's price above its gold's value — the live source is
  // src_def_tgju_bubbles; these fill their past days
  { slug: "coin_blubber", label: "حباب سکه امامی", group: "حباب سکه", unit: "rial", suggest: "bubble_full_coin" },
  { slug: "nim_blubber", label: "حباب نیم سکه", group: "حباب سکه", unit: "rial", suggest: "bubble_half_coin" },
  { slug: "rob_blubber", label: "حباب ربع سکه", group: "حباب سکه", unit: "rial", suggest: "bubble_quarter_coin" },
  { slug: "gerami_blubber", label: "حباب سکه گرمی", group: "حباب سکه", unit: "rial", suggest: "bubble_gerami_coin" },

  // Precious metals (dollars)
  { slug: "ons", label: "انس طلا", group: "فلزات جهانی", unit: "usd", suggest: "ons_gold" },
  { slug: "silver", label: "انس نقره", group: "فلزات جهانی", unit: "usd", suggest: "ons_silver" },
  { slug: "platinum", label: "انس پلاتین", group: "فلزات جهانی", unit: "usd" },
  { slug: "palladium", label: "انس پالادیوم", group: "فلزات جهانی", unit: "usd" },

  // Crypto and oil (dollars)
  { slug: "crypto-bitcoin", label: "بیت‌کوین", group: "رمزارز", unit: "usd", suggest: "btc" },
  { slug: "crypto-ethereum", label: "اتریوم", group: "رمزارز", unit: "usd", suggest: "eth" },
  { slug: "oil_brent", label: "نفت برنت", group: "نفت", unit: "usd" },
];

export const TGJU_UNITS = ["rial", "toman", "usd"];

/** A tgju slug as typed (the profile page address, or the bare slug) → the slug, or "" */
export function normalizeTgjuSlug(input) {
  const s = String(input || "").trim().toLowerCase();
  const fromUrl = s.match(/tgju\.org\/profile\/([a-z0-9_-]+)/);
  const slug = fromUrl ? fromUrl[1] : s;
  return /^[a-z0-9_-]{1,64}$/.test(slug) ? slug : "";
}
