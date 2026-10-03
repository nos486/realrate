/**
 * RealRate service worker — offline app shell + last-known market prices.
 *
 * Caching policy:
 *  - Static pages (/, /features/*, /about, /faq): bypassed so crawlers/users get fresh static HTML.
 *    Offline fallback for / returns /spa.html so logged-in users can reach the offline app.
 *  - App shell (/spa.html, and SPA client routes): network-first, caching into SHELL_CACHE.
 *  - Static assets (/assets/*): cache first (immutable content hash).
 *  - Other same-origin static files (seo, icons, fonts, manifest): stale-while-revalidate.
 *  - Public market data (/api/prices/book, /api/prices): network first with fallback.
 *  - Private user data (auth, portfolios, transactions, etc.): NEVER cached.
 */

const VERSION = 'v2';
const SHELL_CACHE = `rr-shell-${VERSION}`;
const ASSET_CACHE = `rr-assets-${VERSION}`;
const STATIC_CACHE = `rr-static-${VERSION}`;
const MARKET_CACHE = `rr-market-${VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE, ASSET_CACHE, STATIC_CACHE, MARKET_CACHE];

const SHELL_URL = '/spa.html';
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

      // Precache the entry script/styles the shell references
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
    const p = url.pathname;

    // Static marketing & SEO pages: bypass SW completely when online so fresh static HTML is served
    if (
      p === '/' ||
      p === '/about' ||
      p === '/faq' ||
      p === '/features' ||
      p.startsWith('/features/') ||
      p === '/404.html'
    ) {
      // In offline mode, if navigating to '/', fallback to the cached shell so logged-in users can open the app
      if (p === '/') {
        event.respondWith(networkFirstLandingWithShellFallback(request));
      }
      return;
    }

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

async function networkFirstLandingWithShellFallback(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(SHELL_URL);
    return cached || Response.error();
  }
}

async function networkFirstShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(request);
    // Only cache if successful response from an SPA navigation
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
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
}

// ── Sealed Web Push Notifications (Zero-Knowledge) ─────────────────────────

function base64ToUint8(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function getSealingKeyFromIdb() {
  return new Promise((resolve) => {
    if (!('indexedDB' in self)) return resolve(null);
    const req = indexedDB.open('realrate_push_keystore', 1);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('keys')) {
        db.close();
        return resolve(null);
      }
      try {
        const tx = db.transaction('keys', 'readonly');
        const store = tx.objectStore('keys');
        const getReq = store.get('device_sealing_key');
        getReq.onsuccess = () => {
          db.close();
          resolve(getReq.result || null);
        };
        getReq.onerror = () => {
          db.close();
          resolve(null);
        };
      } catch {
        db.close();
        resolve(null);
      }
    };
  });
}

async function handlePushEvent(event) {
  let title = 'یادآوری سررسید';
  let options = {
    body: 'یک سررسید امروز دارید',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { path: '/' },
  };

  try {
    const rawText = event.data ? event.data.text() : '';
    if (rawText) {
      const parsed = JSON.parse(rawText);
      if (parsed && parsed.iv && parsed.data) {
        const key = await getSealingKeyFromIdb();
        if (key) {
          const iv = base64ToUint8(parsed.iv);
          const data = base64ToUint8(parsed.data);
          const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
          const payload = JSON.parse(new TextDecoder().decode(decrypted));
          if (payload.title) title = payload.title;
          if (payload.body) options.body = payload.body;
          if (payload.path) options.data = { path: payload.path };
          if (payload.tag) options.tag = payload.tag;
        }
      }
    }
  } catch (err) {
    // Key missing or decryption failed — fallback generic options remain
  }

  return self.registration.showNotification(title, options);
}

self.addEventListener('push', (event) => {
  event.waitUntil(handlePushEvent(event));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetPath = event.notification.data?.path || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url && 'focus' in client) {
          if (typeof client.navigate === 'function') {
            client.navigate(targetPath);
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetPath);
      }
    })
  );
});
