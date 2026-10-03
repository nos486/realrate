/**
 * useAssetCandles.js — One asset's daily candles over a window (30 days, 6 months, a year),
 * fetched only when asked (a home card turned over, or another window picked), and kept for a few
 * minutes so asking again fetches nothing
 */

import { useEffect, useState } from 'react';
import { getSparklines } from '../market/api/marketApi.js';

const TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // `${id}|${range}` → { at, promise }

function load(id, range) {
  const cacheKey = `${id}|${range}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = getSparklines([id], range, { candles: true })
    .then((res) => {
      if (res?.available === false) throw new Error('unavailable');
      return res?.sparklines?.[id] || null;
    })
    .catch((err) => {
      cache.delete(cacheKey);
      throw err;
    });
  cache.set(cacheKey, { at: Date.now(), promise });
  return promise;
}

/** For tests */
export function clearAssetCandlesCache() {
  cache.clear();
}

/**
 * @param {string} id asset id (any case)
 * @param {boolean} enabled nothing is fetched until true
 * @param {'30d'|'180d'|'1y'} [range]
 * @returns {{ status: 'idle'|'loading'|'ready'|'empty'|'error', series: object|null }}
 */
export function useAssetCandles(id, enabled, range = '30d') {
  const assetId = String(id || '').toLowerCase();
  const key = assetId ? `${assetId}|${range}` : '';
  const [state, setState] = useState({ key: '', status: 'idle', series: null });
  useEffect(() => {
    if (!enabled || !key || state.key === key) return undefined;
    let active = true;
    load(assetId, range)
      .then((series) => active && setState({ key, status: series?.candles?.length ? 'ready' : 'empty', series }))
      .catch(() => active && setState({ key, status: 'error', series: null }));
    return () => {
      active = false;
    };
  }, [enabled, key, state.key, assetId, range]);
  if (!enabled && state.key !== key) return { status: 'idle', series: null };
  if (state.key !== key) return { status: 'loading', series: null };
  return state;
}
