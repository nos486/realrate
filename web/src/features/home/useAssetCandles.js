/**
 * useAssetCandles.js — The last 30 days of one asset as daily candles, fetched only when asked
 * (a home card turned over), and kept for a few minutes so turning it again asks nothing
 */

import { useEffect, useState } from 'react';
import { getSparklines } from '../market/api/marketApi.js';

const TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // id → { at, promise }

function load(id) {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = getSparklines([id], '30d', { candles: true })
    .then((res) => {
      if (res?.available === false) throw new Error('unavailable');
      return res?.sparklines?.[id] || null;
    })
    .catch((err) => {
      cache.delete(id);
      throw err;
    });
  cache.set(id, { at: Date.now(), promise });
  return promise;
}

/** For tests */
export function clearAssetCandlesCache() {
  cache.clear();
}

/**
 * @param {string} id asset id (any case)
 * @param {boolean} enabled nothing is fetched until true
 * @returns {{ status: 'idle'|'loading'|'ready'|'empty'|'error', series: object|null }}
 */
export function useAssetCandles(id, enabled) {
  const key = String(id || '').toLowerCase();
  const [state, setState] = useState({ key: '', status: 'idle', series: null });
  useEffect(() => {
    if (!enabled || !key || state.key === key) return undefined;
    let active = true;
    load(key)
      .then((series) => active && setState({ key, status: series?.candles?.length ? 'ready' : 'empty', series }))
      .catch(() => active && setState({ key, status: 'error', series: null }));
    return () => {
      active = false;
    };
  }, [enabled, key, state.key]);
  if (!enabled && state.key !== key) return { status: 'idle', series: null };
  if (state.key !== key) return { status: 'loading', series: null };
  return state;
}
