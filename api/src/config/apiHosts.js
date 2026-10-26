/**
 * apiHosts.js — Which API a frontend talks to: each site host has its own API host, so a visitor
 * on realrate.ir never depends on geekio.org (and the other way round)
 *
 * One table, read by the web client (httpClient.js API_BASE). A new domain is a row. Hosts not in
 * the table (local development, Pages previews) keep the build's VITE_API_URL. The Android app (every
 * build) always talks to NATIVE_API_ORIGIN; its home-screen widgets use the same host (WidgetFeed.java).
 *
 * Shared with the web client through a symlink.
 */

/** The API the production build uses when the host has no row */
export const DEFAULT_API_ORIGIN = 'https://realrate-api.geekio.org';

/** The Android app's API, whatever the build's VITE_API_URL */
export const NATIVE_API_ORIGIN = 'https://api.realrate.ir';

/** Site hostname → its API origin, matched exactly */
export const API_BY_HOST = {
  'realrate.ir': 'https://api.realrate.ir',
  'www.realrate.ir': 'https://api.realrate.ir',
  'realrate.geekio.org': 'https://realrate-api.geekio.org',
};

/**
 * The API base URL for this page, without a trailing slash.
 * @param {object} opts
 * @param {string} [opts.hostname] the page's hostname (window.location.hostname)
 * @param {boolean} [opts.native] running inside the Android app: always NATIVE_API_ORIGIN
 * @param {string} [opts.envUrl] the build's VITE_API_URL
 * @param {boolean} [opts.prod] a production build
 * @param {boolean} [opts.browser] running in a browser ('' means same origin, the Vite proxy)
 * @returns {string}
 */
export function resolveApiBase({ hostname, native = false, envUrl, prod = false, browser = true } = {}) {
  if (native) return NATIVE_API_ORIGIN;
  const mapped = hostname ? API_BY_HOST[String(hostname).toLowerCase()] : null;
  const base = mapped || envUrl || (prod ? DEFAULT_API_ORIGIN : (browser ? '' : 'http://localhost:8787'));
  return base.replace(/\/$/, '');
}
