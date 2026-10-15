/**
 * newsFeeds.js — The international news feeds' rules, without I/O
 *
 *  - parseNewsFeed: the articles of an RSS 2.0 or Atom feed (headline, summary, link, time, image)
 *  - feedPostId: a stable number for an article (its guid or link), so it fits the news ids
 *    ("<feed id>/<number>") the Telegram posts use
 *  - normalizeFeed / feedIdFromUrl: a feed of the admin's list as stored
 *
 * The feeds are read by services/news/news.service.js with the channels; their articles go
 * through the same keywords, repeat check and model (which translates them into Persian).
 */

import { decodeEntities, postHtmlToText } from "./news.js";

/** FNV-1a (32 bits) of a text: the same article gives the same number on every read */
export function feedPostId(key) {
  let hash = 0x811c9dc5;
  for (const ch of String(key || "")) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // Never 0 (a post id of 0 reads as "none")
  return hash || 1;
}

/** A tag's inner text (CDATA unwrapped), or "" — the first one, namespaced names written in full */
function tagText(block, name) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  if (!match) return "";
  return match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

/** An attribute of the first matching tag */
function tagAttr(block, tagPattern, attr) {
  const tag = block.match(new RegExp(`<${tagPattern}\\b[^>]*>`, "i"));
  const value = tag?.[0].match(new RegExp(`\\s${attr}\\s*=\\s*["']([^"']+)["']`, "i"));
  return value ? decodeEntities(value[1]).trim() : "";
}

/**
 * A feed's text as plain text: tags dropped, entities decoded; a summary escaped twice
 * (`&lt;p&gt;…`) is unwrapped once more
 */
function feedText(raw) {
  let text = postHtmlToText(raw);
  if (/<\/?[a-z][^>]*>/i.test(text)) text = postHtmlToText(text);
  return text.replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").trim();
}

const isWebUrl = (url) => /^https?:\/\/[^\s"'<>]+$/i.test(url);

/** An article's link: RSS `<link>url</link>`, Atom `<link rel="alternate" href>`, or a permalink guid */
function itemLink(block) {
  const rss = decodeEntities(tagText(block, "link"));
  if (isWebUrl(rss)) return rss;
  const atomLinks = block.match(/<link\b[^>]*>/gi) || [];
  const alternate = atomLinks.find((l) => !/\srel\s*=/i.test(l) || /\srel\s*=\s*["']alternate["']/i.test(l));
  const href = alternate?.match(/\shref\s*=\s*["']([^"']+)["']/i);
  if (href && isWebUrl(decodeEntities(href[1]))) return decodeEntities(href[1]);
  const guid = decodeEntities(tagText(block, "guid") || tagText(block, "id"));
  return isWebUrl(guid) ? guid : "";
}

/** An article's picture: media:content / media:thumbnail / an image enclosure / the summary's first <img> */
function itemImage(block, summaryRaw) {
  const candidates = [
    tagAttr(block, "media:content(?=[^>]*(?:medium=[\"']image|type=[\"']image))", "url"),
    tagAttr(block, "media:thumbnail", "url"),
    tagAttr(block, "enclosure(?=[^>]*type=[\"']image)", "url"),
    tagAttr(block, "media:content", "url"),
    decodeEntities(summaryRaw).match(/<img\b[^>]*\ssrc\s*=\s*["']([^"']+)["']/i)?.[1] || "",
  ];
  // Only https pictures (the page is https)
  return candidates.find((url) => /^https:\/\/[^\s"'<>]+$/i.test(url)) || "";
}

/**
 * The articles of a feed, oldest first
 * @param {string} xml - RSS 2.0 or Atom
 * @param {string} feedId - the feed's id in the admin's list (the items' `channel`)
 * @param {{ summaryChars?: number }} [opts]
 * @returns {{ title: string, posts: Array<{ channel: string, postId: number, url: string, title: string,
 *   text: string, image: string, publishedAt: number }> }}
 */
export function parseNewsFeed(xml, feedId, { summaryChars = 1200 } = {}) {
  const source = String(xml || "");
  const firstItem = source.search(/<(item|entry)[\s>]/i);
  const head = firstItem >= 0 ? source.slice(0, firstItem) : source;
  const title = feedText(tagText(head, "title"));

  const posts = [];
  const seen = new Set();
  const blocks = source.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
  for (const block of blocks) {
    const headline = feedText(tagText(block, "title"));
    const url = itemLink(block);
    if (!headline || !url) continue;
    const summaryRaw = tagText(block, "description") || tagText(block, "summary") || tagText(block, "content");
    let summary = feedText(summaryRaw);
    // A summary that only repeats the headline adds nothing
    if (summary === headline || summary.startsWith(headline)) summary = summary.slice(headline.length).trim();
    if (summary.length > summaryChars) summary = `${summary.slice(0, summaryChars - 1).trim()}…`;
    const time = tagText(block, "pubDate") || tagText(block, "published") || tagText(block, "updated") || tagText(block, "dc:date");
    const publishedAt = Date.parse(time);
    const key = decodeEntities(tagText(block, "guid") || tagText(block, "id")) || url;
    const postId = feedPostId(key);
    if (seen.has(postId)) continue;
    seen.add(postId);
    posts.push({
      channel: feedId,
      postId,
      url,
      title: headline,
      text: summary ? `${headline}\n${summary}` : headline,
      image: itemImage(block, summaryRaw),
      publishedAt: Number.isFinite(publishedAt) ? publishedAt : 0,
    });
  }
  posts.sort((a, b) => a.publishedAt - b.publishedAt);
  return { title, posts };
}

/** A feed's address as stored: http(s) only, no credentials, or "" */
export function normalizeFeedUrl(input) {
  let url;
  try {
    url = new URL(String(input || "").trim());
  } catch {
    return "";
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || !url.hostname.includes(".")) return "";
  url.hash = "";
  return url.toString();
}

/** A feed id made from its address: the host's name and a short hash of the address ("fxstreet_k3j9") */
export function feedIdFromUrl(url) {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^(www|feeds?|rss)\./i, "");
  } catch {
    return "";
  }
  const name = host.split(".")[0].toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const base = /^[a-z]/.test(name) ? name.slice(0, 24) : `feed_${name}`.slice(0, 24);
  return `${base}_${feedPostId(url).toString(36).slice(0, 4)}`;
}

/** A feed id as stored: lowercase letters, digits and "_", starting with a letter */
export const isFeedId = (id) => /^[a-z][a-z0-9_]{2,39}$/.test(String(id || ""));

/**
 * One feed of the admin's list as stored, or null when its address isn't usable
 * @param {{ id?: string, title?: string, url: string, enabled?: boolean }|string} entry
 * @returns {{ id: string, title: string, url: string, enabled: boolean }|null}
 */
export function normalizeFeed(entry) {
  const raw = typeof entry === "string" ? { url: entry } : entry || {};
  const url = normalizeFeedUrl(raw.url);
  if (!url) return null;
  const id = isFeedId(raw.id) ? raw.id : feedIdFromUrl(url);
  if (!id) return null;
  const title = String(raw.title || "").replace(/\s+/g, " ").trim().slice(0, 40) || new URL(url).hostname.replace(/^www\./, "");
  return { id, title, url, enabled: raw.enabled !== false };
}
