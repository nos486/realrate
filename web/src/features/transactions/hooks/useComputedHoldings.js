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
 * @param {Array} [manualLots] the portfolio's manual holdings (opening buys of the same ledger)
 * @returns {{ computedHoldings: Array, warnings: Array, summary: object, positions: Map }}
 */
export function useComputedHoldings(transactions = [], livePriceMap = {}, manualLots = EMPTY) {
  return useMemo(() => {
    return calculateComputedHoldings(transactions, livePriceMap, { manualLots });
  }, [transactions, livePriceMap, manualLots]);
}

const EMPTY = [];
