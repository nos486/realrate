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

/** One row per UI language: a new language is a row here plus a dictionary in `web/src/i18n/` */
export const LOCALES = {
  fa: { code: 'fa', label: 'فارسی', dir: 'rtl', intl: 'fa-IR', calendar: 'persian' },
  en: { code: 'en', label: 'English', dir: 'ltr', intl: 'en-US', calendar: 'persian' },
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

/** @returns {{ code: string, label: string, dir: string, intl: string, calendar: string }} the active language row */
export const getLocaleInfo = () => LOCALES[current];

/** @returns {boolean} whether the active language reads right to left */
export const isRtl = () => LOCALES[current].dir === 'rtl';

/** @returns {'rtl'|'ltr'} the `dir` attribute value for the active language */
export const getDir = () => LOCALES[current].dir;

/** @returns {string} the BCP 47 tag for `Intl` / `toLocaleString` in the active language (digits and grouping) */
export const intlLocale = () => LOCALES[current].intl;

/** Adds (or extends) a language's dictionary: `{ 'persian text': 'translation' }` */
export function registerMessages(code, messages) {
  dictionaries[code] = Object.assign(dictionaries[code] || {}, messages);
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
