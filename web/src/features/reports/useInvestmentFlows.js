/**
 * useInvestmentFlows.js — Every portfolio's buys, sells and dated holdings of a date window, for
 * the reports page
 *
 * Three requests per window however many portfolios there are: the portfolio list, then the
 * holdings and the transactions of the window across all of them (vaultPortfolioItems.js
 * listAccountItemsBetween). Read again whenever the window changes or the page opens, so what
 * was just recorded is in it.
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../auth/index.js';
import { useVault } from '../../shared/vault/useVault.js';
import { getPortfolios } from '../portfolio/api/portfolioApi.js';
import { listAccountItemsBetween } from '../../shared/vault/vaultPortfolioItems.js';

/**
 * @param {{ from: string, to: string }} range inclusive YYYY-MM-DD
 * @returns {{ holdings: object[], transactions: object[], loading: boolean, error: string }}
 */
export function useInvestmentFlows({ from, to }, { enabled = true } = {}) {
  const { user } = useAuth();
  const { status, epoch } = useVault();
  const ready = enabled && Boolean(user) && status !== 'locked';
  const key = `${user?.id || user?.email || ''}|${epoch || ''}|${from}|${to}`;
  const [state, setState] = useState({ key: null, holdings: [], transactions: [], error: '' });

  useEffect(() => {
    if (!ready) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const { portfolios = [] } = (await getPortfolios()) || {};
        const items = await listAccountItemsBetween(portfolios, { from, to });
        if (!cancelled) setState({ key, ...items, error: '' });
      } catch (err) {
        if (!cancelled) setState({ key, holdings: [], transactions: [], error: err?.message || 'پورتفوها خوانده نشد.' });
      }
    })();
    return () => { cancelled = true; };
  }, [ready, key, from, to]);

  if (!ready) return { holdings: [], transactions: [], loading: false, error: '' };
  return state.key === key
    ? { holdings: state.holdings, transactions: state.transactions, loading: false, error: state.error }
    : { holdings: [], transactions: [], loading: true, error: '' };
}
