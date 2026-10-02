/**
 * AppSuggestBanner.jsx — On an Android phone's browser: «اپ اندروید RealRate» — easier and faster
 *
 * Shown on the website (never inside the app) when the browser is on Android, with the direct
 * download of the latest signed APK (GitHub releases) and the install guide (/android). «×» hides
 * it for SNOOZE_DAYS in this browser.
 */

import React, { useState } from 'react';
import { Smartphone, Download, X } from 'lucide-react';
import { isNativeApp } from '../native/nativeApp.js';

export const ANDROID_APK_URL = 'https://github.com/nos486/realrate/releases/latest/download/realrate.apk';
const DISMISS_KEY = 'realrate_app_suggest_dismissed';
const SNOOZE_DAYS = 14;
const DAY = 24 * 60 * 60 * 1000;

/** An Android phone's browser, not the app itself, and not hidden lately */
export function shouldSuggestApp({ userAgent = globalThis.navigator?.userAgent || '', now = Date.now(), native = isNativeApp() } = {}) {
  if (native || !/android/i.test(userAgent)) return false;
  try {
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY)) || 0;
    return now - dismissedAt > SNOOZE_DAYS * DAY;
  } catch {
    return true;
  }
}

export default function AppSuggestBanner() {
  const [visible, setVisible] = useState(() => shouldSuggestApp());
  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Hidden for this visit only
    }
    setVisible(false);
  };

  return (
    <div className="app-suggest-banner" role="complementary" aria-label="اپ اندروید RealRate">
      <span className="app-suggest-icon"><Smartphone size={20} /></span>
      <div className="app-suggest-text">
        <strong>اپ اندروید RealRate راحت‌تر و سریع‌تر است</strong>
        <span>باز شدن فوری و کار بدون اینترنت، ثبت خودکار هزینه از پیامک بانک، ورود با اثر انگشت</span>
      </div>
      <div className="app-suggest-actions">
        <a className="ui-btn ui-btn-primary ui-btn-sm" href={ANDROID_APK_URL} rel="noopener">
          <Download size={14} /> دانلود اپ
        </a>
        <a className="app-suggest-guide" href="/android">راهنمای نصب</a>
      </div>
      <button type="button" className="app-suggest-close" onClick={dismiss} aria-label="بستن">
        <X size={16} />
      </button>
    </div>
  );
}
