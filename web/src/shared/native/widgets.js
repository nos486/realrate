/**
 * widgets.js — The Android home-screen widget from the app's side
 *
 * One widget (android/…/MarketWidgetProvider.java) shows the favourite items' prices and the AI
 * news, refreshed every ten minutes. It reads GET /api/widget by itself; here the user picks the
 * favourites (kept on the phone, empty = the default list), asks the launcher to place the widget,
 * and a tap on it opens the app on the right page (`ir.realrate.app://widget/<page>`).
 */

import { Widgets } from './nativePlugins.js';
import { isNativeApp } from './nativeApp.js';
import { WIDGET_MAX_ITEMS } from '../../utils/widgetFeed.js';
import { t } from '../../utils/i18n.js';

export { WIDGET_MAX_ITEMS, WIDGET_DEFAULT_ITEMS } from '../../utils/widgetFeed.js';

export const WIDGET_LINK = 'ir.realrate.app://widget/';

/** The widget a user can place: key and label */
export const WIDGET_KINDS = [
  { key: 'market', label: t('قیمت و اخبار هوشمند'), hint: t('قیمت دارایی‌های موردعلاقه‌ات و خبرهای هوش مصنوعی روی صفحه‌ی اصلی گوشی، با به‌روزرسانی هر ۱۰ دقیقه.') },
];

/** Where a widget link opens: the in-app path, or null when the link isn't a widget's */
export function widgetLinkPath(url) {
  const text = String(url || '');
  if (!text.startsWith(WIDGET_LINK)) return null;
  const page = text.slice(WIDGET_LINK.length).split(/[?#/]/)[0];
  return { news: '/news', prices: '/', settings: '/app-settings' }[page] ?? null;
}

/** The favourites chosen for the prices widget (book ids); empty: none chosen yet, the default list shows */
export async function getWidgetFavorites() {
  if (!isNativeApp()) return [];
  try {
    const { ids } = await Widgets.getFavorites();
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

/** Save the favourites (at most WIDGET_MAX_ITEMS) and refresh the widgets */
export async function setWidgetFavorites(ids) {
  const clean = [...new Set((ids || []).map(String).filter(Boolean))].slice(0, WIDGET_MAX_ITEMS);
  try {
    await Widgets.setFavorites({ ids: clean });
  } catch {
    // outside the app, or an old build without the plugin: nothing to update
  }
  return clean;
}

/** Ask the launcher to place the widget; false when the launcher can't be asked */
export async function requestPinWidget() {
  try {
    const { requested } = await Widgets.requestPin();
    return Boolean(requested);
  } catch {
    return false;
  }
}

/** Redraw the widgets from a fresh feed (the app was opened: the numbers on the home screen catch up) */
export function refreshWidgets() {
  if (!isNativeApp()) return;
  Widgets.refresh().catch(() => {});
}

let launchLinkHandled = false;

/**
 * Open the app's page when a widget is tapped (while the app runs, or launching it)
 * @param {(path: string) => void} onOpen
 * @returns {() => void} stop
 */
export function startWidgetLinks(onOpen) {
  if (!isNativeApp()) return () => {};
  let stopped = false;
  const handles = [];
  import('@capacitor/app').then(async ({ App }) => {
    if (stopped) return;
    handles.push(await App.addListener('appUrlOpen', ({ url }) => {
      const path = widgetLinkPath(url);
      if (path) onOpen(path);
    }));
    const launch = await App.getLaunchUrl().catch(() => null);
    const path = widgetLinkPath(launch?.url);
    if (!stopped && !launchLinkHandled && path) {
      launchLinkHandled = true;
      onOpen(path);
    }
  }).catch(() => {});
  return () => {
    stopped = true;
    handles.splice(0).forEach((h) => h.remove());
  };
}
