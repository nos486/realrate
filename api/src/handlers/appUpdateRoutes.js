/**
 * appUpdateRoutes.js — The Android app's update check
 *
 * Endpoints:
 *   GET /api/app/latest — The latest published APK: { release: { version, url, size, notes, publishedAt } | null }
 *
 * Read from GitHub releases (domain/appRelease.js) and kept in KV for a few minutes, so every
 * app opening does not reach GitHub. When GitHub does not answer, the last known release is
 * served. Public, and answered during maintenance too (an update may be the fix).
 */

import { jsonResponse } from "../lib/helpers.js";
import { logger } from "../lib/logger.js";
import { getKv } from "../repositories/kvCache.repository.js";
import { APP_RELEASE_REPO, parseGithubRelease, releaseFromLatestRedirect } from "../domain/appRelease.js";

const KV_KEY = "app:latest_release";
export const RELEASE_CACHE_MS = 10 * 60 * 1000;
const USER_AGENT = "RealRate-API (+https://realrate.ir)";

async function fetchFromApi(env, repo) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": USER_AGENT };
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers });
  if (res.status === 404) return null; // no release yet
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  return parseGithubRelease(await res.json(), repo);
}

async function fetchFromRedirect(repo) {
  const res = await fetch(`https://github.com/${repo}/releases/latest`, {
    redirect: "manual",
    headers: { "User-Agent": USER_AGENT },
  });
  const release = releaseFromLatestRedirect(res.headers.get("Location"), repo);
  if (!release) throw new Error(`GitHub releases/latest ${res.status}`);
  return release;
}

/** The latest release, from GitHub (the API, else the page's redirect) */
export async function fetchLatestRelease(env, repo = env?.APP_RELEASE_REPO || APP_RELEASE_REPO) {
  try {
    return await fetchFromApi(env, repo);
  } catch (err) {
    logger.warn("[AppUpdate] GitHub API failed, trying the releases page:", { error: err.message });
    return fetchFromRedirect(repo);
  }
}

/** The latest release, from KV while fresh; the last known one when GitHub fails */
export async function getLatestRelease(env, now = Date.now()) {
  const kv = getKv(env);
  let cached = null;
  try {
    cached = kv ? await kv.get(KV_KEY, "json") : null;
  } catch {
    cached = null;
  }
  if (cached && now - Number(cached.fetchedAt || 0) < RELEASE_CACHE_MS) return cached.release ?? null;

  try {
    const release = await fetchLatestRelease(env);
    if (kv) await kv.put(KV_KEY, JSON.stringify({ fetchedAt: now, release })).catch(() => {});
    return release;
  } catch (err) {
    logger.warn("[AppUpdate] latest release unavailable:", { error: err.message });
    return cached?.release ?? null;
  }
}

export async function handleGetLatestAppRelease(request, env) {
  const release = await getLatestRelease(env);
  return jsonResponse({ success: true, release }, 200, request, { "Cache-Control": "public, max-age=300" });
}
