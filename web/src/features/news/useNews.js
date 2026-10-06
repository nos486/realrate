/**
 * useNews.js — News, read when first shown and then only with the open tab's refresh (the
 * header's button, the window getting focus again: shared/refresh/pageRefresh.js, scope `news`)
 * — no timer. The last answer of each query is kept for this visit, so the home card and the
 * news page open with it at once, without asking the server again.
 *
 *   useNews({ limit, page, category, important }) — one page of the list, with the total
 *   useNewsToday()                                — the analyst's card, today's and the week's top news
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getNews, getNewsToday } from './newsApi.js';
import { useRefreshHandler } from '../../shared/refresh/pageRefresh.js';

const cache = new Map();
// Queries on screen now: a refresh reads these again and forgets the others' answers, so another
// page or filter opened later is read fresh rather than shown from before the refresh
const shown = new Map(); // key → number of hooks showing it

/** For tests */
export function clearNewsCache() {
  cache.clear();
  shown.clear();
}

/** `load` when there is no answer for `key` yet, and again on the open tab's refresh */
function useNewsQuery(key, load) {
  const cached = cache.get(key);
  const [state, setState] = useState(() => ({ data: cached || null, loading: !cached, error: '' }));
  const keyRef = useRef(key);

  const refresh = useCallback(async () => {
    const forKey = key;
    try {
      const data = await load();
      cache.set(forKey, data);
      if (keyRef.current === forKey) setState({ data, loading: false, error: '' });
    } catch (err) {
      if (keyRef.current === forKey) setState((s) => ({ ...s, loading: false, error: err?.message || 'خبرها خوانده نشد.' }));
    }
    // `load` is built from the same values as `key`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    keyRef.current = key;
    shown.set(key, (shown.get(key) || 0) + 1);
    const entry = cache.get(key);
    setState({ data: entry || null, loading: !entry, error: '' });
    if (!entry) refresh();
    return () => {
      const n = (shown.get(key) || 1) - 1;
      if (n > 0) shown.set(key, n);
      else shown.delete(key);
    };
  }, [key, refresh]);

  useRefreshHandler('news', useCallback(() => {
    for (const k of cache.keys()) if (!shown.has(k)) cache.delete(k);
    return refresh();
  }, [refresh]));

  return { ...state, refresh, setData: (fn) => setState((s) => ({ ...s, data: s.data && fn(s.data) })) };
}

/**
 * @param {{ limit?: number, page?: number, category?: string, important?: boolean }} [opts]
 * @returns {{ items: object[], total: number, loading: boolean, error: string, refresh: () => Promise<void>,
 *   removeItem: (id: string) => void }}
 */
export function useNews({ limit = 20, page = 1, category = '', important = false } = {}) {
  const key = `list|${limit}|${page}|${category}|${important ? 1 : 0}`;
  const { data, loading, error, refresh, setData } = useNewsQuery(key, () => getNews({ limit, page, category, important }));

  const removeItem = useCallback((id) => {
    const drop = (d) => ({ ...d, items: (d.items || []).filter((n) => n.id !== id), total: Math.max(0, (d.total || 0) - 1) });
    setData(drop);
    for (const [k, v] of cache) if (k.startsWith('list|')) cache.set(k, drop(v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { items: data?.items || [], total: data?.total || 0, loading, error, refresh, removeItem };
}

/** @returns {{ analysis: object|null, top: object[], loading: boolean }} */
export function useNewsToday() {
  const { data, loading } = useNewsQuery('today', () => getNewsToday());
  return { analysis: data?.analysis || null, top: data?.top || [], week: data?.week || [], loading };
}
