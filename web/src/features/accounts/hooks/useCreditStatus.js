/**
 * useCreditStatus.js — Where each of the user's bank credits stands (utils/creditAccount.js)
 *
 * A credit's debt is worked out from what was spent from it and paid into it, from its start
 * date: one download each of the expenses, the transfers and the incomes (deposits that pay a
 * credit) since the earliest credit's start (nothing without a credit account). Read again on
 * the accounts tab's refresh, after the vault changes, and by `reload` after a payment.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRefreshHandler } from '../../../shared/refresh/pageRefresh.js';
import { useVault } from '../../../shared/vault/useVault.js';
import { todayIso } from '../../../shared/utils/dates.js';
import { getExpenses } from '../../../shared/vault/vaultExpenses.js';
import { getTransfers } from '../../../shared/vault/vaultTransfers.js';
import { getIncomes } from '../../../shared/vault/vaultIncomes.js';
import { isCreditAccount } from '../../../utils/accountDocument.js';
import { creditStatus, creditCostsPaid } from '../../../utils/creditAccount.js';

/**
 * @param {object[]} accounts - the user's accounts
 * @returns {{ statusById: Map<string, object>, costsById: Map<string, number>, loading: boolean, reload: () => Promise<void> }}
 */
export function useCreditStatus(accounts) {
  const { status: vaultStatus, epoch: vaultEpoch } = useVault();
  const credits = useMemo(() => accounts.filter(isCreditAccount), [accounts]);
  const since = useMemo(
    () => credits.map((a) => a.credit.startDate).filter(Boolean).sort()[0] || '',
    [credits]
  );
  const [records, setRecords] = useState({ expenses: [], transfers: [], incomes: [] });
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!credits.length || vaultStatus === 'locked') return;
    setLoading(true);
    try {
      const filters = since ? { from: since } : {};
      const [e, t, i] = await Promise.all([getExpenses(filters), getTransfers(filters), getIncomes(filters)]);
      setRecords({ expenses: e?.expenses || [], transfers: t?.transfers || [], incomes: i?.incomes || [] });
    } catch (err) {
      console.warn('Reading the credit accounts failed:', err);
    } finally {
      setLoading(false);
    }
    // vaultEpoch: reload after unlocking or a sync
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credits.length, since, vaultStatus, vaultEpoch]);

  useEffect(() => {
    reload();
  }, [reload]);
  // The accounts tab's refresh (header button, coming back to the app)
  useRefreshHandler('accounts', reload);

  const statusById = useMemo(() => {
    const today = todayIso();
    return new Map(credits.map((a) => [a.id, creditStatus(a, records, today)]));
  }, [credits, records]);
  const costsById = useMemo(
    () => new Map(credits.map((a) => [a.id, creditCostsPaid(a.id, records.expenses)])),
    [credits, records]
  );

  return { statusById, costsById, loading, reload };
}
