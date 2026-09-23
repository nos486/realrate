import { useCallback, useMemo, useState } from 'react';

/**
 * useSortableRows — generic click-to-sort state + comparator for any list of rows.
 * Headless (no UI of its own) so it can back any table or list in the app, not just
 * ResponsiveDataTable — pass the raw rows and a map of { columnKey: accessor(row) }.
 *
 * Click cycles a column through ascending → descending → unsorted (back to the
 * original row order), matching the common spreadsheet/table convention.
 */
export function useSortableRows(rows, accessors, initialSort = null) {
  const [sortState, setSortState] = useState(initialSort); // { key, dir: 'asc' | 'desc' } | null

  const toggleSort = useCallback((key) => {
    setSortState((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  }, []);

  const sortedRows = useMemo(() => {
    const accessor = sortState && accessors[sortState.key];
    if (!accessor) return rows;
    const dir = sortState.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = accessor(a);
      const vb = accessor(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'string' || typeof vb === 'string') {
        return String(va).localeCompare(String(vb), 'fa') * dir;
      }
      return (va - vb) * dir;
    });
  }, [rows, accessors, sortState]);

  return { sortedRows, sortState, toggleSort };
}
