/**
 * i18n.js — UI language core shared by the browser and the Worker (Persian `fa`, English `en`)
 *
 * The Persian source text IS the message key: `t('ذخیره')` renders as written in `fa`, and in `en`
 * looks the text up in the English dictionary registered with `registerMessages` (files in
 * `web/src/i18n/en/`). A text without a translation renders in Persian, so a gap never blanks the UI.
 * Placeholders are `{name}`: `t('{n} مورد', { n: 3 })`.
 *
 * The language is chosen once per page load (changing it reloads the page), so `t` is a plain
 * synchronous call that is safe at module level. Outside the browser (the Worker) it is `fa`.
 */

/** One row per UI language: a new language is a row here plus a dictionary in `web/src/i18n/`; `news` says whether the AI-curated news and daily analysis (Persian sources) are offered in that language */
export const LOCALES = {
  fa: { code: 'fa', label: 'فارسی', dir: 'rtl', intl: 'fa-IR', calendar: 'persian', news: true },
  en: { code: 'en', label: 'English', dir: 'ltr', intl: 'en-US', calendar: 'persian', news: false },
};
export const DEFAULT_LOCALE = 'fa';
export const LOCALE_STORAGE_KEY = 'realrate_locale';

const dictionaries = {};
let current = DEFAULT_LOCALE;

/** @param {string} value @returns {boolean} whether the value is a supported language code */
export const isLocale = (value) => Object.prototype.hasOwnProperty.call(LOCALES, value);

/** Sets the language used by `t` for this page load (call before the UI renders) */
export function setActiveLocale(code) {
  current = isLocale(code) ? code : DEFAULT_LOCALE;
}

/** @returns {string} the active language code */
export const getLocale = () => current;

/** @returns {{ code: string, label: string, dir: string, intl: string, calendar: string, news: boolean }} the active language row */
export const getLocaleInfo = () => LOCALES[current];

/** @returns {boolean} whether the news and the daily analysis are offered in the active language */
export const hasNews = () => LOCALES[current].news === true;

/** @returns {boolean} whether the active language reads right to left */
export const isRtl = () => LOCALES[current].dir === 'rtl';

/** @returns {'rtl'|'ltr'} the `dir` attribute value for the active language */
export const getDir = () => LOCALES[current].dir;

/** @returns {string} the BCP 47 tag for `Intl` / `toLocaleString` in the active language (digits and grouping) */
export const intlLocale = () => LOCALES[current].intl;

/** Adds (or extends) a language's dictionary: `{ 'persian text': 'translation' }` */
export function registerMessages(code, messages) {
  dictionaries[code] = Object.assign(dictionaries[code] || {}, messages);
  templateCache.delete(code);
}

/** Compiled `{placeholder}` entries per language, for `tMessage` (rebuilt when messages are added) */
const templateCache = new Map();

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹'; // i18n-ignore
const toLatinDigits = (text) => text.replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d))); // i18n-ignore
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Placeholders that stand for one number-like token; any other placeholder may span several words */
const TOKEN_PLACEHOLDERS = new Set(['n', 'count', 'limit', 'number', 'num', 'max', 'min', 'days', 'hours']);

function templatesFor(code) {
  let list = templateCache.get(code);
  if (list) return list;
  list = [];
  for (const [key, to] of Object.entries(dictionaries[code] || {})) {
    if (!/\{\w+\}/.test(key)) continue;
    const names = [];
    const source = key
      .split(/(\{\w+\})/)
      .map((part) => {
        const name = /^\{(\w+)\}$/.exec(part)?.[1];
        if (!name) return escapeRegExp(part);
        names.push(name);
        return TOKEN_PLACEHOLDERS.has(name) ? '(\\S+)' : '(.+?)';
      })
      .join('');
    list.push({ re: new RegExp(`^${source}$`), names, to, size: key.length });
  }
  // The most specific (longest) template wins when several fit
  list.sort((a, b) => b.size - a.size);
  templateCache.set(code, list);
  return list;
}

/**
 * Translates a fixed message that already has its values filled in (the Worker's replies such as
 * "رمز عبور باید حداقل ۸ کاراکتر باشد."): an exact entry first, otherwise the `{placeholder}` entry it
 * matches, with the values translated and shown with Latin digits. Persian, or a text nothing matches, is returned unchanged.
 * @param {string} text
 * @returns {string}
 */
export function tMessage(text) {
  if (current === DEFAULT_LOCALE || typeof text !== 'string' || !text) return text;
  const exact = dictionaries[current]?.[text];
  if (exact !== undefined) return exact;
  for (const { re, names, to } of templatesFor(current)) {
    const match = re.exec(text);
    if (!match) continue;
    const params = {};
    names.forEach((name, i) => {
      const raw = match[i + 1];
      params[name] = toLatinDigits(/[\u0600-\u06FF]/.test(raw) ? tMessage(raw) : raw);
    });
    return to.replace(/\{(\w+)\}/g, (whole, name) => (params[name] === undefined ? whole : params[name]));
  }
  return text;
}

/**
 * Translates a Persian source text into the active language
 * @param {string} text - The Persian text (the key)
 * @param {Record<string, string|number>} [params] - Values for `{name}` placeholders
 * @returns {string}
 */
export function t(text, params) {
  let out = text;
  if (current !== DEFAULT_LOCALE) {
    const hit = dictionaries[current]?.[text];
    if (hit !== undefined) out = hit;
  }
  if (!params) return out;
  return out.replace(/\{(\w+)\}/g, (whole, name) => (params[name] === undefined ? whole : String(params[name])));
}

/** Marks a text for translation without translating it now (module-level tables, rendered through `t(...)` later) */
export const msg = (text) => text;

/**
 * Picks the singular/plural form for English; Persian has no plural, so `fa` always gets the first form
 * @param {number} n @param {string} one @param {string} other
 */
export const plural = (n, one, other) => (current === 'en' && Number(n) !== 1 ? other : one);
