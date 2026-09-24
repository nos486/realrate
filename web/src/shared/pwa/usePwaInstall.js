import { useCallback, useEffect, useState } from 'react';

// Captured at module load so the event isn't missed if it fires before any component mounts
let deferredPrompt = null;
const listeners = new Set();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    listeners.forEach((fn) => fn());
  });
}

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone);
}

/**
 * usePwaInstall — native "install app" prompt where the browser offers one (Chrome, Edge,
 * Android), plus flags for iOS (manual Add to Home Screen) and already-installed.
 */
export function usePwaInstall() {
  const [canPrompt, setCanPrompt] = useState(() => Boolean(deferredPrompt));

  useEffect(() => {
    const update = () => setCanPrompt(Boolean(deferredPrompt));
    listeners.add(update);
    return () => listeners.delete(update);
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false;
    const event = deferredPrompt;
    deferredPrompt = null;
    setCanPrompt(false);
    event.prompt();
    const choice = await event.userChoice.catch(() => null);
    return choice?.outcome === 'accepted';
  }, []);

  const isIos = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

  return { canPrompt, promptInstall, isIos, isInstalled: isStandalone() };
}
