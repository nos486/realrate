/**
 * RealRate service worker — offline app shell + last-known market prices.
 *
 * Caching policy (deliberately narrow):
 *  - Page navigations: network first, falling back to the cached app shell (index.html).
 *  - Hashed build assets (/assets/*): cache first; they are immutable per build.
 *  - Other same-origin static files (fonts, icons, manifest): stale-while-revalidate.
 *  - Public market data only (/api/prices/book, and the older /api/prices, /api/market/items):
 *    network first, falling back to the last response so the calculator and rates still work
 *    offline.
 *  - Everything else — auth, portfolios, transactions, loans, incomes — is never cached, so
 *    personal financial data is not persisted by the service worker.
 */

const VERSION = 'v1';
const SHELL_CACHE = `rr-shell-${VERSION}`;
const ASSET_CACHE = `rr-assets-${VERSION}`;
const STATIC_CACHE = `rr-static-${VERSION}`;
const MARKET_CACHE = `rr-market-${VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE, ASSET_CACHE, STATIC_CACHE, MARKET_CACHE];

const SHELL_URL = '/index.html';
const MAX_ASSET_ENTRIES = 120;
const PUBLIC_MARKET_PATHS = [
  '/api/prices/book', '/api/v1/prices/book',
  '/api/prices', '/api/v1/prices', '/api/market/items', '/api/v1/market/items',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const res = await fetch(SHELL_URL, { cache: 'no-cache' });
      if (!res.ok) return;
      await cache.put(SHELL_URL, res.clone());

      // Also precache the entry script/styles the shell references, so the first offline
      // launch works even if the user never navigated while the worker was active.
      const html = await res.text();
      const assetUrls = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
      if (assetUrls.length) {
        const assets = await caches.open(ASSET_CACHE);
        await Promise.all(assetUrls.map((url) => assets.add(url).catch(() => {})));
      }
    })().then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith('rr-') && !CURRENT_CACHES.includes(name)).map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (request.mode === 'navigate' && sameOrigin) {
    event.respondWith(networkFirstShell(request));
    return;
  }

  if (PUBLIC_MARKET_PATHS.includes(url.pathname) && !url.searchParams.has('force')) {
    event.respondWith(networkFirst(request, MARKET_CACHE));
    return;
  }

  if (!sameOrigin || url.pathname.startsWith('/api/')) return; // not ours to cache

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  if (url.pathname === '/sw.js') return;
  event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
});

async function networkFirstShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(request);
    // SPA: every route serves index.html, so one shell entry covers all of them
    if (res.ok) cache.put(SHELL_URL, res.clone());
    return res;
  } catch {
    const cached = await cache.match(SHELL_URL);
    return cached || Response.error();
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request);
    return cached || Response.error();
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) {
    await cache.put(request, res.clone());
    trimCache(cacheName, MAX_ASSET_ENTRIES);
  }
  return res;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  // Oldest first (insertion order): old builds' chunks go before the current ones
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
}
