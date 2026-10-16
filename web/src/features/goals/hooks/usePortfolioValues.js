/**
 * usePortfolioValues.js — What each of the user's portfolios is worth now, in tomans, for the goals
 * linked to one
 *
 * Reads every portfolio's records once (decrypted in the browser) and values their assets at the
 * price book's prices, as the portfolio page does (buildAssetLedgers). Nothing leaves the device.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRefreshHandler } from '../../../shared/refresh/pageRefresh.js';
import { listLinkablePortfolios, listPortfolioRecords } from '../../../shared/vault/portfolioFunds.js';
import { usePricing } from '../../market/index.js';
import { buildAssetLedgers } from '../../portfolio/utils/assetLedger.js';
import { normalizeHolding } from '../../portfolio/utils/holdingHelpers.js';

/**
 * @param {{ enabled?: boolean }} [options] - enabled false: nothing is read
 * @returns {{ portfolios: Array<{ id: string, name: string }>, valueOf: (id: string) => number, loading: boolean }}
 */
export function usePortfolioValues({ enabled = true } = {}) {
  const pricing = usePricing();
  const priceMap = pricing?.priceMap;
  const itemMap = pricing?.itemMap;
  const [state, setState] = useState({ portfolios: [], records: [], loading: enabled });

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const [portfolios, records] = await Promise.all([listLinkablePortfolios(), listPortfolioRecords()]);
      setState({ portfolios, records, loading: false });
    } catch (err) {
      console.warn('[goals] portfolios could not be read:', err?.message || err);
      setState({ portfolios: [], records: [], loading: false });
    }
  }, [enabled]);

  useEffect(() => {
    load();
  }, [load]);
  useRefreshHandler('portfolio', load);

  const values = useMemo(() => {
    const map = new Map();
    for (const { portfolioId, holdings, transactions } of state.records) {
      const { assets } = buildAssetLedgers({
        holdings: holdings.map((h) => normalizeHolding(h, itemMap)),
        transactions,
        priceMap: priceMap || {},
      });
      map.set(portfolioId, assets.reduce((sum, a) => sum + (Number(a.itemRealVal) || 0), 0));
    }
    return map;
  }, [state.records, priceMap, itemMap]);

  return { portfolios: state.portfolios, valueOf: (id) => values.get(id) || 0, loading: state.loading };
}
