/**
 * priceSourceFormat.js — How the admin's price sources page words a source: its fetch interval,
 * its status, its price in its own quote and when it was or will be fetched
 *
 * The server sends the facts (api priceSourcesAdmin.service.js: kind, quote, schedule); this only
 * turns them into Persian text, so the rules live in one place and are tested on their own.
 */

const fa = (n, digits = 0) => Number(n || 0).toLocaleString('fa-IR', { maximumFractionDigits: digits });

/** A source's status as the admin reads it, and its tone (a CSS modifier) */
export const SOURCE_STATUS = {
  ok: { label: 'سالم', tone: 'is-ok' },
  error: { label: 'خطا', tone: 'is-error' },
  stale: { label: 'کهنه', tone: 'is-warn' },
  pending: { label: 'در انتظار اولین دریافت', tone: 'is-muted' },
  off: { label: 'خاموش', tone: 'is-muted' },
};

/** The order of the summary's states */
export const SOURCE_STATUS_ORDER = ['ok', 'error', 'stale', 'pending', 'off'];

/**
 * A duration in seconds as Persian text: «۳۰ ثانیه», «۵ دقیقه», «۱ ساعت و ۳۰ دقیقه», «۲ روز»
 * @param {number} sec
 */
export function durationText(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (s < 60) return `${fa(s)} ثانیه`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const rest = s % 60;
    return rest ? `${fa(m)} دقیقه و ${fa(rest)} ثانیه` : `${fa(m)} دقیقه`;
  }
  if (s < 86400) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return m ? `${fa(h)} ساعت و ${fa(m)} دقیقه` : `${fa(h)} ساعت`;
  }
  return `${fa(Math.round(s / 86400))} روز`;
}

/** How often a source is fetched: «هر ۵ دقیقه» */
export const intervalText = (sec) => `هر ${durationText(sec)}`;

/**
 * A time relative to now: «۳ دقیقه پیش», «۲ دقیقه دیگر», «همین حالا»
 * @param {string|null} iso
 * @param {number} [nowMs]
 */
export function relativeTime(iso, nowMs = Date.now()) {
  const t = Date.parse(iso || '');
  if (!t) return '—';
  const diff = Math.round((t - nowMs) / 1000);
  if (Math.abs(diff) < 30) return 'همین حالا';
  return diff < 0 ? `${durationText(-diff)} پیش` : `${durationText(diff)} دیگر`;
}

/**
 * When a source is fetched next: a time past is due, and fetched on the next cron tick
 * @param {{ status: string, nextDueAt: string|null }} schedule
 * @param {number} [nowMs]
 */
export function nextFetchText(schedule, nowMs = Date.now()) {
  if (!schedule?.nextDueAt) return 'خاموش';
  const t = Date.parse(schedule.nextDueAt);
  return t <= nowMs ? 'در نوبت (دقیقه‌ی بعد)' : relativeTime(schedule.nextDueAt, nowMs);
}

/**
 * A price in the source's own quote: tomans and rials whole, dollars with cents, a cross rate
 * with its decimals
 * @param {number|null} price
 * @param {'toman'|'rial'|'usd'|'usd_cross'} quote
 */
export function quotePrice(price, quote = 'toman') {
  if (!(Number(price) > 0)) return '—';
  if (quote === 'usd') return `$${Number(price).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (quote === 'usd_cross') return fa(price, 4);
  return `${fa(price)} ${quote === 'rial' ? 'ریال' : 'تومان'}`;
}

/** Ids that more than one source prices (only those need a primary source) */
export function sharedPriceTypes(sources) {
  const count = new Map();
  for (const s of sources || []) if (s.kind === 'single' && s.priceType) count.set(s.priceType, (count.get(s.priceType) || 0) + 1);
  return new Set([...count].filter(([, n]) => n > 1).map(([t]) => t));
}

/** Whether a source matches a search (its name, id, brand, category or endpoint) */
export function sourceMatches(src, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  return [src.name, src.id, src.brand, src.categoryName, src.priceType, src.endpoint, src.adapterName]
    .some((v) => String(v || '').toLowerCase().includes(q));
}
