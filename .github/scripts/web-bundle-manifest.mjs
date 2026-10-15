/**
 * web-bundle-manifest.mjs — The manifest of the app's web bundles (updates without a new APK)
 *
 * Each run of .github/workflows/android.yml zips the app's pages (dist-app) of each build flavor,
 * signs every zip with the APK's own signing key, and publishes them with this manifest on the
 * moving GitHub release `web-bundle`. The app (WebBundlePlugin.java) reads the manifest, takes
 * the zip of its own flavor only when the native hash matches its own and the build is newer, and
 * checks the signature against the certificate built into it before using a single file.
 *
 *   node .github/scripts/web-bundle-manifest.mjs <build> <nativeHash> <dir> <out> <flavor>...
 *   (reads <dir>/web-<build>-<flavor>.zip and its .sig, the raw signature)
 */

import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The release tag the bundles live on, and the manifest's file name there */
export const WEB_BUNDLE_TAG = 'web-bundle';
export const WEB_BUNDLE_MANIFEST = 'manifest.json';

/** The zip of one flavor of one build */
export function bundleFileName(build, flavor) {
  return `web-${build}-${flavor}.zip`;
}

/**
 * The manifest
 * @param {{ build: number, nativeHash: string, bundles: Record<string, { size: number, signature: string }> }} input
 */
export function buildManifest({ build, nativeHash, bundles }, now = new Date()) {
  const n = Number(build);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`Bad build number: ${build}`);
  if (!/^[0-9a-f]{16}$/.test(String(nativeHash))) throw new Error(`Bad native hash: ${nativeHash}`);
  const out = {};
  for (const [flavor, info] of Object.entries(bundles || {})) {
    if (!info?.signature || !(info.size > 0)) throw new Error(`Bundle ${flavor} is incomplete`);
    out[flavor] = { file: bundleFileName(n, flavor), size: info.size, signature: info.signature };
  }
  if (!Object.keys(out).length) throw new Error('No bundles');
  return { build: n, version: `1.0.${n}`, nativeHash, publishedAt: now.toISOString(), bundles: out };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const [build, nativeHash, dir, outFile, ...flavors] = process.argv.slice(2);
  const bundles = {};
  for (const flavor of flavors) {
    const zip = join(dir, bundleFileName(build, flavor));
    bundles[flavor] = {
      size: statSync(zip).size,
      signature: readFileSync(`${zip}.sig`).toString('base64'),
    };
  }
  writeFileSync(outFile, `${JSON.stringify(buildManifest({ build, nativeHash, bundles }), null, 2)}\n`);
}
