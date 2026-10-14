/**
 * i18n/index.js — Public surface of the language support (core in utils/i18n.js)
 */

export { t, msg, plural, getLocale, isRtl, intlLocale, hasNews } from '../../utils/i18n.js';
export { default as LanguageSwitch } from './LanguageSwitch.jsx';
export { chooseLocale, getStoredLocale } from './localeStore.js';
