/**
 * newsFormat.js — How a news item's time, category and source read
 */

export const NEWS_CATEGORIES = {
  currency: 'ارز',
  gold: 'طلا و سکه',
  metals: 'فلزات',
  oil: 'نفت و انرژی',
  bourse: 'بورس و شاخص',
  economy: 'اقتصاد',
  crypto: 'رمزارز',
};

const TEHRAN = 'Asia/Tehran';
const fa = (n) => Number(n).toLocaleString('fa-IR');

/** "۱۴:۳۰" on Tehran's clock */
export function newsClock(ts) {
  return new Date(ts).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TEHRAN });
}

/** "۱۲ مهر، ۱۴:۳۰" */
export function newsFullTime(ts) {
  const day = new Date(ts).toLocaleDateString('fa-IR', { day: 'numeric', month: 'long', timeZone: TEHRAN });
  return `${day}، ${newsClock(ts)}`;
}

/** "لحظاتی پیش", "۵ دقیقه پیش", "۳ ساعت پیش", then "دیروز ۱۴:۳۰" or "۱۲ مهر، ۱۴:۳۰" */
export function newsTimeAgo(ts, now = Date.now()) {
  const minutes = Math.floor((now - ts) / 60000);
  if (minutes < 1) return 'لحظاتی پیش';
  if (minutes < 60) return `${fa(minutes)} دقیقه پیش`;
  const hours = Math.floor(minutes / 60);
  if (hours < 12) return `${fa(hours)} ساعت پیش`;
  const dayOf = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: TEHRAN });
  if (dayOf(ts) === dayOf(now)) return `امروز ${newsClock(ts)}`;
  if (dayOf(ts) === dayOf(now - 86400000)) return `دیروز ${newsClock(ts)}`;
  return newsFullTime(ts);
}

/** The channel's name as it calls itself, or its @username */
export const newsSource = (item) => item.channelTitle || `@${item.channel}`;
