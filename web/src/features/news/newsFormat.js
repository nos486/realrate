/**
 * newsFormat.js — How a news item's time, category and source read
 */

import { intlLocale, t } from '../../utils/i18n.js';
import { calendarLocale } from '../../shared/utils/dates.js';

export const NEWS_CATEGORIES = {
  currency: t('ارز'),
  gold: t('طلا و سکه'),
  metals: t('فلزات'),
  oil: t('نفت و انرژی'),
  bourse: t('بورس و شاخص'),
  economy: t('اقتصاد'),
  crypto: t('رمزارز'),
  politics: t('سیاسی و امنیتی'),
};

const TEHRAN = 'Asia/Tehran';
const fa = (n) => Number(n).toLocaleString(intlLocale());

/** "۱۴:۳۰" on Tehran's clock */
export function newsClock(ts) {
  return new Date(ts).toLocaleTimeString(intlLocale(), { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TEHRAN });
}

/** "۱۲ مهر، ۱۴:۳۰" */
export function newsFullTime(ts) {
  const day = new Date(ts).toLocaleDateString(calendarLocale(), { day: 'numeric', month: 'long', timeZone: TEHRAN });
  return t('{day}، {time}', { day, time: newsClock(ts) });
}

/** "لحظاتی پیش", "۵ دقیقه پیش", "۳ ساعت پیش", then "دیروز ۱۴:۳۰" or "۱۲ مهر، ۱۴:۳۰" */
export function newsTimeAgo(ts, now = Date.now()) {
  const minutes = Math.floor((now - ts) / 60000);
  if (minutes < 1) return t('لحظاتی پیش');
  if (minutes < 60) return t('{n} دقیقه پیش', { n: fa(minutes) });
  const hours = Math.floor(minutes / 60);
  if (hours < 12) return t('{n} ساعت پیش', { n: fa(hours) });
  const dayOf = (at) => new Date(at).toLocaleDateString('en-CA', { timeZone: TEHRAN });
  if (dayOf(ts) === dayOf(now)) return t('امروز {time}', { time: newsClock(ts) });
  if (dayOf(ts) === dayOf(now - 86400000)) return t('دیروز {time}', { time: newsClock(ts) });
  return newsFullTime(ts);
}

/** The channel's name as it calls itself, or its @username; an international feed's name */
export const newsSource = (item) => item.channelTitle || (isWorldNews(item) ? item.channel : `@${item.channel}`);

/** An international feed's article (English original, with a link to it) */
export const isWorldNews = (item) => item?.source === 'world';

/** The site an article is on ("reuters.com"), from its link */
export function newsSite(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
