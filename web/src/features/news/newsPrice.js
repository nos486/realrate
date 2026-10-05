/**
 * newsPrice.js — The price a news item is about (the dollar, a coin, gold, …), from its headline
 * and summary, so the news page can show that price and its change next to it
 */

import { normalizeNewsText } from '../../utils/news.js';

// First match wins: the more specific asset before the general one
const RULES = [
  ['full_coin', ['سکه']],
  ['ons_gold', ['اونس طلا', 'انس طلا', 'اونس', 'انس جهانی']],
  ['mesghal', ['مثقال', 'آبشده']],
  ['gold_18k', ['طلا', 'طلای']],
  ['ons_silver', ['نقره']],
  ['eur', ['یورو']],
  ['usdt', ['تتر']],
  ['btc', ['بیت کوین', 'بیتکوین']],
  ['usd', ['دلار', 'ارز']],
].map(([id, words]) => [id, words.map(normalizeNewsText)]);

const PRICED = new Set(['currency', 'gold', 'metals', 'crypto']);

/** The price book id a news item is about, or null (only for currency, gold, metal and crypto news) */
export function priceIdOfNews(item) {
  if (!item || !PRICED.has(item.category)) return null;
  const text = normalizeNewsText(`${item.title} ${item.summary || ''}`);
  for (const [id, words] of RULES) {
    if (words.some((w) => text.includes(w))) return id;
  }
  return null;
}
