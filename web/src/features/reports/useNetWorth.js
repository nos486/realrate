/**
 * useNetWorth.js — The reports page's net worth for a Shamsi year, or several (netWorth.js)
 *
 * Reads, once per visit (and again on the tab's refresh): every portfolio's records, every loan
 * with its schedule and every cheque — all decrypted in the browser. The portfolios are valued day
 * by day from the public price history (one download per asset, cached for the session), the
 * dollar's rate of each day from the same history. Nothing about the user is sent out.
 */

import { t } from '../../utils/i18n.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRefreshHandler } from '../../shared/refresh/pageRefresh.js';
import { listPortfolioRecords } from '../../shared/vault/portfolioFunds.js';
import { getLoans, getLoanDetail } from '../loans/api/loanApi.js';
import { getCheques } from '../cheques/api/chequeApi.js';
import { usePricing } from '../market/index.js';
import { useDailyHistory, useUsdAt } from '../market/dailyHistory.js';
import { buildAssetLedgers } from '../portfolio/utils/assetLedger.js';
import { normalizeHolding } from '../portfolio/utils/holdingHelpers.js';
import { buildPortfolioSeries } from '../portfolio/utils/portfolioHistory.js';
import { todayIso } from '../../shared/utils/dates.js';
import { buildNetWorthYear, changeByMonth, compareWithDollar } from './netWorth.js';

/** Every loan with its schedule (the list carries only the totals) */
async function loadLoans() {
  const res = await getLoans();
  const loans = Array.isArray(res?.loans) ? res.loans : [];
  const views = await Promise.all(loans.map((l) => getLoanDetail(l.id).then((d) => d?.loan || null)));
  return views.filter(Boolean);
}

/** The records the net worth is made of: { portfolios, loans, cheques, loading, error } */
function useNetWorthRecords() {
  const [records, setRecords] = useState({ portfolios: [], loans: [], cheques: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [portfolios, loans, cheques] = await Promise.all([
        listPortfolioRecords(),
        loadLoans(),
        getCheques().then((r) => (Array.isArray(r?.cheques) ? r.cheques : [])),
      ]);
      setRecords({ portfolios, loans, cheques });
    } catch (err) {
      setError(err?.message || t('خطا در محاسبه‌ی ارزش خالص'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  // One scope for the three: the tab's refresh reads them all again once
  useRefreshHandler('portfolio', load);
  return { ...records, loading, error };
}

const NO_STARTS = [];

/**
 * @param {number} jy the Shamsi year (the last one)
 * @param {number} throughMonth the last month shown
 * @param {number} [years] how many years the report covers
 * @param {string[]} [starts] the salary days, when months start there
 * @returns {{ loading: boolean, error: string|null, start: object|null, end: object|null,
 *   months: object[], compare: object|null, estimated: boolean, empty: boolean }}
 */
export function useNetWorth(jy, throughMonth, years = 1, starts = NO_STARTS) {
  const { portfolios, loans, cheques, loading, error } = useNetWorthRecords();
  const pricing = usePricing();
  const priceMap = pricing?.priceMap;
  const itemMap = pricing?.itemMap;

  // All portfolios' assets together: their values add up day by day
  const assets = useMemo(() => portfolios.flatMap(({ holdings, transactions }) => buildAssetLedgers({
    holdings: holdings.map((h) => normalizeHolding(h, itemMap)),
    transactions,
    priceMap: priceMap || {},
  }).assets), [portfolios, priceMap, itemMap]);

  const ids = useMemo(() => assets.map((a) => a.assetId), [assets]);
  const { priceAt, loading: loadingPrices } = useDailyHistory(ids);
  const usdAt = useUsdAt(true);
  const today = todayIso();

  const portfolioSeries = useMemo(() => buildPortfolioSeries({ assets, priceAt, usdAt, today }), [assets, priceAt, usdAt, today]);
  // With no dated entry there is no series: today's value stands for every day
  const portfolioToday = useMemo(() => assets.reduce((sum, a) => sum + (Number(a.itemRealVal) || 0), 0), [assets]);

  const year = useMemo(
    () => buildNetWorthYear({ portfolioSeries, portfolioToday, loans, cheques, usdAt, today }, jy, { throughMonth, years, starts }),
    [portfolioSeries, portfolioToday, loans, cheques, usdAt, today, jy, throughMonth, years, starts],
  );
  const months = useMemo(() => changeByMonth(year), [year]);
  const compare = useMemo(() => compareWithDollar(year.start, year.end), [year]);

  return {
    loading: loading || (ids.length > 0 && loadingPrices),
    error,
    start: year.start,
    end: year.end,
    months,
    compare,
    estimated: Boolean(portfolioSeries?.estimated) || (!portfolioSeries && assets.length > 0),
    empty: !assets.length && !loans.length && !cheques.length,
  };
}
