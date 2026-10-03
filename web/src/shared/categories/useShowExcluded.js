/**
 * useShowExcluded.js — Whether a list shows the records of categories left out of the totals
 *
 * A per-viewer preference (this browser only), shown by default: the records are still the
 * user's, they just are not spending or income.
 */

import { useState } from 'react';

const keyOf = (kind) => `realrate_show_excluded_${kind}`;

function read(kind) {
  try {
    return localStorage.getItem(keyOf(kind)) !== '0';
  } catch {
    return true;
  }
}

/** @returns {[boolean, (show: boolean) => void]} */
export function useShowExcluded(kind) {
  const [show, setShow] = useState(() => read(kind));
  const update = (next) => {
    setShow(next);
    try {
      localStorage.setItem(keyOf(kind), next ? '1' : '0');
    } catch {
      // Blocked storage: kept for this visit only
    }
  };
  return [show, update];
}
