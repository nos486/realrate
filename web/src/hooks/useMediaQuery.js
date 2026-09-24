import { useCallback, useSyncExternalStore } from 'react';

/**
 * useMediaQuery — subscribes to a CSS media query and re-renders on change.
 * @param {string} query - e.g. '(max-width: 768px)'
 * @returns {boolean}
 */
export function useMediaQuery(query) {
  const subscribe = useCallback((onChange) => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
    const mql = window.matchMedia(query);
    if (mql.addEventListener) {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    // Safari <14 fallback
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, [query]);

  const getSnapshot = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false;

  // useSyncExternalStore reads the current value during render, so a query change or a
  // resize is reflected without an extra effect-driven render
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/**
 * useIsMobile — true at/below the app's standard mobile breakpoint (768px, matching
 * every other @media max-width used across the app's stylesheets).
 * @param {number} [breakpoint=768]
 * @returns {boolean}
 */
export function useIsMobile(breakpoint = 768) {
  return useMediaQuery(`(max-width: ${breakpoint}px)`);
}
