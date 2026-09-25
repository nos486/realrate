/**
 * routes.js — Single source of truth for app URLs
 *
 * `/` is the public landing page and `/app` is the app's home (market tab). Every other app
 * section keeps its own top-level route (`/portfolio`, `/loans`, `/incomes`, ...).
 * Build in-app links with appPath() instead of hard-coding them.
 */

export const LANDING_PATH = '/';
export const APP_BASE = '/app';

/** Sign-in pages (public, outside the app) */
export const AUTH_PATHS = {
  login: '/login',
  register: '/register',
  forgot: '/forgot-password',
  reset: '/reset-password',
  verify: '/verify-email',
};
const AUTH_PATH_SET = new Set(Object.values(AUTH_PATHS));

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
  return pathname !== LANDING_PATH && !pathname.startsWith('/p/') && !AUTH_PATH_SET.has(pathname);
}

const POST_LOGIN_PATH_KEY = 'realrate_post_login_path';

/**
 * Remember an in-app page a guest tried to open, so login can return there
 * @param {string} path - pathname + search
 */
export function rememberPostLoginPath(path) {
  if (!path || !path.startsWith('/') || path.startsWith('//') || !isAppPath(path.split('?')[0])) return;
  try {
    sessionStorage.setItem(POST_LOGIN_PATH_KEY, path);
  } catch {}
}

/**
 * Read and clear the remembered in-app page
 * @returns {string|null}
 */
export function takePostLoginPath() {
  try {
    const path = sessionStorage.getItem(POST_LOGIN_PATH_KEY);
    sessionStorage.removeItem(POST_LOGIN_PATH_KEY);
    if (path && path.startsWith('/') && !path.startsWith('//') && isAppPath(path.split('?')[0])) return path;
  } catch {}
  return null;
}
