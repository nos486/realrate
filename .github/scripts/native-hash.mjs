/**
 * native-hash.mjs — A fingerprint of the Android app's native side
 *
 * The app's pages can be updated without a new APK (a signed web bundle, see docs/en/ANDROID.md),
 * but only while the pages and the installed APK agree on the native side: its Java plugins,
 * manifest, resources, Gradle setup and Capacitor plugins. This hash covers exactly those — every
 * tracked file under web/android, web/capacitor.config.json and the @capacitor/* versions in
 * package-lock.json — so .github/workflows/android.yml builds a new APK only when it changes,
 * stamps it into the APK, and the app applies only web bundles built with the same hash.
 *
 *   node .github/scripts/native-hash.mjs      → prints the hash (16 hex characters)
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** The paths (relative to the repository root) whose tracked files are the native side */
export const NATIVE_PATHS = ['web/android', 'web/capacitor.config.json'];

/**
 * The hash of the native side
 * @param {string} trackedFiles `git ls-files -s` of NATIVE_PATHS (mode, blob id, stage, path)
 * @param {object} lock package-lock.json, parsed
 * @returns {string}
 */
export function nativeHash(trackedFiles, lock) {
  const files = String(trackedFiles || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
  const capacitor = Object.entries(lock?.packages || {})
    .filter(([path]) => /(^|\/)node_modules\/@capacitor\/[^/]+$/.test(path))
    .map(([path, info]) => `${path.replace(/^.*node_modules\//, '')}@${info?.version || ''}`)
    .sort();
  return createHash('sha256')
    .update([...files, '--', ...capacitor].join('\n'))
    .digest('hex')
    .slice(0, 16);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const tracked = execFileSync('git', ['ls-files', '-s', '--', ...NATIVE_PATHS], { encoding: 'utf8' });
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  process.stdout.write(`${nativeHash(tracked, lock)}\n`);
}
