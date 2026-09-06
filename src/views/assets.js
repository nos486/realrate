/**
 * assets.js — Static assets: SVG logo, favicon, PWA manifest, service worker
 */

export const REALRATE_SVG_LOGO = `<svg width="34" height="34" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="20" cy="20" r="18" fill="url(#logo_grad_bg)" stroke="url(#logo_grad_stroke)" stroke-width="1.8" />
  <circle cx="20" cy="20" r="13.5" stroke="rgba(251, 191, 36, 0.35)" stroke-width="1" stroke-dasharray="2 2" />
  <path d="M12 24L17 19L21 22L28 14" stroke="url(#logo_grad_gold)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M24 14H28V18" stroke="url(#logo_grad_gold)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="20" cy="20" r="2.8" fill="url(#logo_grad_gold)"/>
  <defs>
    <linearGradient id="logo_grad_bg" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
      <stop stop-color="#f59e0b" stop-opacity="0.3"/>
      <stop offset="1" stop-color="#b45309" stop-opacity="0.12"/>
    </linearGradient>
    <linearGradient id="logo_grad_stroke" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
      <stop stop-color="#fbbf24"/>
      <stop offset="1" stop-color="#d97706"/>
    </linearGradient>
    <linearGradient id="logo_grad_gold" x1="12" y1="14" x2="28" y2="24" gradientUnits="userSpaceOnUse">
      <stop stop-color="#fef08a"/>
      <stop offset="0.5" stop-color="#f59e0b"/>
      <stop offset="1" stop-color="#d97706"/>
    </linearGradient>
  </defs>
</svg>`;

export const REALRATE_FAVICON_DATA_URI =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Ccircle cx='20' cy='20' r='18' fill='%230a0d14' stroke='%23f59e0b' stroke-width='2.5'/%3E%3Cpath d='M12 24L17 19L21 22L28 14' stroke='%23fbbf24' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M24 14H28V18' stroke='%23fbbf24' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3Ccircle cx='20' cy='20' r='2.8' fill='%23fbbf24'/%3E%3C/svg%3E";

/**
 * Generate the PWA Web App Manifest JSON response
 * @returns {Response}
 */
export function getManifestResponse() {
  const manifest = {
    name: "RealRate — تحلیل قیمت طلا، سکه و ارز",
    short_name: "RealRate",
    description: "محاسبه قیمت واقعی طلا، سکه و ارزهای مطرح جهان بر اساس دلار و انس جهانی",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0d14",
    theme_color: "#0a0d14",
    orientation: "portrait-primary",
    icons: [
      {
        src: REALRATE_FAVICON_DATA_URI,
        sizes: "192x192 512x512",
        type: "image/svg+xml",
        purpose: "any maskable",
      },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
}

/**
 * Generate the PWA Service Worker JS response
 * @returns {Response}
 */
export function getServiceWorkerResponse() {
  const swScript = `
    const CACHE_NAME = 'realrate-cache-v1';
    const ASSETS = ['/', '/manifest.json'];

    self.addEventListener('install', (evt) => {
      evt.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
      self.skipWaiting();
    });

    self.addEventListener('activate', (evt) => {
      evt.waitUntil(
        caches.keys().then((keys) => Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        ))
      );
      self.clients.claim();
    });

    self.addEventListener('fetch', (evt) => {
      if (evt.request.method !== 'GET') return;
      evt.respondWith(fetch(evt.request).catch(() => caches.match(evt.request)));
    });
  `;
  return new Response(swScript, {
    headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
}
