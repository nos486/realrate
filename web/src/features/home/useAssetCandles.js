/**
 * useAssetCandles.js — One asset's daily candles over a window (30 days, 6 months, a year),
 * fetched only when asked (a home card turned over, or another window picked), and kept for a few
 * minutes so asking again fetches nothing. A card built with a formula (utils/cardFormula.js) gets
 * its assets' series in one request and the formula of each day's closes (useCardCandles).
 */

import { useEffect, useState } from 'react';
import { getSparklines } from '../market/api/marketApi.js';
import { formulaSeries, formulaShownValue, seriesStats } from '../../utils/cardFormula.js';

const TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // `${ids}|${range}` → { at, promise }

/** The daily series of a few assets, by id, in one request */
function loadMany(ids, range) {
  const cacheKey = `${ids.join(',')}|${range}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = getSparklines(ids, range, { candles: true })
    .then((res) => {
      if (res?.available === false) throw new Error('unavailable');
      return res?.sparklines || {};
    })
    .catch((err) => {
      cache.delete(cacheKey);
      throw err;
    });
  cache.set(cacheKey, { at: Date.now(), promise });
  return promise;
}

const load = (id, range) => loadMany([id], range).then((byId) => byId[id] || null);

/** A formula card's series: the formula of its assets' daily candles, shown as the card shows it */
function loadFormula(formula, range) {
  const ids = [...new Set(formula.vars.map((v) => v.id))].sort();
  return loadMany(ids, range).then((byId) => {
    const series = formulaSeries(formula.tree, Object.fromEntries(formula.vars.map((v) => [v.key, byId[v.id]])));
    if (!series) return null;
    const shown = (n) => formulaShownValue(n, formula.format);
    return { days: series.days, points: series.points.map(shown), candles: series.candles.map((c) => c.map(shown)) };
  });
}

/** For tests */
export function clearAssetCandlesCache() {
  cache.clear();
}

/**
 * A home card's candles: an asset's own (its chart series, `seriesId`: a dollar-priced asset's
 * dollar closes), or a formula card's
 * @param {object} asset - a resolved home card (homeAssets.js)
 * @param {boolean} enabled nothing is fetched until true
 * @param {'30d'|'180d'|'1y'} [range]
 * @returns {{ status: 'idle'|'loading'|'ready'|'empty'|'error', series: object|null }}
 */
const formulaKey = (asset, range) => {
  const f = asset.formula;
  return `${asset.id}:${f.expr}:${f.vars.map((v) => v.id).join(',')}:${f.format}|${range}`;
};

export function useCardCandles(asset, enabled, range = '30d') {
  const formula = asset?.formula || null;
  const assetId = String(asset?.seriesId || asset?.id || '').toLowerCase();
  const key = formula ? formulaKey(asset, range) : assetId ? `${assetId}|${range}` : '';
  return useSeries(key, enabled, () => (formula ? loadFormula(formula, range) : load(assetId, range)));
}

/**
 * A formula card's highest, lowest and average value over its statistics window (`formula.stats`),
 * from the same series as its chart (one request, cached); nothing for any other card
 * @param {object} asset - a resolved home card (homeAssets.js)
 * @returns {{ status: string, stats: { max: number, min: number, avg: number, days: number }|null }}
 */
export function useFormulaStats(asset) {
  const range = asset?.formula?.stats || null;
  const { status, series } = useSeries(range ? formulaKey(asset, range) : '', Boolean(range), () => loadFormula(asset.formula, range));
  return { status, stats: status === 'ready' ? seriesStats(series?.points) : null };
}

/** A series loaded once per key while enabled */
function useSeries(key, enabled, loader) {
  const [state, setState] = useState({ key: '', status: 'idle', series: null });
  useEffect(() => {
    if (!enabled || !key || state.key === key) return undefined;
    let active = true;
    loader()
      .then((series) => active && setState({ key, status: series?.candles?.length ? 'ready' : 'empty', series }))
      .catch(() => active && setState({ key, status: 'error', series: null }));
    return () => {
      active = false;
    };
    // The loader is the key's: a new key brings a new loader
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, state.key]);
  if (!enabled && state.key !== key) return { status: 'idle', series: null };
  if (state.key !== key) return { status: 'loading', series: null };
  return state;
}
