/**
 * askQuery.js — «از داده‌هایت بپرس»: a plain-Persian question about the user's own spending or
 * income («خرج رستوران سه ماه اخیر؟»), read and answered entirely in the browser
 *
 * The records are end-to-end encrypted, so nothing here may leave the device: no model, no
 * request. The question is read by rules (`parseQuestion`: what — expenses or incomes, how — a
 * total, a count, an average or the biggest, when — a day / week / month / year, which
 * categories or words, over or under an amount) and answered from the records the caller loads
 * for the period (`answerQuestion`). Pure functions; the page (AskCard.jsx) loads and renders.
 *
 * The Persian words the rules read end with `// i18n-ignore`: they are patterns, not UI texts.
 */

import { toEnglishDigits } from '../../shared/utils/formatters.js';
import { jalaliToGregorian, gregorianToJalali } from '../../utils/loanCalculator.js';
import { shiftShamsiMonth } from '../../utils/expenseDocument.js';
import { salaryMonthRange, currentSalaryMonth, salaryYearRange } from '../../utils/salaryMonth.js';

/** Shamsi month names, in order */
export const MONTH_NAMES = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']; // i18n-ignore

const NUMBER_WORDS = {
  یک: 1, دو: 2, سه: 3, چهار: 4, پنج: 5, شش: 6, هفت: 7, هشت: 8, نه: 9, ده: 10, یازده: 11, دوازده: 12, // i18n-ignore
};

/** Words that never name what to look for */
const STOP_WORDS = new Set([
  'خرج', 'هزینه', 'هزینه‌ها', 'خرجم', 'خرج‌ها', 'درآمد', 'درآمدم', 'حقوق', 'دریافتی', 'چقدر', 'چند', 'چه', 'کل', 'جمع', // i18n-ignore
  'مجموع', 'میانگین', 'بیشترین', 'گران‌ترین', 'بار', 'تا', 'مورد', 'تعداد', 'بود', 'بوده', 'است', 'کردم', 'کرده‌ام', // i18n-ignore
  'داشتم', 'من', 'م', 'در', 'از', 'به', 'برای', 'با', 'و', 'این', 'ان', 'آن', 'اخیر', 'گذشته', 'قبل', 'پیش', 'ماه', 'سال', // i18n-ignore
  'هفته', 'روز', 'امروز', 'دیروز', 'امسال', 'پارسال', 'بیشتر', 'کمتر', 'تومان', 'میلیون', 'هزار', 'میلیارد', 'مبلغ', 'خرید', // i18n-ignore
  'چقد', 'کدام', 'کدوم', 'هر', 'روزانه', 'ماهانه', 'پول', 'الان', 'تاالان', 'شد', 'شده', 'شدم', 'جاری', 'حقوقی', 'کردیم', // i18n-ignore
  'میشه', 'می‌شود', 'میشود', 'می‌شه', 'خرجی', 'مصرف', 'پرداخت', 'پرداختم', 'گفتم', 'بگو', 'بگویید', 'بده', 'بدهید', 'لطفا', 'مثلا', // i18n-ignore
  'همین', 'ام', 'اش', 'مان', 'هام', 'هایم', 'های', 'ها', 'کل', 'اون', 'اين', 'کنم', 'کردن', 'ثبت', 'شمسی', // i18n-ignore
]);

/** Letters, digits and spacing made uniform so patterns need one spelling */
export function normalizeText(raw) {
  return toEnglishDigits(String(raw ?? ''))
    .replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/ۀ/g, 'ه').replace(/[؟?!،,.:;]/g, ' ') // i18n-ignore
    .replace(/‌/g, '‌') // keep the ZWNJ of Persian words
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const isoOf = ({ year, month, day }) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const jalaliIso = (jy, jm, jd) => isoOf(jalaliToGregorian(jy, jm, jd));
const parseIso = (iso) => { const [y, m, d] = iso.split('-').map(Number); return { y, m, d }; };
const shamsiOf = (iso) => { const { y, m, d } = parseIso(iso); return gregorianToJalali(y, m, d); };

function addDays(iso, delta) {
  const { y, m, d } = parseIso(iso);
  const date = new Date(Date.UTC(y, m - 1, d + delta));
  return date.toISOString().slice(0, 10);
}

/** The count in «۳ ماه» / «سه ماه»: digits or a number word; 1 when none is said */
function countBefore(text, unit) {
  const m = text.match(new RegExp(`(\\d+|${Object.keys(NUMBER_WORDS).join('|')}) ${unit}`));
  if (!m) return null;
  return /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1]];
}

/**
 * The period a question asks about. Months are salary months when `starts` (the marked salary days) is
 * given, like everywhere else in the app (utils/salaryMonth.js); without it they are calendar months.
 * @param {string} text normalized question
 * @param {string} today YYYY-MM-DD
 * @param {string[]} [starts] the marked salary days while the salary view is on
 * @returns {{ from: string, to: string, key: string, params?: object, explicit: boolean }}
 */
export function parsePeriod(text, today, starts = []) {
  const calendarNow = shamsiOf(today);
  const now = currentSalaryMonth(today, starts) || calendarNow;
  const monthRange = (jy, jm) => { const r = salaryMonthRange(jy, jm, starts); return { from: r.from, to: r.to }; };
  const yearRange = (jy) => salaryYearRange(jy, starts);

  if (/دیروز/.test(text)) { const d = addDays(today, -1); return { from: d, to: d, key: 'yesterday', explicit: true }; } // i18n-ignore
  if (/امروز/.test(text)) return { from: today, to: today, key: 'today', explicit: true }; // i18n-ignore

  const weeks = countBefore(text, 'هفته (اخیر|گذشته|پیش)'); // i18n-ignore
  if (/هفته (اخیر|گذشته|پیش)/.test(text) || /(این|همین) هفته/.test(text)) { // i18n-ignore
    const n = weeks || 1;
    return { from: addDays(today, -7 * n + 1), to: today, key: 'weeks', params: { n }, explicit: true };
  }

  const months = countBefore(text, 'ماه (اخیر|گذشته|پیش)'); // i18n-ignore
  if (months && months > 1) {
    const first = shiftShamsiMonth(now, -(months - 1));
    return { from: monthRange(first.jy, first.jm).from, to: today, key: 'months', params: { n: months }, explicit: true };
  }

  if (/ماه (قبل|گذشته|پیش)/.test(text)) { // i18n-ignore
    const prev = shiftShamsiMonth(now, -1);
    return { ...monthRange(prev.jy, prev.jm), key: 'month', params: { month: MONTH_NAMES[prev.jm - 1] }, explicit: true };
  }

  if (/(پارسال|سال (قبل|گذشته|پیش))/.test(text)) { // i18n-ignore
    const jy = now.jy - 1;
    return { ...yearRange(jy), key: 'year', params: { year: jy }, explicit: true };
  }
  if (/(امسال|این سال|سال جاری)/.test(text)) { // i18n-ignore
    return { from: yearRange(now.jy).from, to: today, key: 'year', params: { year: now.jy }, explicit: true };
  }

  // A named month, optionally with a year («آبان ۱۴۰۴»); a month still ahead means last year's
  const named = MONTH_NAMES.findIndex((name) => text.includes(name));
  if (named >= 0) {
    const yearMatch = text.match(/\b(13\d\d|14\d\d)\b/);
    let jy = yearMatch ? Number(yearMatch[1]) : now.jy;
    if (!yearMatch && named + 1 > now.jm) jy -= 1;
    return { ...monthRange(jy, named + 1), key: 'month', params: { month: MONTH_NAMES[named], year: jy }, explicit: true };
  }

  // «این ماه» / «ماه جاری» and the default: the month today falls in, up to today
  const range = monthRange(now.jy, now.jm);
  return { from: range.from, to: today < range.to ? today : range.to, key: 'thisMonth', explicit: /(این|همین) ماه|ماه جاری/.test(text) }; // i18n-ignore
}

/** «بیشتر از ۵ میلیون» → { min: 5_000_000 }; «کمتر از ۲۰۰ هزار» → { max: 200_000 } */
export function parseAmountBounds(text) {
  const bounds = {};
  const re = /(بیشتر|کمتر|بالای|زیر) (?:از )?(\d+(?:\.\d+)?) ?(میلیارد|میلیون|هزار)?/g; // i18n-ignore
  for (const m of text.matchAll(re)) {
    const unit = { میلیارد: 1e9, میلیون: 1e6, هزار: 1e3 }[m[3]] || 1; // i18n-ignore
    const value = Number(m[2]) * unit;
    if (m[1] === 'بیشتر' || m[1] === 'بالای') bounds.min = value; // i18n-ignore
    else bounds.max = value;
  }
  return bounds;
}

/** A word without a possessive or plural ending («خرجم» → خرج, «هزینه‌ی» → هزینه, «امروزم» → امروز) */
function stem(word) {
  return word.replace(/(‌ی|‌ها|ها|ی|م|ت|ش)$/, ''); // i18n-ignore
}

/** The words of a category label that can be matched on («رستوران و کافه» → رستوران, کافه) */
const labelWords = (label) => normalizeText(label).split(' ').filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

/**
 * Read a question
 * @param {string} question
 * @param {{ today: string, categories?: { expense?: Array<{ value: string, label: string }>, income?: Array<{ value: string, label: string }> },
 *   starts?: string[] }} context `starts`: the marked salary days while the salary-month view is on (months then follow the salary)
 * @returns {{ kind: 'expense'|'income', intent: 'sum'|'count'|'average'|'top', period: object,
 *   categories: string[], terms: string[], min?: number, max?: number }}
 */
export function parseQuestion(question, { today, categories = {}, starts = [] }) {
  const text = normalizeText(question);
  const kind = /(درآمد|حقوق|دریافتی|واریزی|دریافت کردم)/.test(text) && !/(خرج|هزینه)/.test(text) ? 'income' : 'expense'; // i18n-ignore

  let intent = 'sum';
  if (/(چند بار|چندبار|چند تا|چند مورد|تعداد)/.test(text)) intent = 'count'; // i18n-ignore
  else if (/میانگین/.test(text)) intent = 'average'; // i18n-ignore
  else if (/(بیشترین|گران‌ترین|گرانترین|بزرگ‌ترین|بزرگترین)/.test(text)) intent = 'top'; // i18n-ignore

  const period = parsePeriod(text, today, starts);
  const bounds = parseAmountBounds(text);

  // Categories whose name (or any word of it) the question says
  const matched = [];
  const used = new Set();
  for (const c of categories[kind] || []) {
    const words = labelWords(c.label);
    const hit = words.filter((w) => text.includes(w));
    if (hit.length) { matched.push(c.value); hit.forEach((w) => used.add(w)); }
  }

  // What is left names a word to look for in titles and notes
  const terms = text.split(' ').filter((w) => (
    w.length >= 3
    && !STOP_WORDS.has(w)
    && !STOP_WORDS.has(stem(w))
    && !/^\d+$/.test(w)
    && !MONTH_NAMES.includes(w)
    && !used.has(w)
    && !/^(13|14)\d\d$/.test(w)
    && ![...used].some((u) => w.includes(u))
  ));
  return { kind, intent, period, categories: matched, terms, ...bounds };
}

/**
 * Answer a parsed question from the period's records
 * @param {ReturnType<typeof parseQuestion>} query
 * @param {object[]} records expenses (`date`, `title`, `notes`, `tags`, `category`) or incomes (`incomeDate`, …)
 * @param {{ toToman: (record: object) => number, isExcluded?: (category: string) => boolean,
 *   labelOf?: (category: string) => string }} helpers
 * @returns {{ count: number, total: number, average: number, top: Array<object>, byCategory: Array<{ category: string, label: string, total: number }> }}
 */
export function answerQuestion(query, records, { toToman, isExcluded = () => false, labelOf = (c) => c }) {
  const dateOf = (r) => r.incomeDate || r.date;
  const named = query.categories.length > 0;
  const hay = (r) => normalizeText([r.title, r.notes, ...(r.tags || []), labelOf(r.category)].join(' '));
  const rows = [];
  for (const r of records) {
    const date = dateOf(r);
    if (!date || date < query.period.from || date > query.period.to) continue;
    // Categories left out of the totals count only when asked for by name
    if (!named && isExcluded(r.category)) continue;
    if (named && !query.categories.includes(r.category)) continue;
    if (query.terms.length) { const h = hay(r); if (!query.terms.every((w) => h.includes(w))) continue; }
    const amount = toToman(r) || 0;
    if (query.min !== undefined && amount <= query.min) continue;
    if (query.max !== undefined && amount >= query.max) continue;
    rows.push({ id: r.id, title: r.title, date, category: r.category, amount });
  }
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const byCat = new Map();
  for (const r of rows) byCat.set(r.category, (byCat.get(r.category) || 0) + r.amount);
  return {
    count: rows.length,
    total,
    average: rows.length ? total / rows.length : 0,
    top: [...rows].sort((a, b) => b.amount - a.amount).slice(0, 5),
    byCategory: [...byCat.entries()].map(([category, sum]) => ({ category, label: labelOf(category), total: sum })).sort((a, b) => b.total - a.total).slice(0, 5),
  };
}
