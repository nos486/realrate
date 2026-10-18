// @vitest-environment happy-dom
/**
 * reportDashboardMulti.test.jsx — The multi-year report is the yearly page over a longer span:
 * the same sections month by month, plus the year-by-year card
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { buildYearSeries, summarizeYear } from '../../../web/src/shared/flow/flowYear.js';
import { cashFlowByMonth, summarizeCashFlow, investmentShareByMonth, summarizeInvestmentShare, dollarFlowByMonth, summarizeYears } from '../../../web/src/features/reports/reportMath.js';
import { reportFormatters } from '../../../web/src/features/reports/reportFormat.js';
import ReportDashboard from '../../../web/src/features/reports/ReportDashboard.jsx';

afterEach(cleanup);

const day = (jy, jm) => `${jy + 621}-${String(((jm + 1) % 12) + 1).padStart(2, '0')}-15`;

function dataFor(jy, years) {
  const incomes = [];
  const expenses = [];
  for (let y = jy - years + 1; y <= jy; y++) {
    for (let m = 1; m <= 12; m++) {
      incomes.push({ date: day(y, m), amount: 1000, category: 'salary' });
      expenses.push({ date: day(y, m), amount: 400, category: 'food' });
    }
  }
  const incomeSeries = buildYearSeries(incomes, jy, { years });
  const expenseSeries = buildYearSeries(expenses, jy, { years });
  const cashMonths = cashFlowByMonth(incomeSeries, expenseSeries);
  const shareMonths = investmentShareByMonth(incomes, [], jy, { years });
  return {
    hasExpenses: true,
    incomeSeries,
    expenseSeries,
    incomeYear: summarizeYear(incomeSeries),
    expenseYear: summarizeYear(expenseSeries),
    cashMonths,
    cash: summarizeCashFlow(cashMonths),
    shareMonths,
    shareYear: summarizeInvestmentShare(shareMonths),
    investedIn: [],
    subscriptionYear: null,
    apart: { expenses: [], incomes: [], projects: [] },
    dollars: { months: dollarFlowByMonth([], [], jy, { years }), income: 0, expense: 0, net: 0, unpriced: 0 },
    yearly: years > 1 ? summarizeYears({ incomes, expenses, invested: [] }, jy, years) : [],
    insights: [],
  };
}

describe('ReportDashboard over several years', () => {
  it('lists every month of the span in the table and adds the year-by-year card', () => {
    const { container } = render(<ReportDashboard data={dataFor(1405, 3)} f={reportFormatters(false)} yearLabel="۱۴۰۳–۱۴۰۵" hideValues={false} years={3} />);
    expect(screen.getByText('سال‌به‌سال')).toBeTruthy();
    expect(screen.getByText('جمع بازه')).toBeTruthy();
    const monthTable = [...container.querySelectorAll('table')].find((t) => t.querySelector('tfoot'));
    expect(monthTable.querySelectorAll('tbody tr')).toHaveLength(36);
  });

  it('keeps the one-year page without the year-by-year card', () => {
    const { container } = render(<ReportDashboard data={dataFor(1405, 1)} f={reportFormatters(false)} yearLabel="۱۴۰۵" hideValues={false} years={1} />);
    expect(screen.queryByText('سال‌به‌سال')).toBeNull();
    expect(screen.getByText('جمع سال')).toBeTruthy();
    const monthTable = [...container.querySelectorAll('table')].find((t) => t.querySelector('tfoot'));
    expect(monthTable.querySelectorAll('tbody tr')).toHaveLength(12);
  });
});
