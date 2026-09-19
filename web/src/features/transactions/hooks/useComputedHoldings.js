/**
 * useComputedHoldings.js — React hook for auto-calculated holdings
 */

import { useMemo } from 'react';
import { calculateComputedHoldings } from '../utils/calculationEngine.js';

export { calculateComputedHoldings };

/**
 * React hook to calculate computed holdings from transactions and pricing feeds
 *
 * @param {Array} transactions
 * @param {object} livePriceMap
 * @returns {{ computedHoldings: Array, warnings: Array, summary: object }}
 */
export function useComputedHoldings(transactions = [], livePriceMap = {}) {
  return useMemo(() => {
    return calculateComputedHoldings(transactions, livePriceMap);
  }, [transactions, livePriceMap]);
}
