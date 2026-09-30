/**
 * clientInfo.js — Which client a request comes from: the Android app (and its version) or the site
 *
 * Every request of the web client carries `X-RealRate-Client`: `android/<version>` from the
 * Android app, `web` from the site. The server records it per user (user_clients, client_activity)
 * so the admin panel can tell who uses the app, how actively, and on which version. The header is
 * the client's own word — good for counting, never for granting anything.
 * Shared with the web client through a symlink.
 */

export const CLIENT_HEADER = 'X-RealRate-Client';
export const CLIENT_PLATFORMS = ['android', 'web'];

const VERSION_RE = /^\d{1,6}(\.\d{1,6}){0,3}$/;

/**
 * The header's value
 * @param {'android'|'web'} platform
 * @param {string} [appVersion] the app's version name (Android only), e.g. "1.0.47"
 */
export function formatClientHeader(platform, appVersion = '') {
  const version = String(appVersion || '').trim();
  return platform === 'android' && VERSION_RE.test(version) ? `android/${version}` : platform;
}

/**
 * Read the header
 * @param {string|null|undefined} value
 * @returns {{ platform: 'android'|'web', appVersion: string }|null} null when missing or unknown
 */
export function parseClientHeader(value) {
  const [platform, version = ''] = String(value || '').trim().toLowerCase().split('/', 2);
  if (!CLIENT_PLATFORMS.includes(platform)) return null;
  return { platform, appVersion: platform === 'android' && VERSION_RE.test(version) ? version : '' };
}

/**
 * Compare two version names numerically ("1.0.10" after "1.0.9"); '' sorts first
 * @returns {number} negative, zero or positive
 */
export function compareVersions(a = '', b = '') {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}
