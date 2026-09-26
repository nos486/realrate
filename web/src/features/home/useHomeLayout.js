import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/index.js';
import { sanitizeHomeLayout } from '../../utils/homeLayout.js';
import { getHomeLayout, saveHomeLayout } from './homeApi.js';
import { normalizeLayoutIds } from './homeLayoutModel.js';

const CACHE_PREFIX = 'realrate_home_layout_';
const SAVE_DELAY_MS = 700;

function readCache(userId) {
  try {
    return sanitizeHomeLayout(JSON.parse(localStorage.getItem(CACHE_PREFIX + userId) || 'null'));
  } catch {
    return null;
  }
}

function writeCache(userId, layout) {
  try {
    if (layout) localStorage.setItem(CACHE_PREFIX + userId, JSON.stringify(layout));
    else localStorage.removeItem(CACHE_PREFIX + userId);
  } catch {
    // Storage full or blocked — the server copy still applies
  }
}

/**
 * The signed-in user's home page layout.
 * `layout` is null while the user hasn't customized anything (the default home page applies).
 * Changes show immediately, are cached locally, and saved to the server shortly after.
 */
export function useHomeLayout() {
  const { user } = useAuth();
  const userId = user?.id || null;
  const [state, setState] = useState(() => ({ userId, layout: userId ? readCache(userId) : null }));
  const [saveError, setSaveError] = useState('');
  const timerRef = useRef(null);
  const pendingRef = useRef(undefined);

  // A different user (or first sign-in) starts from their own cached copy
  const layout = state.userId === userId ? state.layout : readCache(userId);

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    getHomeLayout()
      .then((res) => {
        // Never overwrite an edit the user made while this request was in flight
        if (cancelled || pendingRef.current !== undefined) return;
        const stored = sanitizeHomeLayout(res?.layout);
        // A layout saved with older asset ids is stored again with the price book's ids, once
        const serverLayout = normalizeLayoutIds(stored);
        writeCache(userId, serverLayout);
        setState({ userId, layout: serverLayout });
        if (serverLayout && JSON.stringify(serverLayout) !== JSON.stringify(stored)) {
          saveHomeLayout(serverLayout).catch(() => {
            // Stored again the next time it loads
          });
        }
      })
      .catch(() => {
        // Offline or older API: keep the cached layout
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const flush = useCallback(async () => {
    clearTimeout(timerRef.current);
    const next = pendingRef.current;
    if (next === undefined) return;
    pendingRef.current = undefined;
    try {
      await saveHomeLayout(next);
      setSaveError('');
    } catch (err) {
      setSaveError(err?.status === 404 ? '' : err.message || 'ذخیره چیدمان صفحه اصلی ناموفق بود.');
    }
  }, []);

  // Save whatever is pending when leaving the page
  useEffect(() => () => {
    if (pendingRef.current !== undefined) flush();
  }, [flush]);

  const setLayout = useCallback((next) => {
    const clean = next ? sanitizeHomeLayout(next) : null;
    setState({ userId, layout: clean });
    writeCache(userId, clean);
    pendingRef.current = clean;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, SAVE_DELAY_MS);
  }, [userId, flush]);

  return {
    layout,
    isCustomized: Boolean(layout),
    setLayout,
    resetLayout: () => setLayout(null),
    saveError,
  };
}
