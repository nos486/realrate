/**
 * Register the offline service worker (production builds only — in dev it would cache Vite's
 * unbundled modules and fight with hot reload).
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}
