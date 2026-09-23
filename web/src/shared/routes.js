/**
 * routes.js — Single source of truth for where the app lives
 *
 * `/` is the public landing page; the authenticated application is mounted under APP_BASE.
 * Build every in-app link with appPath() instead of hard-coding "/app/...".
 */

export const LANDING_PATH = '/';
export const APP_BASE = '/app';

/**
 * Absolute path of an in-app route
 * @param {string} [subPath] - e.g. '/loans' or 'loans/123'; empty for the app home
 * @returns {string} e.g. '/app/loans'
 */
export function appPath(subPath = '') {
  const clean = String(subPath).replace(/^\/+/, '');
  return clean ? `${APP_BASE}/${clean}` : APP_BASE;
}

/**
 * The part of a pathname after APP_BASE, always starting with "/"
 * @param {string} pathname - e.g. '/app/loans/123'
 * @returns {string} e.g. '/loans/123' ('/' for the app home)
 */
export function getAppSubPath(pathname) {
  if (pathname === APP_BASE) return '/';
  return pathname.startsWith(`${APP_BASE}/`) ? pathname.slice(APP_BASE.length) : pathname;
}
