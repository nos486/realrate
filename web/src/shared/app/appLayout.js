/**
 * appLayout.js — Which frame the pages use: the app's (top bar, bottom navigation, bottom sheets —
 * shared/app/AppShell.jsx) or the website's (header, segmented tabs, footer)
 *
 * The app's frame is used inside the Android app and on a phone-sized screen in the browser, so
 * the mobile website and the Android app are one design built once. What only the Android app can
 * do (bank SMS, its own settings, installing an APK update, fingerprint unlock) still asks
 * isNativeApp() — this decides the layout only.
 *
 * html.is-app-layout follows it (styles/app-shell.css: the touch feel, the site header hidden).
 */

import { useSyncExternalStore } from 'react';
import { isNativeApp } from '../native/nativeApp.js';

/** A phone-sized screen (the same width the site's mobile styles start at) */
export const APP_LAYOUT_QUERY = '(max-width: 768px)';

const mediaQuery = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(APP_LAYOUT_QUERY) : null);

/** Whether the pages use the app's frame now */
export function isAppLayout() {
  return isNativeApp() || Boolean(mediaQuery()?.matches);
}

function subscribe(onChange) {
  const mq = mediaQuery();
  if (!mq || isNativeApp()) return () => {};
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/** The frame to use, following the screen's width (e.g. a phone turned, a window resized) */
export function useAppLayout() {
  return useSyncExternalStore(subscribe, isAppLayout, () => false);
}

/** Keep html.is-app-layout in step with the layout (once, on start) */
export function initAppLayoutClass() {
  if (typeof document === 'undefined') return;
  const apply = () => document.documentElement.classList.toggle('is-app-layout', isAppLayout());
  apply();
  subscribe(apply);
}
