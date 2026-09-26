/**
 * useAdminUsers.js — The admin users list: server-side page, search, quick filter and sort
 *
 * The search is debounced; changing the search, filter or sort goes back to the first page.
 * Only the latest request may update the list (typing and paging can overlap requests), and
 * the loading state is derived from which query the shown page belongs to.
 */

import { useEffect, useRef, useState } from 'react';
import { getAdminUsers } from '../api/adminApi.js';

export const USERS_PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

export function useAdminUsers({ enabled, onError }) {
  const [result, setResult] = useState({ key: null, users: [], total: 0, page: 1, pageCount: 1 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilterState] = useState('all');
  const [sort, setSortState] = useState({ key: 'lastLogin', dir: 'desc' });
  const [reloadToken, setReloadToken] = useState(0);
  const requestRef = useRef(0);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Search after typing pauses, from the first page
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const key = `${page}|${query}|${filter}|${sort.key}|${sort.dir}|${reloadToken}`;

  useEffect(() => {
    if (!enabled) return;
    const requestId = ++requestRef.current;
    getAdminUsers({ page, pageSize: USERS_PAGE_SIZE, q: query, filter, sort: sort.key, dir: sort.dir })
      .then((data) => {
        if (requestId !== requestRef.current) return;
        setResult({
          key,
          users: Array.isArray(data.users) ? data.users : [],
          total: data.total || 0,
          page: data.page || page,
          pageCount: data.pageCount || 1,
        });
        // The server answers with its last page when asked past the end
        if (data.page && data.page !== page) setPage(data.page);
      })
      .catch((err) => {
        if (requestId !== requestRef.current) return;
        setResult((prev) => ({ ...prev, key }));
        onErrorRef.current?.(err);
      });
    // `key` is derived from exactly these values
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, page, query, filter, sort, reloadToken]);

  return {
    ...result,
    loading: result.key !== key,
    query,
    search,
    setSearch,
    filter,
    setFilter: (value) => {
      setFilterState(value);
      setPage(1);
    },
    sort,
    // A sort key sorts newest first; choosing it again flips the direction
    toggleSort: (sortKey) => {
      setSortState((prev) => (prev.key === sortKey ? { key: sortKey, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { key: sortKey, dir: 'desc' }));
      setPage(1);
    },
    setSort: (value) => {
      setSortState(value);
      setPage(1);
    },
    currentPage: page,
    setPage,
    reload: () => setReloadToken((n) => n + 1),
  };
}
