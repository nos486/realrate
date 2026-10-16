/**
 * usePortfolioAssets.js — What the user's portfolios hold now, asset by asset, for the goals that
 * reserve a share of one
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
import { assetKey } from '../../../utils/goalDocument.js';

/**
 * @param {{ enabled?: boolean }} [options] - enabled false: nothing is read
 * @returns {{ portfolios: Array<{ id: string, name: string }>,
 *   assets: Array<{ key: string, portfolioId: string, portfolioName: string, assetId: string, assetName: string,
 *     unit: string, amount: number, unitPrice: number, value: number }>,
 *   index: Map<string, { amount: number, unitPrice: number }>, loading: boolean }}
 */
export function usePortfolioAssets({ enabled = true } = {}) {
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

  const assets = useMemo(() => {
    const names = new Map(state.portfolios.map((p) => [p.id, p.name]));
    const list = [];
    for (const { portfolioId, holdings, transactions } of state.records) {
      const built = buildAssetLedgers({
        holdings: holdings.map((h) => normalizeHolding(h, itemMap)),
        transactions,
        priceMap: priceMap || {},
      });
      for (const a of built.assets) {
        if (!(a.amount > 0)) continue;
        list.push({
          key: assetKey(portfolioId, a.assetId),
          portfolioId,
          portfolioName: names.get(portfolioId) || '',
          assetId: a.assetId,
          assetName: a.assetName,
          unit: a.unit,
          amount: a.amount,
          unitPrice: a.unitRealPrice,
          value: a.itemRealVal,
        });
      }
    }
    return list;
  }, [state.records, state.portfolios, priceMap, itemMap]);

  const index = useMemo(() => new Map(assets.map((a) => [a.key, { amount: a.amount, unitPrice: a.unitPrice }])), [assets]);

  return { portfolios: state.portfolios, assets, index, loading: state.loading };
}
