/**
 * useDayChanges.js — Each asset's close 24 hours ago (yesterday's last price, from the daily
 * price history), for the full cards' 24-hour change: one request for every card on the page
 * (GET /api/sparklines, a week of daily closes; edge-cached on the server).
 */

import { useEffect, useMemo, useState } from 'react';
import { getSparklines } from '../market/api/marketApi.js';
import { todayIso } from '../../shared/utils/dates.js';

/**
 * The last close before today in a daily series (yesterday's, or the last day recorded before it)
 * @param {{ days?: string[], points?: number[] }|null} series
 * @returns {number|null}
 */
export function previousClose(series, today = todayIso()) {
  const days = series?.days || [];
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i] < today) {
      const value = Number(series.points?.[i]);
      return value > 0 ? value : null;
    }
  }
  return null;
}

/** The 24-hour change in percent, or null without both prices */
export function changeSince(previous, price) {
  return previous > 0 && price > 0 ? ((price - previous) / previous) * 100 : null;
}

/**
 * @param {string[]} ids - the assets shown as full cards
 * @returns {Record<string, number>} id → its close 24 hours ago (ids without history left out)
 */
export function useDayChanges(ids) {
  const key = useMemo(() => [...new Set((ids || []).filter(Boolean).map((id) => String(id).toLowerCase()))].sort().join(','), [ids]);
  const [closes, setCloses] = useState({});

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    getSparklines(key.split(','), '7d', { silent: true })
      .then((res) => {
        if (cancelled) return;
        const next = {};
        for (const [id, series] of Object.entries(res?.sparklines || {})) {
          const close = previousClose(series);
          if (close) next[id] = close;
        }
        setCloses(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key]);

  return closes;
}
