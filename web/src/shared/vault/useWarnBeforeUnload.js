import { useEffect } from 'react';

/** Ask the browser to confirm closing or reloading the tab while data is being converted */
export function useWarnBeforeUnload(active) {
  useEffect(() => {
    if (!active) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active]);
}
