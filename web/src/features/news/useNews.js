/**
 * useNews.js — News, kept fresh: read again every minute while the page is in view and when it
 * comes back into view. The last answer of each query is kept for this visit, so the home card
 * and the news page open with it at once.
 *
 *   useNews({ limit, page, category, important }) — one page of the list, with the total
 *   useNewsToday()                                — the analyst's card, today's top news and counts
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getNews, getNewsToday } from './newsApi.js';

const REFRESH_MS = 60_000;
const cache = new Map();

/** `load` now, every minute while visible, and on coming back into view */
function useFreshQuery(key, load) {
  const cached = cache.get(key);
  const [state, setState] = useState(() => ({ data: cached || null, loading: !cached, error: '', updatedAt: cached ? Date.now() : 0 }));
  const keyRef = useRef(key);

  const refresh = useCallback(async () => {
    const forKey = key;
    try {
      const data = await load();
      cache.set(forKey, data);
      if (keyRef.current === forKey) setState({ data, loading: false, error: '', updatedAt: Date.now() });
    } catch (err) {
      if (keyRef.current === forKey) setState((s) => ({ ...s, loading: false, error: err?.message || 'خبرها خوانده نشد.' }));
    }
    // `load` is built from the same values as `key`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    keyRef.current = key;
    const entry = cache.get(key);
    setState((s) => ({ data: entry || null, loading: !entry, error: '', updatedAt: entry ? s.updatedAt : 0 }));
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [key, refresh]);

  return { ...state, refresh, setData: (fn) => setState((s) => ({ ...s, data: s.data && fn(s.data) })) };
}

/**
 * @param {{ limit?: number, page?: number, category?: string, important?: boolean }} [opts]
 * @returns {{ items: object[], total: number, loading: boolean, error: string, updatedAt: number,
 *   refresh: () => Promise<void>, removeItem: (id: string) => void }}
 */
export function useNews({ limit = 20, page = 1, category = '', important = false } = {}) {
  const key = `list|${limit}|${page}|${category}|${important ? 1 : 0}`;
  const { data, loading, error, updatedAt, refresh, setData } = useFreshQuery(key, () => getNews({ limit, page, category, important }));

  const removeItem = useCallback((id) => {
    const drop = (d) => ({ ...d, items: (d.items || []).filter((n) => n.id !== id), total: Math.max(0, (d.total || 0) - 1) });
    setData(drop);
    for (const [k, v] of cache) if (k.startsWith('list|')) cache.set(k, drop(v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { items: data?.items || [], total: data?.total || 0, loading, error, updatedAt, refresh, removeItem };
}

/**
 * @returns {{ analysis: object|null, top: object[], stats: { total: number, important: number,
 *   byCategory: Record<string, number> }|null, loading: boolean }}
 */
export function useNewsToday() {
  const { data, loading } = useFreshQuery('today', () => getNewsToday());
  return { analysis: data?.analysis || null, top: data?.top || [], stats: data?.stats || null, loading };
}
