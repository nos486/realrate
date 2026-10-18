/**
 * useMonthIncomes.js — The incomes of a date range (decrypted), read again when the vault changes
 * and with the home tab's refresh (header button, window focus)
 */

import { useEffect, useState } from 'react';
import { useVault } from '../../shared/vault/useVault.js';
import { useRefreshToken } from '../../shared/refresh/pageRefresh.js';
import { getIncomes } from '../../shared/vault/vaultIncomes.js';

/**
 * @param {{ from: string, to: string }} range
 * @param {boolean} enabled - false: nothing is read (a locked vault)
 * @returns {{ incomes: object[], loading: boolean }}
 */
export function useMonthIncomes(range, enabled) {
  const { epoch } = useVault();
  const refreshToken = useRefreshToken('incomes');
  const [state, setState] = useState({ incomes: [], loading: true });
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    getIncomes({ from: range.from, to: range.to })
      .then((res) => !cancelled && setState({ incomes: Array.isArray(res?.incomes) ? res.incomes : [], loading: false }))
      .catch(() => !cancelled && setState({ incomes: [], loading: false }));
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, enabled, epoch, refreshToken]);
  return state;
}
