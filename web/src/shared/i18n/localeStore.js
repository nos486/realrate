/**
 * localeStore.js — Which language this device uses (Persian `fa` or English `en`)
 *
 * The choice is kept in localStorage and applied once per page load (switching reloads the page,
 * so every text, number and layout direction starts from one language). A device that never chose:
 *  - a link with ?lang=fa|en (the website's English pages) chooses it
 *  - a signed-in or earlier visitor (a stored session) keeps Persian, as before
 *  - the landing page follows the browser's language
 *  - everywhere else, the first-launch picker asks (shared/i18n/LanguagePicker.jsx)
 */

import { LOCALES, DEFAULT_LOCALE, LOCALE_STORAGE_KEY, isLocale, setActiveLocale, getLocale } from '../../utils/i18n.js';
import { isNativeApp } from '../native/nativeApp.js';

const TOKEN_KEY = 'realrate_token';

const read = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/** @returns {string|null} the language this device chose, or null before it ever chose */
export function getStoredLocale() {
  const stored = read(LOCALE_STORAGE_KEY);
  return isLocale(stored) ? stored : null;
}

/** Whether the app runs as an installed PWA (its own window, no browser bar) */
function isStandalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  } catch {
    return false;
  }
}

/** The language for a device that never chose, from the browser's own language */
function browserLocale() {
  const langs = (typeof navigator !== 'undefined' && (navigator.languages?.length ? navigator.languages : [navigator.language])) || [];
  const first = String(langs[0] || '').toLowerCase();
  if (!first) return DEFAULT_LOCALE;
  return first.startsWith('fa') ? 'fa' : 'en';
}

/**
 * Decides the language for this page load
 * @returns {{ locale: string, needsChoice: boolean }} needsChoice: show the first-launch picker before the app
 */
export function resolveBootLocale() {
  // The website's English pages open the app with ?lang=en: that is a choice
  const requested = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('lang');
  if (isLocale(requested)) {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, requested);
    } catch {
      // Private mode: only this page load follows the link's language
    }
    return { locale: requested, needsChoice: false };
  }
  const stored = getStoredLocale();
  if (stored) return { locale: stored, needsChoice: false };
  if (read(TOKEN_KEY)) return { locale: DEFAULT_LOCALE, needsChoice: false };
  const onLanding = typeof window !== 'undefined' && window.location.pathname === '/';
  if (onLanding && !isNativeApp() && !isStandalone()) return { locale: browserLocale(), needsChoice: false };
  return { locale: browserLocale(), needsChoice: true };
}

/** Points the document at the active language: `lang` and the layout direction (`dir`) */
export function applyDocumentLocale(code = getLocale()) {
  const info = LOCALES[code] || LOCALES[DEFAULT_LOCALE];
  const root = document.documentElement;
  root.setAttribute('lang', info.code);
  root.setAttribute('dir', info.dir);
}

/** Sets the language for this page load before anything renders (also fixes `lang` / `dir`) */
export function bootLocale(code) {
  setActiveLocale(code);
  applyDocumentLocale(code);
}

/**
 * Remembers the user's choice and reloads so the whole app starts in that language
 * @param {string} code - 'fa' | 'en'
 */
export function chooseLocale(code) {
  if (!isLocale(code)) return;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, code);
  } catch {
    // Private mode: the choice lasts only until the next launch, which asks again
  }
  window.location.reload();
}
