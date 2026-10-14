/**
 * backExit.js — The Android Back button: step back through the pages, then press twice to leave
 *
 * Inside the app Back goes to the previous page while there is one (React Router keeps the
 * position in `history.state.idx`; a page opened from a widget or a notification starts at its own
 * entry). On the first page the first press shows a hint and the second one within
 * `EXIT_WINDOW_MS` closes the app.
 */

import { isNativeApp } from './nativeApp.js';
import { t } from '../../utils/i18n.js';

export const EXIT_WINDOW_MS = 2000;

/**
 * What a Back press does
 * @param {{ canGoBack: boolean, lastPressAt: number, now: number }} state
 * @returns {'back' | 'hint' | 'exit'}
 */
export function backAction({ canGoBack, lastPressAt, now }) {
  if (canGoBack) return 'back';
  return now - lastPressAt <= EXIT_WINDOW_MS ? 'exit' : 'hint';
}

/** Whether the router has an earlier page in this launch */
function routerCanGoBack() {
  const idx = window.history.state?.idx;
  return typeof idx === 'number' ? idx > 0 : window.history.length > 1;
}

/**
 * Take over the Back button (inside the app only)
 * @param {(message: string) => void} onHint shows «press again to exit»
 * @returns {() => void} stop
 */
export function startBackExit(onHint) {
  if (!isNativeApp()) return () => {};
  let stopped = false;
  let handle = null;
  let lastPressAt = 0;
  import('@capacitor/app').then(async ({ App }) => {
    if (stopped) return;
    handle = await App.addListener('backButton', () => {
      const now = Date.now();
      const action = backAction({ canGoBack: routerCanGoBack(), lastPressAt, now });
      if (action === 'back') {
        window.history.back();
        return;
      }
      if (action === 'exit') {
        App.exitApp();
        return;
      }
      lastPressAt = now;
      onHint(t('برای خروج یک بار دیگر «بازگشت» را بزنید'));
    });
    if (stopped) handle.remove();
  }).catch(() => {});
  return () => {
    stopped = true;
    handle?.remove();
  };
}
