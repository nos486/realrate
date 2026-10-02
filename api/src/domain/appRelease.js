/**
 * appRelease.js — The Android app's latest release, for the app's own update check
 *
 * Every merge into main publishes a signed APK as a GitHub release tagged `v<versionName>`
 * (.github/workflows/android.yml) with the file `realrate.apk`. The server reads the latest one
 * (handlers/appUpdateRoutes.js) and the app compares it with its own version name
 * (web/src/shared/native/appUpdate.js).
 */

export const APP_RELEASE_REPO = 'nos486/realrate';
export const APP_APK_NAME = 'realrate.apk';

const VERSION_RE = /^\d{1,6}(\.\d{1,6}){0,3}$/;
const MAX_NOTES = 4000;

/** "v1.0.47" → "1.0.47"; '' when it is not a version */
export function versionFromTag(tag) {
  const version = String(tag || '').trim().replace(/^v/i, '');
  return VERSION_RE.test(version) ? version : '';
}

/** The APK's address in a release (always the versioned file, never the moving "latest" one) */
export function apkUrlFor(repo, tag) {
  return `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${APP_APK_NAME}`;
}

/**
 * The GitHub API's `releases/latest` answer → what the app needs
 * @returns {{ version: string, tag: string, url: string, size: number, notes: string, publishedAt: string }|null}
 *   null when it is not a published release with the APK
 */
export function parseGithubRelease(release, repo = APP_RELEASE_REPO) {
  if (!release || typeof release !== 'object' || release.draft || release.prerelease) return null;
  const tag = String(release.tag_name || '');
  const version = versionFromTag(tag);
  if (!version) return null;
  const asset = (Array.isArray(release.assets) ? release.assets : []).find((a) => a?.name === APP_APK_NAME);
  if (!asset) return null;
  return {
    version,
    tag,
    url: apkUrlFor(repo, tag),
    size: Number(asset.size) || 0,
    notes: String(release.body || '').slice(0, MAX_NOTES),
    publishedAt: String(release.published_at || ''),
  };
}

/**
 * The tag from the redirect of github.com/<repo>/releases/latest (…/releases/tag/v1.0.47):
 * the fallback when the API refuses (its rate limit), without notes or size
 */
export function releaseFromLatestRedirect(location, repo = APP_RELEASE_REPO) {
  const match = String(location || '').match(/\/releases\/tag\/([^/?#]+)/);
  if (!match) return null;
  const tag = decodeURIComponent(match[1]);
  const version = versionFromTag(tag);
  if (!version) return null;
  return { version, tag, url: apkUrlFor(repo, tag), size: 0, notes: '', publishedAt: '' };
}
