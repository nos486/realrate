/**
 * routes.js — Single source of truth for app URLs
 *
 * `/` is the public landing page and `/app` is the app's home (market tab). Every other app
 * section keeps its own top-level route (`/portfolio`, `/loans`, `/incomes`, ...).
 * Build in-app links with appPath() instead of hard-coding them.
 */

export const LANDING_PATH = '/';
export const APP_BASE = '/app';

/**
 * Absolute path of an in-app route
 * @param {string} [subPath] - e.g. '/loans' or 'loans/123'; empty for the app home
 * @returns {string} e.g. '/loans', or '/app' for the home
 */
export function appPath(subPath = '') {
  const clean = String(subPath).replace(/^\/+/, '');
  return clean ? `/${clean}` : APP_BASE;
}

/**
 * Normalize an app pathname for tab matching: the app home (`/app`) becomes '/'
 * @param {string} pathname
 * @returns {string}
 */
export function getAppSubPath(pathname) {
  return pathname === APP_BASE || pathname === `${APP_BASE}/` ? '/' : pathname;
}

/**
 * Whether a pathname belongs to the authenticated app (anything but the public pages)
 * @param {string} pathname
 */
export function isAppPath(pathname) {
  return pathname !== LANDING_PATH && !pathname.startsWith('/p/');
}
