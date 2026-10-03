/**
 * trendChartStyle.js — How trend cards draw their history: 'line' (default) or 'candles'
 *
 * One choice for every trend card, remembered in this browser (a viewer's convenience; without
 * storage it simply starts as a line). Every card follows a change at once.
 */

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'realrate:trendChartStyle';
const listeners = new Set();

function read() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'candles' ? 'candles' : 'line';
  } catch {
    return 'line';
  }
}

let current = read();

export function setTrendChartStyle(style) {
  current = style === 'candles' ? 'candles' : 'line';
  try {
    localStorage.setItem(STORAGE_KEY, current);
  } catch {
    // Storage blocked: the choice lasts for this page only
  }
  listeners.forEach((fn) => fn());
}

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** @returns {['line'|'candles', (style: 'line'|'candles') => void]} */
export function useTrendChartStyle() {
  const style = useSyncExternalStore(subscribe, () => current, () => 'line');
  return [style, setTrendChartStyle];
}
