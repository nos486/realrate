/**
 * LanguageSwitch.jsx — The two-way language switch (فارسی / English) used wherever the language can be changed
 *
 * Choosing the other language remembers it and reloads the page (shared/i18n/localeStore.js).
 */

import React from 'react';
import { LOCALES, getLocale } from '../../utils/i18n.js';
import { chooseLocale } from './localeStore.js';

/**
 * @param {{ className?: string }} props
 */
export default function LanguageSwitch({ className = '' }) {
  const active = getLocale();
  return (
    <div className={`language-switch ${className}`.trim()} role="group" aria-label="Language / زبان" // i18n-ignore
    >
      {Object.values(LOCALES).map((locale) => (
        <button
          key={locale.code}
          type="button"
          lang={locale.code}
          className={`language-switch-option${locale.code === active ? ' is-active' : ''}`}
          aria-pressed={locale.code === active}
          onClick={() => locale.code !== active && chooseLocale(locale.code)}
        >
          {locale.label}
        </button>
      ))}
    </div>
  );
}
