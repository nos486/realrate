import { useState, useEffect } from 'react';

/**
 * useMediaQuery — subscribes to a CSS media query and re-renders on change.
 * @param {string} query - e.g. '(max-width: 768px)'
 * @returns {boolean}
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;

    const mql = window.matchMedia(query);
    const handleChange = (e) => setMatches(e.matches);

    setMatches(mql.matches);

    if (mql.addEventListener) {
      mql.addEventListener('change', handleChange);
      return () => mql.removeEventListener('change', handleChange);
    }
    // Safari <14 fallback
    mql.addListener(handleChange);
    return () => mql.removeListener(handleChange);
  }, [query]);

  return matches;
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
