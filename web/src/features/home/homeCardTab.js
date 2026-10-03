/**
 * homeCardTab.js — Tab state for full cards on the home page: 'chart' (default) or 'info'
 *
 * Keeps the cards minimal and thin by showing either the 30-day candlestick chart
 * or the financial metrics/details. Defaults to 'chart'.
 */

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'realrate:homeCardTab';
const listeners = new Set();

function read() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'info' ? 'info' : 'chart';
  } catch {
    return 'chart';
  }
}

let current = read();

export function setHomeCardTab(tab) {
  current = tab === 'info' ? 'info' : 'chart';
  try {
    localStorage.setItem(STORAGE_KEY, current);
  } catch {
    // Storage blocked: lasts for current page visit
  }
  listeners.forEach((fn) => fn());
}

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** @returns {['chart'|'info', (tab: 'chart'|'info') => void]} */
export function useHomeCardTab() {
  const tab = useSyncExternalStore(subscribe, () => current, () => 'chart');
  return [tab, setHomeCardTab];
}
