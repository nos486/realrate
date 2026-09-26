/**
 * useTransactionPage.js — One page of a portfolio's transactions, straight from the server
 *
 * For portfolios under the account vault the server pages the encrypted records by their
 * plaintext date, so only the rows shown are fetched. Other portfolios (older storage) return
 * `serverPaged: false` and the caller pages the rows it already has.
 */

import { useEffect, useState } from 'react';
import { isAccountVaultPortfolio } from '../../../shared/vault/vaultStore.js';
import { queryPortfolioTransactions } from '../../../shared/vault/vaultPortfolioItems.js';
import { withDisplayFields } from './useTransactions.js';

/**
 * @param {object|null} portfolio
 * @param {CryptoKey|null} key the portfolio's key
 * @param {{ from: string, order: 'asc'|'desc', page: number, pageSize: number, enabled: boolean,
 *   version: unknown, onOverflow?: (lastPage: number) => void }} query `version` changes whenever
 *   the data may have changed; `onOverflow` is told the last page when `page` is past it (after a delete)
 * @returns {{ serverPaged: boolean, rows: object[], total: number, loading: boolean }}
 */
export function useTransactionPage(portfolio, key, { from, order, page, pageSize, enabled, version, onOverflow }) {
  const serverPaged = Boolean(enabled && portfolio?.id && key && isAccountVaultPortfolio(portfolio));
  const [result, setResult] = useState({ requestKey: null, rows: [], total: 0 });
  const requestKey = `${portfolio?.id}|${from}|${order}|${page}|${pageSize}`;

  useEffect(() => {
    if (!serverPaged) return undefined;
    let active = true;
    queryPortfolioTransactions(portfolio, key, { from, order, limit: pageSize, offset: (page - 1) * pageSize })
      .then((res) => {
        if (!active) return;
        const lastPage = Math.max(1, Math.ceil(res.total / pageSize));
        if (page > lastPage && onOverflow) {
          onOverflow(lastPage);
          return;
        }
        setResult({ requestKey, rows: res.transactions.map(withDisplayFields), total: res.total });
      })
      .catch(() => {
        if (active) setResult({ requestKey, rows: [], total: 0 });
      });
    return () => {
      active = false;
    };
    // `requestKey` names the query; `version` re-runs it after a change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverPaged, requestKey, key, version]);

  const current = result.requestKey === requestKey;
  return {
    serverPaged,
    rows: serverPaged ? result.rows : [],
    total: serverPaged ? result.total : 0,
    loading: serverPaged && !current,
  };
}
