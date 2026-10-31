/**
 * useAccountBalances.js — What each account that keeps a balance holds today, and the total
 * (utils/accountBalance.js)
 *
 * The balance is the amount the user stated plus what the records did after it: one download each
 * of the expenses, the transfers and the incomes since the earliest stated day (nothing without a
 * tracked account). Read again on the accounts tab's refresh, after the vault changes, and by
 * `reload` after a record is saved here. Foreign balances are totalled at today's rates.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRefreshHandler } from '../../../shared/refresh/pageRefresh.js';
import { useVault } from '../../../shared/vault/useVault.js';
import { todayIso } from '../../../shared/utils/dates.js';
import { getExpenses } from '../../../shared/vault/vaultExpenses.js';
import { getTransfers } from '../../../shared/vault/vaultTransfers.js';
import { getIncomes } from '../../../shared/vault/vaultIncomes.js';
import { usePricing } from '../../market/context/PricingContext.jsx';
import { useFxRates } from '../../market/useFxRates.js';
import { accountBalances, tracksBalance, earliestBalanceDate } from '../../../utils/accountBalance.js';
import { accountCurrencies } from '../../../utils/accountDocument.js';

/**
 * @param {object[]} accounts - the user's accounts
 * @returns {{ balances: ReturnType<typeof accountBalances>, records: { expenses: object[], transfers: object[], incomes: object[] },
 *   loading: boolean, reload: () => Promise<void> }} records: what moved the balances (the net worth
 *   replays them for past days)
 */
export function useAccountBalances(accounts) {
  const { status: vaultStatus, epoch: vaultEpoch } = useVault();
  const tracked = useMemo(() => accounts.filter(tracksBalance), [accounts]);
  const since = useMemo(() => earliestBalanceDate(accounts), [accounts]);
  const [records, setRecords] = useState({ expenses: [], transfers: [], incomes: [] });
  const [loading, setLoading] = useState(false);

  const usdToman = Number(usePricing()?.getAssetPrice?.('usd')) || 0;
  const held = useMemo(
    () => tracked.flatMap((a) => accountCurrencies(a).map((currency) => ({ currency }))),
    [tracked]
  );
  const fx = useFxRates(held, tracked.length > 0);
  const rates = useMemo(() => ({ usdToman, ...fx }), [usdToman, fx]);

  const reload = useCallback(async () => {
    if (!tracked.length || vaultStatus === 'locked') return;
    setLoading(true);
    try {
      const filters = since ? { from: since } : {};
      const [e, t, i] = await Promise.all([getExpenses(filters), getTransfers(filters), getIncomes(filters)]);
      setRecords({ expenses: e?.expenses || [], transfers: t?.transfers || [], incomes: i?.incomes || [] });
    } catch (err) {
      console.warn('Reading the account balances failed:', err);
    } finally {
      setLoading(false);
    }
    // vaultEpoch: reload after unlocking or a sync
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracked.length, since, vaultStatus, vaultEpoch]);

  useEffect(() => {
    reload();
  }, [reload]);
  // The accounts tab's refresh (header button, coming back to the app)
  useRefreshHandler('accounts', reload);

  const balances = useMemo(() => accountBalances(accounts, records, todayIso(), rates), [accounts, records, rates]);
  return { balances, records, loading, reload };
}
