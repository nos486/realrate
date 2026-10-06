/**
 * useReportData.js — Everything the reports page shows for one Shamsi year, worked out once
 *
 * One download per year for each source: incomes (1 request), everyday expenses (2: the sections,
 * then the year's expenses), the portfolios (3: the list, then every portfolio's holdings and
 * transactions of the year), and the dollar's daily history (cached for the session). Everything
 * is end-to-end encrypted, so the figures are worked out here, each memoized on what it reads —
 * switching tabs recomputes nothing.
 *
 * What counts: the categories left out of the totals (e.g. «مدیریت نقدینگی», «سرمایه‌گذاری» in
 * the expenses) are left out here too.
 */

import { useMemo } from 'react';
import { useFeature } from '../../shared/features/useFeature.js';
import { buildYearSeries, flowWindow, shamsiYearRange, summarizeYear } from '../../shared/flow/flowYear.js';
import { splitCounted } from '../../shared/categories/categoryStore.js';
import { useCategories } from '../../shared/categories/useCategories.js';
import { summarizeDollarValues } from '../../utils/dollarValue.js';
import { expenseInToman, expenseDollarValue, summarizeDollarValue } from '../../utils/expenseDocument.js';
import { usePricing } from '../market/index.js';
import { useUsdAt } from '../market/dailyHistory.js';
import { useIncomes } from '../incomes/hooks/useIncomes.js';
import { incomeDollarValue } from '../incomes/utils/incomeReport.js';
import { useDailyExpenses } from '../expenses/hooks/useDailyExpenses.js';
import { useInvestmentFlows } from './useInvestmentFlows.js';
import {
  investmentPoints,
  investmentShareByMonth,
  summarizeInvestmentShare,
  investmentByAsset,
  dollarPoints,
  dollarFlowByMonth,
  cashFlowByMonth,
  summarizeCashFlow,
  reportInsights,
} from './reportMath.js';

/**
 * @param {number} jy the Shamsi year
 * @param {number} throughMonth the last month shown (this month in the current year, else 12)
 */
export function useReportData(jy, throughMonth) {
  const hasExpenses = useFeature('expenses');
  // Re-read when a category is switched in or out of the totals
  const incomeCats = useCategories('income', { includeHidden: true });
  const expenseCats = useCategories('expense', { includeHidden: true });
  const exclusionKey = [...incomeCats, ...expenseCats].filter((c) => c.excluded).map((c) => c.value).join(',');

  const loadWindow = useMemo(() => flowWindow(jy), [jy]);
  const range = useMemo(() => shamsiYearRange(jy), [jy]);
  const month = useMemo(() => ({ jy, jm: 1 }), [jy]);
  const { incomes, loadingIncomes, error: incomeError } = useIncomes(loadWindow);
  const { yearExpenses, loading: loadingExpenses, error: expenseError } = useDailyExpenses(month, { enabled: hasExpenses, year: true });
  const invest = useInvestmentFlows(range);
  const pricing = usePricing();
  const usdToman = Number(pricing?.getAssetPrice?.('usd')) || 0;
  const usdAt = useUsdAt(true);

  // Counted, and inside the year (the windows hold the month before it too, for comparisons)
  const inYear = (date) => date >= range.from && date <= range.to;
  const counted = useMemo(() => ({
    incomes: splitCounted('income', incomes).counted,
    expenses: hasExpenses ? splitCounted('expense', yearExpenses).counted : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [incomes, yearExpenses, hasExpenses, exclusionKey]);

  // Month by month in tomans, by category
  const incomeSeries = useMemo(
    () => buildYearSeries(counted.incomes.map((i) => ({ date: i.incomeDate, amount: Number(i.amount) || 0, category: i.category })), jy, { throughMonth }),
    [counted, jy, throughMonth],
  );
  const expenseSeries = useMemo(
    () => buildYearSeries(counted.expenses.map((e) => ({ date: e.date, amount: expenseInToman(e, usdToman, usdAt) || 0, category: e.category })), jy, { throughMonth }),
    [counted, usdToman, usdAt, jy, throughMonth],
  );
  const incomeYear = useMemo(() => summarizeYear(incomeSeries), [incomeSeries]);
  const expenseYear = useMemo(() => summarizeYear(expenseSeries), [expenseSeries]);

  // The cash flow: what was left each month, and the savings rate
  const cashMonths = useMemo(() => cashFlowByMonth(incomeSeries, expenseSeries), [incomeSeries, expenseSeries]);
  const cash = useMemo(() => summarizeCashFlow(cashMonths), [cashMonths]);

  // What went into the portfolios
  const points = useMemo(() => investmentPoints(invest.holdings, invest.transactions), [invest.holdings, invest.transactions]);
  const shareMonths = useMemo(
    () => investmentShareByMonth(counted.incomes.map((i) => ({ date: i.incomeDate, amount: Number(i.amount) || 0 })), points, jy, { throughMonth }),
    [counted, points, jy, throughMonth],
  );
  const shareYear = useMemo(() => summarizeInvestmentShare(shareMonths), [shareMonths]);
  const byAsset = useMemo(() => investmentByAsset(points, range), [points, range]);

  // In dollars, each at its own day's rate (none at today's)
  const dollars = useMemo(() => {
    const inc = dollarPoints(counted.incomes.filter((i) => inYear(i.incomeDate)), (i) => i.incomeDate, (i) => incomeDollarValue(i, 0, usdAt));
    const exp = dollarPoints(counted.expenses.filter((e) => inYear(e.date)), (e) => e.date, (e) => expenseDollarValue(e, 0, usdAt));
    const months = dollarFlowByMonth(inc.points, exp.points, jy, { throughMonth, missing: [...inc.missing, ...exp.missing] });
    const income = months.reduce((s, m) => s + m.income, 0);
    const expense = months.reduce((s, m) => s + m.expense, 0);
    return { months, income, expense, net: income - expense, unpriced: inc.unpriced + exp.unpriced };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counted, usdAt, jy, throughMonth, range]);
  // The dollar view of each side (what those dollars are worth today), for the yearly cards
  const incomeDollar = useMemo(
    () => summarizeDollarValues(counted.incomes.filter((i) => inYear(i.incomeDate)).map((i) => incomeDollarValue(i, usdToman, usdAt)), usdToman),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [counted, usdToman, usdAt, range],
  );
  const expenseDollar = useMemo(
    () => summarizeDollarValue(counted.expenses.filter((e) => inYear(e.date)), { usdToman, usdAt }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [counted, usdToman, usdAt, range],
  );

  const insights = useMemo(
    () => reportInsights({ cash, expenseYear: hasExpenses ? expenseYear : null, invest: shareYear }),
    [cash, expenseYear, hasExpenses, shareYear],
  );

  return {
    hasExpenses,
    loading: loadingIncomes || (hasExpenses && loadingExpenses) || invest.loading,
    errors: [incomeError, hasExpenses && expenseError, invest.error].filter(Boolean),
    incomeSeries,
    expenseSeries,
    incomeYear,
    expenseYear,
    incomeDollar,
    expenseDollar,
    cashMonths,
    cash,
    shareMonths,
    shareYear,
    byAsset,
    dollars,
    insights,
  };
}
