/**
 * useNews.js — The latest news, kept fresh: read again every minute while the page is in view
 * and when it comes back into view. The last answer of each filter is kept for this visit, so
 * the home card and the news page open with it at once.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getNews } from './newsApi.js';

const REFRESH_MS = 60_000;
const cache = new Map();

/** Two lists into one, newest first, each item once */
function merge(a, b) {
  const seen = new Set();
  return [...a, ...b]
    .filter((n) => (seen.has(n.id) ? false : seen.add(n.id)))
    .sort((x, y) => y.publishedAt - x.publishedAt);
}

/**
 * @param {{ limit?: number, category?: string, important?: boolean }} [opts]
 * @returns {{ items: object[], loading: boolean, error: string, hasMore: boolean, loadingMore: boolean,
 *   loadMore: () => void, refresh: () => Promise<void>, removeItem: (id: string) => void }}
 */
export function useNews({ limit = 20, category = '', important = false } = {}) {
  const key = `${limit}|${category}|${important ? 1 : 0}`;
  const cached = cache.get(key);
  const [state, setState] = useState(() => ({
    items: cached?.items || [],
    hasMore: cached?.hasMore || false,
    loading: !cached,
    loadingMore: false,
    error: '',
  }));
  const keyRef = useRef(key);
  keyRef.current = key;

  const refresh = useCallback(async () => {
    const forKey = key;
    try {
      const res = await getNews({ limit, category, important });
      if (keyRef.current !== forKey) return;
      setState((s) => {
        // Pages already loaded below the first stay
        const items = s.items.length > limit ? merge(res.items || [], s.items) : res.items || [];
        const hasMore = s.items.length > limit ? s.hasMore : Boolean(res.hasMore);
        cache.set(forKey, { items: items.slice(0, limit), hasMore: Boolean(res.hasMore) });
        return { ...s, items, hasMore, loading: false, error: '' };
      });
    } catch (err) {
      if (keyRef.current !== forKey) return;
      setState((s) => ({ ...s, loading: false, error: err?.message || 'خبرها خوانده نشد.' }));
    }
  }, [key, limit, category, important]);

  useEffect(() => {
    const entry = cache.get(key);
    setState({ items: entry?.items || [], hasMore: entry?.hasMore || false, loading: !entry, loadingMore: false, error: '' });
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

  const loadMore = useCallback(async () => {
    const last = state.items[state.items.length - 1];
    if (!last || state.loadingMore) return;
    const forKey = key;
    setState((s) => ({ ...s, loadingMore: true }));
    try {
      const res = await getNews({ limit, category, important, before: last.publishedAt });
      if (keyRef.current !== forKey) return;
      setState((s) => ({ ...s, items: merge(s.items, res.items || []), hasMore: Boolean(res.hasMore), loadingMore: false }));
    } catch (err) {
      if (keyRef.current !== forKey) return;
      setState((s) => ({ ...s, loadingMore: false, error: err?.message || 'خبرها خوانده نشد.' }));
    }
  }, [state.items, state.loadingMore, key, limit, category, important]);

  const removeItem = useCallback((id) => {
    setState((s) => ({ ...s, items: s.items.filter((n) => n.id !== id) }));
    for (const [k, v] of cache) cache.set(k, { ...v, items: v.items.filter((n) => n.id !== id) });
  }, []);

  return { ...state, loadMore, refresh, removeItem };
}
