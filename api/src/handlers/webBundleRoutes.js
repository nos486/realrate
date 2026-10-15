/**
 * webBundleRoutes.js — The Android app's web bundles, served from our own domain
 *
 * Endpoints:
 *   GET /api/app/web-bundle/manifest.json        — the manifest of the newest bundles
 *   GET /api/app/web-bundle/web-<build>-<flavor>.zip — one bundle
 *
 * The bundles live on the GitHub release `web-bundle` (.github/workflows/android.yml). The app
 * asks here first, so it gets them where GitHub is slow or blocked, and falls back to GitHub
 * (web/src/shared/native/webBundle.js). This only relays the files and keeps them in Cloudflare's
 * edge cache; the app checks each zip's signature against the certificate built into its APK, so
 * the relay cannot change what the app runs. No D1 or KV reads. Answered during maintenance too.
 */

import { AppError } from "../lib/AppError.js";
import { APP_RELEASE_REPO } from "../domain/appRelease.js";

export const WEB_BUNDLE_TAG = "web-bundle";
/** The manifest changes with every merge into main; a zip never changes under its name */
export const MANIFEST_TTL_SEC = 60;
export const BUNDLE_TTL_SEC = 7 * 24 * 60 * 60;

const FILE_RE = /^(manifest\.json|web-\d{1,9}-[a-z]{1,16}\.zip)$/;
const USER_AGENT = "RealRate-API (+https://realrate.geekio.org)";

/** The relayed file's name from the path; null when it is not one of the bundle files */
export function webBundleFileFromPath(pathname) {
  const name = String(pathname || "").replace(/^\/api\/app\/web-bundle\//, "");
  return FILE_RE.test(name) ? name : null;
}

/** The file's address on GitHub */
export function githubBundleUrl(name, repo = APP_RELEASE_REPO) {
  return `https://github.com/${repo}/releases/download/${WEB_BUNDLE_TAG}/${name}`;
}

/**
 * GET /api/app/web-bundle/<file>
 * @param {Request} request
 * @param {object} env
 */
export async function handleGetWebBundleFile(request, env) {
  const name = webBundleFileFromPath(new URL(request.url).pathname);
  if (!name) throw new AppError("File not found", 404, "NOT_FOUND");
  const isManifest = name === "manifest.json";
  const ttl = isManifest ? MANIFEST_TTL_SEC : BUNDLE_TTL_SEC;
  const contentType = isManifest ? "application/json" : "application/zip";

  const cache = globalThis.caches?.default || null;
  const key = new Request(`https://web-bundle.cache/${name}`);
  if (cache) {
    const hit = await cache.match(key).catch(() => null);
    if (hit) return hit;
  }

  const upstream = await fetch(githubBundleUrl(name, env?.APP_RELEASE_REPO || APP_RELEASE_REPO), {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
  });
  if (upstream.status === 404) throw new AppError("File not found", 404, "NOT_FOUND");
  if (!upstream.ok) throw new AppError("Bundle unavailable", 502, "UPSTREAM_ERROR");

  const body = await upstream.arrayBuffer();
  const response = new Response(body, {
    headers: { "Content-Type": contentType, "Cache-Control": `public, max-age=${ttl}` },
  });
  if (cache) await cache.put(key, response.clone()).catch(() => {});
  return response;
}
