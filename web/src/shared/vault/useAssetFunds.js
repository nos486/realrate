import { useEffect, useState } from 'react';
import { listAssetFunds } from './portfolioFunds.js';

/**
 * The portfolios holding `assetId` and how much each holds (for «پرداخت از» of a dollar expense)
 * @returns {{ funds: object[], loading: boolean }}
 */
export function useAssetFunds(assetId, enabled = true) {
  const [state, setState] = useState({ funds: [], loading: Boolean(enabled && assetId) });
  useEffect(() => {
    if (!enabled || !assetId) return undefined;
    let cancelled = false;
    listAssetFunds(assetId)
      .then((funds) => !cancelled && setState({ funds, loading: false }))
      .catch(() => !cancelled && setState({ funds: [], loading: false }));
    return () => {
      cancelled = true;
    };
  }, [assetId, enabled]);
  return state;
}
