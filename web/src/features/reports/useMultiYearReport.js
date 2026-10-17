/**
 * useMultiYearReport.js — Several Shamsi years side by side (the reports page's «چندساله» view)
 *
 * One download per source for the whole span: incomes (1 request) and everyday expenses (2).
 * Everything is end-to-end encrypted, so the totals are worked out here, once per span. Only
 * the yearly totals are kept (summarizeYears); the monthly detail stays in the one-year view.
 * The categories left out of the totals are left out here too, as in useReportData.
 */

import { useMemo } from 'react';
import { useFeature } from '../../shared/features/useFeature.js';
import { flowWindow } from '../../shared/flow/flowYear.js';
import { splitCounted } from '../../shared/categories/categoryStore.js';
import { useCategories } from '../../shared/categories/useCategories.js';
import { expenseInToman } from '../../utils/expenseDocument.js';
import { incomeInToman } from '../../utils/incomeDocument.js';
import { useFxRates } from '../market/useFxRates.js';
import { usePricing } from '../market/index.js';
import { useUsdAt } from '../market/dailyHistory.js';
import { useIncomes } from '../incomes/hooks/useIncomes.js';
import { useDailyExpenses } from '../expenses/hooks/useDailyExpenses.js';
import { investmentPoints, summarizeYears } from './reportMath.js';

/**
 * @param {number} endJy the last Shamsi year
 * @param {number} years how many years, the last one included
 * @param {number} throughMonth the last month counted of the last year
 */
export function useMultiYearReport(endJy, years, throughMonth) {
  const hasExpenses = useFeature('expenses');
  const incomeCats = useCategories('income', { includeHidden: true });
  const expenseCats = useCategories('expense', { includeHidden: true });
  const exclusionKey = [...incomeCats, ...expenseCats].filter((c) => c.excluded).map((c) => c.value).join(',');

  const loadWindow = useMemo(() => flowWindow(endJy, years), [endJy, years]);
  const month = useMemo(() => ({ jy: endJy, jm: 1 }), [endJy]);
  const { incomes, loadingIncomes, error: incomeError } = useIncomes(loadWindow);
  const { yearExpenses, loading: loadingExpenses, error: expenseError } = useDailyExpenses(month, { enabled: hasExpenses, year: true, years });
  const pricing = usePricing();
  const usdToman = Number(pricing?.getAssetPrice?.('usd')) || 0;
  const usdAt = useUsdAt(true);
  const fx = useFxRates(useMemo(() => [...(yearExpenses || []), ...(incomes || [])], [yearExpenses, incomes]));
  const rates = useMemo(() => ({ usdToman, usdAt, ...fx }), [usdToman, usdAt, fx]);

  const rows = useMemo(() => {
    const counted = {
      incomes: splitCounted('income', incomes).counted,
      expenses: hasExpenses ? splitCounted('expense', yearExpenses).counted : [],
    };
    return summarizeYears({
      incomes: counted.incomes.map((i) => ({ date: i.incomeDate, amount: incomeInToman(i, rates) || 0 })),
      expenses: counted.expenses.map((e) => ({ date: e.date, amount: expenseInToman(e, rates) || 0 })),
      invested: hasExpenses ? investmentPoints(yearExpenses, (e) => expenseInToman(e, rates)) : [],
    }, endJy, years, { throughMonth });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomes, yearExpenses, hasExpenses, rates, endJy, years, throughMonth, exclusionKey]);

  return {
    hasExpenses,
    loading: loadingIncomes || (hasExpenses && loadingExpenses),
    errors: [incomeError, hasExpenses && expenseError].filter(Boolean),
    rows,
  };
}
