/**
 * useAccountCash.js — The accounts' balances as holding records of the default portfolio
 * (utils/accountCash.js)
 *
 * Reads the accounts (the shared list) and their balances only for the portfolio that counts
 * them; for any other portfolio it returns nothing and loads nothing. The balances are read
 * again on the portfolio tab's refresh, so an income or an expense recorded meanwhile shows.
 */

import { useMemo } from 'react';
import { useAccounts } from '../../accounts/hooks/useAccounts.js';
import { useAccountBalances } from '../../accounts/hooks/useAccountBalances.js';
import { accountLabel } from '../../accounts/constants/accountDisplay.js';
import { useRefreshHandler } from '../../../shared/refresh/pageRefresh.js';
import { todayIso } from '../../../shared/utils/dates.js';
import { accountCashHoldings, cashPortfolioId } from '../utils/accountCash.js';

const NONE = [];

/**
 * @param {object|null} portfolio - the portfolio shown
 * @param {object[]} portfolios - all of the user's portfolios
 * @returns {object[]} holding records (empty unless `portfolio` is the one that counts the accounts)
 */
export function useAccountCash(portfolio, portfolios) {
  const counts = Boolean(portfolio?.id) && portfolio.id === cashPortfolioId(portfolios);
  const { accounts } = useAccounts();
  const shown = counts ? accounts : NONE;
  const { balances, reload } = useAccountBalances(shown);
  useRefreshHandler('portfolio', reload, counts);
  return useMemo(
    () => (counts ? accountCashHoldings(shown, balances.byId, todayIso(), accountLabel) : NONE),
    [counts, shown, balances]
  );
}
