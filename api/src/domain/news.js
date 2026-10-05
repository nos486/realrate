/**
 * news.js — The news section's rules, without I/O
 *
 *  - parseTelegramPosts: the posts of a channel's public page (t.me/s/<channel>)
 *  - keywordScore: whether a post is worth the model's look (config/news.config.js)
 *  - similarity: two posts that are the same news (channels repost each other)
 *  - buildNewsPrompt / parseNewsVerdicts: one short prompt for several posts, and its answer
 *  - fallbackNewsItem: a post published on its keywords alone, when the model can't be asked
 */

import { NEWS_KEYWORDS, NEWS_CATEGORIES, NEWS_KEYWORD_MIN_SCORE, NEWS_LIMITS } from "../config/news.config.js";

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", zwnj: "‌" };

/** HTML entities to text (&amp; &#1234; &#x1F4B0;) */
export function decodeEntities(text) {
  return String(text || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** A post's HTML to plain text: lines kept, tags and the channel's own signature lines dropped */
export function postHtmlToText(html) {
  const text = decodeEntities(
    String(html || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  );
  const lines = text.split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim());
  // Signature lines at the end: "@channel", "🆔 @channel", "t.me/…", a row of emoji
  while (lines.length && isSignatureLine(lines[lines.length - 1])) lines.pop();
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function isSignatureLine(line) {
  if (!line) return true;
  if (/(https?:\/\/|t\.me\/|@[a-z0-9_]{4,})/i.test(line) && line.replace(/(https?:\/\/\S+|t\.me\/\S+|@[a-z0-9_]+)/gi, "").replace(/[\s\p{P}\p{S}]/gu, "").length < 25) return true;
  // Only emoji, punctuation, hashtags
  return line.replace(/#\S+/g, "").replace(/[\s\p{P}\p{S}\p{Extended_Pictographic}‌‍️]/gu, "").length === 0;
}

/**
 * The posts on a channel's public page, oldest first
 * @param {string} html - t.me/s/<channel>
 * @returns {{ title: string, posts: Array<{ channel: string, postId: number, url: string, text: string, image: string, publishedAt: number }> }}
 */
export function parseTelegramPosts(html) {
  const source = String(html || "");
  const titleMatch = source.match(/<meta property="og:title" content="([^"]*)"/)
    || source.match(/class="tgme_channel_info_header_title"[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/);
  const title = titleMatch ? postHtmlToText(titleMatch[1]) : "";

  const posts = [];
  const blocks = source.split(/<div class="tgme_widget_message_wrap/).slice(1);
  for (const block of blocks) {
    const ref = block.match(/data-post="([a-zA-Z0-9_]+)\/(\d+)"/);
    if (!ref) continue;
    // The post's own text (a reply's quote of another post is js-message_reply_text)
    const textMatch = block.match(/class="tgme_widget_message_text js-message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/)
      || block.match(/class="tgme_widget_message_text(?![^"]*reply)[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const text = textMatch ? postHtmlToText(textMatch[1]) : "";
    if (!text) continue;
    const timeMatch = block.match(/<time[^>]*datetime="([^"]+)"/);
    const publishedAt = timeMatch ? Date.parse(timeMatch[1]) : NaN;
    const imageMatch = block.match(/tgme_widget_message_photo_wrap[^>]*background-image:url\('([^']+)'\)/);
    const channel = ref[1].toLowerCase();
    const postId = parseInt(ref[2], 10);
    posts.push({
      channel,
      postId,
      url: `https://t.me/${ref[1]}/${postId}`,
      text,
      image: imageMatch && /^https:\/\//.test(imageMatch[1]) ? imageMatch[1] : "",
      publishedAt: Number.isFinite(publishedAt) ? publishedAt : 0,
    });
  }
  posts.sort((a, b) => a.postId - b.postId);
  return { title, posts };
}

/** Persian text for matching: one form of ی and ک, Persian digits to ASCII, no half-spaces */
export function normalizeNewsText(text) {
  return String(text || "")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ۀة]/g, "ه")
    .replace(/[أإآ]/g, "ا")
    .replace(/[ً-ٰٟ]/g, "")
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[‌‍]/g, " ")
    .toLowerCase();
}

/** Whole-word match: a Persian word inside a longer one ("مس" in "مسکن") isn't the word */
function hasWord(text, word) {
  let from = 0;
  for (;;) {
    const at = text.indexOf(word, from);
    if (at < 0) return false;
    const before = at === 0 ? " " : text[at - 1];
    const after = at + word.length >= text.length ? " " : text[at + word.length];
    if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) return true;
    from = at + 1;
  }
}

const NORMALIZED_KEYWORDS = Object.fromEntries(
  Object.entries(NEWS_KEYWORDS).map(([kind, words]) => [kind, words.map(normalizeNewsText)]),
);

/**
 * How much a post looks like market news: strong words 2, weak words 1 (each once), words of a
 * single symbol's news or an ad −2
 */
export function keywordScore(text) {
  const t = normalizeNewsText(text);
  const count = (words) => words.filter((w) => hasWord(t, w)).length;
  return count(NORMALIZED_KEYWORDS.strong) * 2 + count(NORMALIZED_KEYWORDS.weak) - count(NORMALIZED_KEYWORDS.negative) * 2;
}

export const isNewsCandidate = (text) => keywordScore(text) >= NEWS_KEYWORD_MIN_SCORE;

const CATEGORY_WORDS = [
  ["gold", ["طلا", "سکه", "انس", "اونس", "مثقال", "آبشده"]],
  ["metals", ["نقره", "پلاتین", "پالادیوم", "مس", "فلزات"]],
  ["currency", ["دلار", "یورو", "درهم", "ارز", "حواله", "نیما", "ریال"]],
  ["oil", ["نفت", "برنت", "اوپک", "بنزین", "گاز"]],
  ["crypto", ["بیت کوین", "بیتکوین", "تتر", "رمزارز", "کریپتو"]],
  ["bourse", ["شاخص کل", "شاخص بورس", "شاخص هم وزن", "بورس", "فرابورس", "پول حقیقی", "ارزش معاملات", "صندوق تثبیت"]],
].map(([cat, words]) => [cat, words.map(normalizeNewsText)]);

/** The category whose words come first in the text ("economy" when none) */
export function guessCategory(text) {
  const t = normalizeNewsText(text);
  let best = "economy";
  let bestAt = Infinity;
  for (const [cat, words] of CATEGORY_WORDS) {
    for (const w of words) {
      const at = t.indexOf(w);
      if (at >= 0 && at < bestAt && hasWord(t, w)) {
        best = cat;
        bestAt = at;
      }
    }
  }
  return best;
}

/** The set of words of a text (for similarity), without the very short ones */
export function wordSet(text) {
  return new Set(
    normalizeNewsText(text)
      .replace(/https?:\/\/\S+|@\w+|#/g, " ")
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 2),
  );
}

/** Shared words over the smaller text's words (0–1): a short repost of a longer post is the same */
export function similarity(a, b) {
  const A = a instanceof Set ? a : wordSet(a);
  const B = b instanceof Set ? b : wordSet(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / Math.min(A.size, B.size);
}

export const isDuplicateNews = (a, b) => similarity(a, b) >= NEWS_LIMITS.duplicateSimilarity;

const CATEGORY_IDS = Object.keys(NEWS_CATEGORIES);

/**
 * One short request for several posts (instructions in English: fewer tokens than Persian)
 * @param {Array<{ text: string }>} posts
 * @returns {Array<{ role: string, content: string }>}
 */
export function buildNewsPrompt(posts) {
  const system = [
    "You screen Persian Telegram posts for an Iranian market app.",
    "Keep a post (k=1) only if it is real, fresh news that can move the dollar/rial rate, gold, coins, precious metals, oil, crypto, the Tehran stock market as a whole or the economy of Iran or the world",
    "(central bank, inflation, interest rates, sanctions, negotiations, war, Fed, OPEC, budget, wages, housing and car markets, major policy;",
    "the stock market's total index, total trading value and money flows count, c=bourse).",
    "Reject (k=0): a single stock, symbol or company's news, ads, promotions, signals, opinion without news, bare price lists, greetings, unrelated topics.",
    'Answer only a JSON array, one item per post: {"i":<n>,"k":0} or',
    `{"i":<n>,"k":1,"c":"${CATEGORY_IDS.join("|")}","p":<1-3 market impact>,"t":"<Persian headline, max 12 words>","s":"<Persian summary, 1-2 sentences, max 40 words>"}.`,
  ].join(" ");
  const user = posts
    .map((p, i) => `#${i + 1}\n${String(p.text || "").slice(0, NEWS_LIMITS.aiTextChars)}`)
    .join("\n\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** Output tokens for a batch: enough for every post to be kept with its summary */
export const newsMaxTokens = (count) => 40 + count * 140;

/**
 * Letters a Persian text never has — a model slipping into another language mid-sentence (e.g.
 * Vietnamese «nhẹ» for «جزئی»): Latin letters with accents, Greek, Cyrillic, Hebrew, Devanagari,
 * Thai, Japanese, Chinese, Korean
 */
const FOREIGN_LETTERS = /[\u00C0-\u024F\u1E00-\u1EFF\u0370-\u03FF\u0400-\u04FF\u0590-\u05FF\u0900-\u097F\u0E00-\u0E7F\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/;
/** A lowercase Latin word (acronyms and names — USD, OPEC, Fed — are fine) */
const LATIN_WORD = /(^|[^A-Za-z])[a-z]{2,}(?![A-Za-z])/;

/** Whether a text the model wrote in Persian has words of another language */
export const hasForeignText = (text) => FOREIGN_LETTERS.test(String(text || "")) || LATIN_WORD.test(String(text || ""));

const clip = (s, n) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trim()}…` : t;
};

/**
 * The model's answer, by post (index from 0); a post the answer leaves out is not in the map
 * @param {string|object} answer - Workers AI's `response` (text, or already parsed JSON)
 * @param {number} count
 * @returns {Map<number, { keep: boolean, category?: string, importance?: number, title?: string, summary?: string }>}
 */
export function parseNewsVerdicts(answer, count) {
  let list = answer;
  if (typeof answer === "string") {
    const start = answer.indexOf("[");
    const end = answer.lastIndexOf("]");
    if (start < 0 || end <= start) return new Map();
    try {
      list = JSON.parse(answer.slice(start, end + 1));
    } catch {
      return new Map();
    }
  }
  if (list && !Array.isArray(list) && Array.isArray(list.items)) list = list.items;
  if (!Array.isArray(list)) return new Map();

  const verdicts = new Map();
  for (const v of list) {
    const index = Number(v?.i) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= count || verdicts.has(index)) continue;
    const keep = Number(v.k) === 1 || v.k === true;
    const title = clip(v.t, 120);
    const summary = clip(v.s, 400);
    if (!keep || !title) {
      verdicts.set(index, { keep: false });
      continue;
    }
    const importance = Math.min(3, Math.max(1, Math.round(Number(v.p)) || 1));
    verdicts.set(index, {
      keep: true,
      category: CATEGORY_IDS.includes(v.c) ? v.c : "economy",
      importance,
      title,
      summary: summary || title,
      // Words of another language in what it wrote: the post's own text is shown instead
      ...(hasForeignText(title) || hasForeignText(summary) ? { foreign: true } : {}),
    });
  }
  return verdicts;
}

/** A post published without the model: its first line as the headline, its start as the summary */
export function fallbackNewsItem(text) {
  const lines = String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const title = clip(lines[0] || "", 120);
  const rest = lines.slice(1).join(" ");
  return {
    keep: true,
    category: guessCategory(text),
    importance: 1,
    title,
    summary: clip(rest || title, 240),
  };
}

/** A channel name as stored: lowercase, no "@", no link */
export function normalizeChannel(input) {
  const name = String(input || "")
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?t\.me\/(s\/)?/i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0]
    .toLowerCase();
  return /^[a-z][a-z0-9_]{3,31}$/.test(name) ? name : "";
}

const ANALYSIS_ASSETS = ["usd", "gold", "coin", "bourse", "oil"];
const DIRECTIONS = ["up", "down", "flat"];

/**
 * The analyst's prompt: the day's news (headline and summary, most important first) and today's
 * main prices. Instructions in English, the answer in Persian JSON.
 * @param {Array<{ title: string, summary: string, importance: number, publishedAt: number, category: string }>} news
 * @param {Array<{ name: string, price: number, unit?: string, changePercent?: number|null }>} prices
 * @param {{ summaryChars: number }} opts
 */
export function buildAnalysisPrompt(news, prices, { summaryChars = 220 } = {}) {
  const system = [
    "You are a senior Iranian market and macro analyst writing for ordinary investors.",
    "From today's news and prices below, write your professional view of what they mean for the next days:",
    "the free-market dollar, gold and coins, the Tehran stock index and oil. Be concrete, balanced and cautious;",
    "use only the facts given (no invented numbers or events); say what to watch. Not financial advice.",
    "Answer only JSON, all text in fluent Persian:",
    '{"t":"<headline of your view, max 12 words>","s":"<analysis, 4-6 sentences>",',
    `"o":[{"a":"${ANALYSIS_ASSETS.join("|")}","d":"${DIRECTIONS.join("|")}","n":"<reason, max 12 words>"}],`,
    '"k":["<key point, max 15 words>", ... at most 4],"r":"<main risk or what to watch, max 25 words>"}',
  ].join(" ");
  const tehran = (ts) => new Date(ts + 3.5 * 3600000).toISOString().slice(11, 16);
  const priceLines = prices
    .filter((p) => p && Number(p.price) > 0)
    .map((p) => `${p.name}: ${Math.round(p.price).toLocaleString("en-US")} ${p.unit || ""}${Number.isFinite(p.changePercent) ? ` (${p.changePercent > 0 ? "+" : ""}${p.changePercent.toFixed(2)}%)` : ""}`.trim());
  const newsLines = news.map((n) => {
    const summary = n.summary && n.summary !== n.title ? ` — ${String(n.summary).slice(0, summaryChars)}` : "";
    return `[${tehran(n.publishedAt)}${n.importance >= 3 ? " !" : ""}] ${n.title}${summary}`;
  });
  const user = `${priceLines.length ? `Prices now:\n${priceLines.join("\n")}\n\n` : ""}Today's news (Tehran time, ! = important):\n${newsLines.join("\n")}`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * The analyst's answer, or null when it isn't usable (no headline or analysis, broken JSON, words
 * of another language)
 * @returns {{ title: string, summary: string, outlook: Array<{ asset: string, direction: string, note: string }>, points: string[], risk: string }|null}
 */
export function parseAnalysis(answer) {
  let body = answer;
  if (typeof answer === "string") {
    const start = answer.indexOf("{");
    const end = answer.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      body = JSON.parse(answer.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  if (!body || typeof body !== "object") return null;
  const title = clip(body.t, 140);
  const summary = clip(body.s, 1200);
  if (!title || !summary) return null;
  const seen = new Set();
  const outlook = (Array.isArray(body.o) ? body.o : [])
    .filter((o) => ANALYSIS_ASSETS.includes(o?.a) && !seen.has(o.a) && seen.add(o.a))
    .map((o) => ({ asset: o.a, direction: DIRECTIONS.includes(o.d) ? o.d : "flat", note: clip(o.n, 120) }));
  const points = (Array.isArray(body.k) ? body.k : []).map((k) => clip(k, 160)).filter(Boolean).slice(0, 4);
  const risk = clip(body.r, 240);
  // Words of another language anywhere: not usable (the next model is asked)
  if ([title, summary, risk, ...points, ...outlook.map((o) => o.note)].some(hasForeignText)) return null;
  return { title, summary, outlook, points, risk };
}

/** The start (ms) of the Tehran day `now` is in (Iran keeps UTC+3:30 all year) */
export function tehranDayStart(now) {
  const offset = 3.5 * 3600000;
  return Math.floor((now + offset) / 86400000) * 86400000 - offset;
}

