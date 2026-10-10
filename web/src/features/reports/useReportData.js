/**
 * useReportData.js — Everything the reports page shows for one Shamsi year, worked out once
 *
 * One download per year for each source: incomes (1 request), everyday expenses (2: the sections,
 * then the year's expenses) and the dollar's daily history (cached for the session). The
 * subscriptions are the app's shared list (SubscriptionsContext): their payments are the year's
 * expenses that name them. What was
 * invested is the expenses recorded as «سرمایه‌گذاری» — the portfolios are not read. Everything
 * is end-to-end encrypted, so the figures are worked out here, each memoized on what it reads —
 * switching tabs recomputes nothing.
 *
 * What counts: the categories left out of the totals (e.g. «سرمایه‌گذاری», «فروش دارایی» in
 * the expenses) are left out here too — and shown apart (`apart`), with each project's spending,
 * which counts only in its project.
 */

import { useMemo } from 'react';
import { useFeature } from '../../shared/features/useFeature.js';
import { buildYearSeries, flowWindow, shamsiYearRange, summarizeYear } from '../../shared/flow/flowYear.js';
import { splitCounted } from '../../shared/categories/categoryStore.js';
import { useCategories } from '../../shared/categories/useCategories.js';
import { summarizeDollarValues } from '../../utils/dollarValue.js';
import { expenseInToman, expenseDollarValue, summarizeDollarValue } from '../../utils/expenseDocument.js';
import { useFxRates } from '../market/useFxRates.js';
import { usePricing } from '../market/index.js';
import { useUsdAt } from '../market/dailyHistory.js';
import { useIncomes } from '../incomes/hooks/useIncomes.js';
import { incomeDollarValue, incomeInToman } from '../../utils/incomeDocument.js';
import { useDailyExpenses } from '../expenses/hooks/useDailyExpenses.js';
import { useOptionalSubscriptions } from '../subscriptions/context/SubscriptionsContext.jsx';
import {
  investmentPoints,
  investmentShareByMonth,
  summarizeInvestmentShare,
  investmentBreakdown,
  dollarPoints,
  dollarFlowByMonth,
  cashFlowByMonth,
  summarizeCashFlow,
  reportInsights,
  subscriptionPayments,
  sumApart,
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
  const {
    yearExpenses, yearProjectExpenses = [], projects = [], loading: loadingExpenses, error: expenseError,
  } = useDailyExpenses(month, { enabled: hasExpenses, year: true });
  const pricing = usePricing();
  const usdToman = Number(pricing?.getAssetPrice?.('usd')) || 0;
  const usdAt = useUsdAt(true);
  // The rates bag (utils/currencies.js): the dollar's, and every other currency the year's
  // expenses and incomes are in
  const fx = useFxRates(useMemo(() => [...(yearExpenses || []), ...yearProjectExpenses, ...(incomes || [])], [yearExpenses, yearProjectExpenses, incomes]));
  const rates = useMemo(() => ({ usdToman, usdAt, ...fx }), [usdToman, usdAt, fx]);
  const incomeToman = (i) => incomeInToman(i, rates) || 0;

  // Counted, and inside the year (the windows hold the month before it too, for comparisons)
  const inYear = (date) => date >= range.from && date <= range.to;
  const counted = useMemo(() => ({
    incomes: splitCounted('income', incomes).counted,
    expenses: hasExpenses ? splitCounted('expense', yearExpenses).counted : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [incomes, yearExpenses, hasExpenses, exclusionKey]);

  // Month by month in tomans, by category
  const incomeSeries = useMemo(
    () => buildYearSeries(counted.incomes.map((i) => ({ date: i.incomeDate, amount: incomeToman(i), category: i.category })), jy, { throughMonth }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [counted, rates, jy, throughMonth],
  );
  const expenseSeries = useMemo(
    () => buildYearSeries(counted.expenses.map((e) => ({ date: e.date, amount: expenseInToman(e, rates) || 0, category: e.category })), jy, { throughMonth }),
    [counted, rates, jy, throughMonth],
  );
  const incomeYear = useMemo(() => summarizeYear(incomeSeries), [incomeSeries]);
  const expenseYear = useMemo(() => summarizeYear(expenseSeries), [expenseSeries]);

  // The cash flow: what was left each month, and the savings rate
  const cashMonths = useMemo(() => cashFlowByMonth(incomeSeries, expenseSeries), [incomeSeries, expenseSeries]);
  const cash = useMemo(() => summarizeCashFlow(cashMonths), [cashMonths]);

  // What was invested: the expenses recorded as «سرمایه‌گذاری» (left out of the expense totals)
  const points = useMemo(
    () => (hasExpenses ? investmentPoints(yearExpenses, (e) => expenseInToman(e, rates)) : []),
    [hasExpenses, yearExpenses, rates],
  );
  const shareMonths = useMemo(
    () => investmentShareByMonth(counted.incomes.map((i) => ({ date: i.incomeDate, amount: incomeToman(i) })), points, jy, { throughMonth }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [counted, points, rates, jy, throughMonth],
  );
  const shareYear = useMemo(() => summarizeInvestmentShare(shareMonths), [shareMonths]);
  const investedIn = useMemo(() => investmentBreakdown(points, range), [points, range]);

  // In dollars, each at its own day's rate (none at today's)
  const dollars = useMemo(() => {
    const inc = dollarPoints(counted.incomes.filter((i) => inYear(i.incomeDate)), (i) => i.incomeDate, (i) => incomeDollarValue(i, { ...rates, usdToman: 0 }));
    const exp = dollarPoints(counted.expenses.filter((e) => inYear(e.date)), (e) => e.date, (e) => expenseDollarValue(e, { ...rates, usdToman: 0 }));
    const months = dollarFlowByMonth(inc.points, exp.points, jy, { throughMonth, missing: [...inc.missing, ...exp.missing] });
    const income = months.reduce((s, m) => s + m.income, 0);
    const expense = months.reduce((s, m) => s + m.expense, 0);
    return { months, income, expense, net: income - expense, unpriced: inc.unpriced + exp.unpriced };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counted, usdAt, rates, jy, throughMonth, range]);
  // The dollar view of each side (what those dollars are worth today), for the yearly cards
  const incomeDollar = useMemo(
    () => summarizeDollarValues(counted.incomes.filter((i) => inYear(i.incomeDate)).map((i) => incomeDollarValue(i, rates)), usdToman),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [counted, rates, usdToman, range],
  );
  const expenseDollar = useMemo(
    () => summarizeDollarValue(counted.expenses.filter((e) => inYear(e.date)), rates),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [counted, rates, range],
  );

  // Left out of the totals, shown apart: the excluded categories and each project's spending
  const apart = useMemo(() => {
    const projectName = new Map(projects.map((p) => [p.id, p.name]));
    const toman = (e) => expenseInToman(e, rates) || 0;
    return {
      expenses: hasExpenses ? sumApart(splitCounted('expense', yearExpenses).excluded, { dateOf: (e) => e.date, keyOf: (e) => e.category, amountOf: toman, range }) : [],
      incomes: sumApart(splitCounted('income', incomes).excluded, { dateOf: (i) => i.incomeDate, keyOf: (i) => i.category, amountOf: incomeToman, range }),
      projects: hasExpenses
        ? sumApart(yearProjectExpenses, { dateOf: (e) => e.date, keyOf: (e) => e.groupId, amountOf: toman, range }).map((p) => ({ ...p, name: projectName.get(p.key) || 'پروژه' }))
        : [],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasExpenses, yearExpenses, yearProjectExpenses, projects, incomes, rates, range, exclusionKey]);

  // What each subscription cost this year: its payments (the counted expenses naming it)
  const subscriptions = useOptionalSubscriptions();
  const subscriptionYear = useMemo(
    () => (hasExpenses ? subscriptionPayments(counted.expenses, subscriptions, (e) => expenseInToman(e, rates), range) : null),
    [hasExpenses, counted, subscriptions, rates, range],
  );

  const insights = useMemo(
    () => reportInsights({ cash, expenseYear: hasExpenses ? expenseYear : null, invest: hasExpenses ? shareYear : null, subscriptions: subscriptionYear }),
    [cash, expenseYear, hasExpenses, shareYear, subscriptionYear],
  );

  return {
    hasExpenses,
    loading: loadingIncomes || (hasExpenses && loadingExpenses),
    errors: [incomeError, hasExpenses && expenseError].filter(Boolean),
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
    investedIn,
    subscriptionYear,
    apart,
    dollars,
    insights,
  };
}
