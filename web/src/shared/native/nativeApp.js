/**
 * nativeApp.js — Running inside the Android app (Capacitor)
 *
 * The app is this same web app, bundled into an Android shell (web/android, see docs/ANDROID.md).
 * Here is what differs there:
 *  - no service worker (the pages are already on the phone)
 *  - the status bar and splash screen take the app's colors
 *  - links meant for other people (a shared portfolio) point at the website, not at the app's
 *    own local origin
 *  - Google sign-in runs in the phone's browser (Google refuses it inside a WebView) and comes
 *    back through the app's link with a one-time code (api/src/lib/appAuth.js)
 * The native plugins are loaded only inside the app, so the website never downloads them.
 */

import { Capacitor } from '@capacitor/core';
import { API_BASE } from '../api/httpClient.js';

export const PUBLIC_SITE_ORIGIN = 'https://realrate.ir';
const APP_AUTH_LINK = 'ir.realrate.app://auth';
const VERIFIER_KEY = 'realrate_app_signin_verifier';

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

/** Origin for links shared with others: the website (inside the app, the page's origin is local) */
export function publicOrigin() {
  return isNativeApp() ? PUBLIC_SITE_ORIGIN : window.location.origin;
}

/** Colors and splash screen, once on start (inside the app only) */
export async function initNativeApp() {
  if (!isNativeApp()) return;
  try {
    const [{ StatusBar, Style }, { SplashScreen }] = await Promise.all([
      import('@capacitor/status-bar'),
      import('@capacitor/splash-screen'),
    ]);
    await StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    await StatusBar.setBackgroundColor({ color: '#06080d' }).catch(() => {});
    await SplashScreen.hide().catch(() => {});
  } catch (err) {
    console.warn('Native app setup failed:', err);
  }
}

function base64Url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Google sign-in from the app: opens it in the phone's browser; the answer comes back via the app's link */
export async function startNativeGoogleLogin() {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  try {
    localStorage.setItem(VERIFIER_KEY, verifier);
  } catch {}
  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url: `${API_BASE}/api/auth/google/login?app_challenge=${challenge}`, toolbarColor: '#06080d' });
}

/** The verifier kept for the sign-in under way (used once) */
export function takeNativeLoginVerifier() {
  try {
    const verifier = localStorage.getItem(VERIFIER_KEY);
    localStorage.removeItem(VERIFIER_KEY);
    return verifier || '';
  } catch {
    return '';
  }
}

/** `{ code }` or `{ error }` from the app's sign-in link, or null for any other link */
export function parseNativeAuthLink(link) {
  if (!link || !String(link).startsWith(APP_AUTH_LINK)) return null;
  try {
    const params = new URL(link).searchParams;
    const code = params.get('code');
    if (code) return { code };
    return { error: params.get('auth_error') || 'ورود با گوگل کامل نشد.' };
  } catch {
    return null;
  }
}

/**
 * Call `onReturn({ code } | { error })` when Google sign-in comes back to the app (the app was
 * open, or Android restarted it for the link)
 * @returns {() => void} stops listening
 */
export function listenForNativeAuthReturn(onReturn) {
  if (!isNativeApp()) return () => {};
  let stopped = false;
  let handle = null;
  import('@capacitor/app').then(async ({ App }) => {
    if (stopped) return;
    handle = await App.addListener('appUrlOpen', ({ url }) => {
      const result = parseNativeAuthLink(url);
      if (result) onReturn(result);
    });
    const launch = await App.getLaunchUrl().catch(() => null);
    const result = parseNativeAuthLink(launch?.url);
    if (result && !stopped) onReturn(result);
  }).catch((err) => console.warn('App link listener failed:', err));
  return () => {
    stopped = true;
    handle?.remove();
  };
}
