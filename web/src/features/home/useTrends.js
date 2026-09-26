/**
 * useTrends.js — Trend series for the assets shown in "trend" sections of the home page
 *
 * One request for every trend card on the page (ids are sorted, so the server's cache is shared
 * across users with the same cards), refreshed every minute. History is kept per asset id
 * in lower case, so the series of an asset is `trends[id.toLowerCase()]`.
 */

import { useEffect, useState } from 'react';
import { getSparklines } from '../market/api/marketApi.js';

// The last 24 hours, one point per minute (prices are synced every minute)
export const TREND_RANGE = '1d';
const REFRESH_MS = 60 * 1000;

/**
 * @param {string[]} ids - asset ids of the trend cards
 * @returns {{ trends: Record<string, object>, bucketSec: number, status: 'idle'|'loading'|'ready'|'unavailable' }}
 *   status `loading`: an answer for the current ids is on its way (a card without a series waits)
 */
export function useTrends(ids) {
  const key = [...new Set(ids.map((id) => String(id).toLowerCase()))].sort().join(',');
  const [state, setState] = useState({ key: '', trends: {}, bucketSec: 0, status: 'idle' });

  useEffect(() => {
    if (!key) return undefined;
    let active = true;
    const load = () => {
      getSparklines(key.split(','), TREND_RANGE)
        .then((res) => {
          if (!active) return;
          setState({
            key,
            trends: res?.sparklines || {},
            bucketSec: Number(res?.bucketSec) || 0,
            status: res?.available === false ? 'unavailable' : 'ready',
          });
        })
        .catch(() => {
          // Keep the last series; only the first load reports the failure
          if (active) setState((prev) => (prev.key === key ? prev : { key, trends: {}, bucketSec: 0, status: 'unavailable' }));
        });
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [key]);

  if (!key) return { trends: {}, bucketSec: 0, status: 'idle' };
  // While a changed set of ids loads, cards keep the series they already have
  if (state.key !== key) return { trends: state.trends, bucketSec: state.bucketSec, status: 'loading' };
  return state;
}
