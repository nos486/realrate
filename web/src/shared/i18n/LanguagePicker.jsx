/**
 * LanguagePicker.jsx — The first-launch screen that asks for the language (فارسی / English)
 *
 * Shown before the app on a device that never chose (shared/i18n/localeStore.js). It is written
 * in both languages on purpose, since the choice is what tells the app which one to use.
 */

import React from 'react';
import { LOCALES } from '../../utils/i18n.js';
import { chooseLocale } from './localeStore.js';

export default function LanguagePicker() {
  return (
    <main className="language-picker" dir="ltr">
      <div className="language-picker-card">
        <img className="language-picker-logo" src="/icons/apple-touch-icon.png" alt="" width="64" height="64" />
        <h1 className="language-picker-title">RealRate</h1>
        <p className="language-picker-hint">
          <span lang="fa" dir="rtl">زبان خود را انتخاب کنید</span>{/* i18n-ignore */}
          <span lang="en">Choose your language</span>
        </p>
        <div className="language-picker-options">
          {Object.values(LOCALES).map((locale) => (
            <button
              key={locale.code}
              type="button"
              lang={locale.code}
              dir={locale.dir}
              className="language-picker-option"
              onClick={() => chooseLocale(locale.code)}
            >
              {locale.label}
            </button>
          ))}
        </div>
        <p className="language-picker-note">
          <span lang="fa" dir="rtl">بعداً از تنظیمات قابل تغییر است.</span>{/* i18n-ignore */}
          <span lang="en">You can change this later in settings.</span>
        </p>
      </div>
    </main>
  );
}
