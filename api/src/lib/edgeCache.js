/**
 * edgeCache.js — A public JSON answer kept in Cloudflare's edge cache (caches.default) for a few
 * seconds, so many visitors asking the same thing share one database read per data center
 *
 *   const body = await edgeCachedJson(`https://news.cache/list?${query}`, 30, () => readIt());
 *
 * Only for answers that are the same for everyone (never per-user data). `build` returning null
 * (couldn't read now) is not kept. Without the cache API (tests, local dev) it just builds.
 */

/**
 * @param {string} key - a URL naming the answer (its own made-up host, so it never clashes with a real one)
 * @param {number} ttlSec
 * @param {() => Promise<object|null>} build
 * @returns {Promise<object|null>}
 */
export async function edgeCachedJson(key, ttlSec, build) {
  const cache = globalThis.caches?.default || null;
  const request = new Request(key);
  if (cache) {
    const hit = await cache.match(request).catch(() => null);
    if (hit) return hit.json();
  }
  const body = await build();
  if (cache && body !== null && body !== undefined) {
    const stored = new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${ttlSec}` },
    });
    await cache.put(request, stored).catch(() => {});
  }
  return body;
}
