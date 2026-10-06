/**
 * ReportsPage.jsx — «گزارش‌ها»: a Shamsi year month by month across incomes, everyday expenses
 * and the portfolios
 *
 * - The share of income invested each month: what went into the portfolios (buys and dated
 *   holdings less sells and spends; reportMath.js) ÷ the month's income, with the year's share as
 *   the dashed line, and a table of the figures
 * - Income and expenses in dollars each month, each one at the dollar's rate on its own day
 * - The yearly reports of incomes and of everyday expenses (moved here from their pages): the
 *   year's cards, the chart month by month and the month-by-month table
 *
 * One download per year for each: incomes (1 request), everyday expenses (2: the sections, then
 * the year's expenses), the portfolios (3: the list, then every portfolio's holdings and
 * transactions of the year), and the dollar's daily history (cached for the session). Everything
 * is end-to-end encrypted, so the figures are worked out here, in the browser.
 */

import React, { useMemo, useState } from 'react';
import { ChartColumn, PiggyBank, Percent, Wallet, DollarSign } from 'lucide-react';
import { AlertBanner, FeaturePageHeader, MiniCard } from '../../shared/ui/index.js';
import Skeleton from '../../shared/ui/Skeleton.jsx';
import VaultUnlockCard from '../../shared/vault/VaultUnlockCard.jsx';
import { useVault } from '../../shared/vault/useVault.js';
import { usePrivacyMode } from '../../hooks/usePrivacyMode.js';
import { useFeature } from '../../shared/features/useFeature.js';
import { todayIso } from '../../shared/utils/dates.js';
import { formatCompactAmount } from '../../shared/utils/formatters.js';
import { formatUsd } from '../../shared/ui/DollarValue.jsx';
import { CHART_COLORS } from '../../shared/ui/chartColors.js';
import PeriodSwitcher from '../../shared/flow/PeriodSwitcher.jsx';
import YearFlowChart from '../../shared/flow/YearFlowChart.jsx';
import YearMonthTable from '../../shared/flow/YearMonthTable.jsx';
import { FlowYearCards } from '../../shared/flow/FlowCards.jsx';
import { formatAmountMasked } from '../../shared/flow/flowFormat.js';
import { buildYearSeries, flowWindow, formatShamsiYear, shamsiMonthOf, shamsiYearRange, summarizeYear } from '../../shared/flow/flowYear.js';
import { splitCounted } from '../../shared/categories/categoryStore.js';
import { useCategories } from '../../shared/categories/useCategories.js';
import { summarizeDollarValues } from '../../utils/dollarValue.js';
import { expenseInToman, expenseDollarValue, summarizeDollarValue } from '../../utils/expenseDocument.js';
import { usePricing } from '../market/index.js';
import { useUsdAt } from '../market/dailyHistory.js';
import { useIncomes } from '../incomes/hooks/useIncomes.js';
import { incomeDollarValue } from '../incomes/utils/incomeReport.js';
import { getIncomeCategory } from '../incomes/constants/incomeCategories.js';
import { useDailyExpenses } from '../expenses/hooks/useDailyExpenses.js';
import { getExpenseCategory } from '../expenses/constants/expenseCategories.js';
import { useInvestmentFlows } from './useInvestmentFlows.js';
import MonthBarChart from './MonthBarChart.jsx';
import {
  investmentPoints,
  investmentShareByMonth,
  summarizeInvestmentShare,
  dollarPoints,
  dollarFlowByMonth,
} from './reportMath.js';

const HEADER = {
  icon: <ChartColumn size={24} />,
  title: 'گزارش‌ها',
  subtitle: 'سال ماه‌به‌ماه: سهم سرمایه‌گذاری از درآمد، درآمد و هزینه به دلار، و گزارش سالانه‌ی درآمد و هزینه',
};

const MASK = '****';
const INCOME_COLOR = CHART_COLORS[0];
const EXPENSE_COLOR = CHART_COLORS[1];
const pct = (v) => `${v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('fa-IR', { maximumFractionDigits: Math.abs(v) < 10 ? 1 : 0 })}٪`;
const incomeLabel = (c) => getIncomeCategory(c).label;
const expenseLabel = (c) => getExpenseCategory(c).label;

function SectionHead({ title, subtitle }) {
  return (
    <div className="report-section-head">
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}

export default function ReportsPage() {
  const { status: vaultStatus } = useVault();
  const hideValues = usePrivacyMode();
  const hasExpenses = useFeature('expenses');
  const today = todayIso();
  const thisMonth = useMemo(() => shamsiMonthOf(today), [today]);
  const [month, setMonth] = useState(thisMonth);
  const jy = month.jy;
  const throughMonth = jy === thisMonth.jy ? thisMonth.jm : 12;
  // Re-read when a category is switched in or out of the totals
  const incomeCats = useCategories('income', { includeHidden: true });
  const expenseCats = useCategories('expense', { includeHidden: true });
  const exclusionKey = [...incomeCats, ...expenseCats].filter((c) => c.excluded).map((c) => c.value).join(',');

  const loadWindow = useMemo(() => flowWindow(jy), [jy]);
  const yearRange = useMemo(() => shamsiYearRange(jy), [jy]);
  const { incomes, loadingIncomes, error: incomeError } = useIncomes(loadWindow);
  const { yearExpenses, loading: loadingExpenses, error: expenseError } = useDailyExpenses({ jy, jm: 1 }, { enabled: hasExpenses, year: true });
  const invest = useInvestmentFlows(yearRange);
  const pricing = usePricing();
  const usdToman = Number(pricing?.getAssetPrice?.('usd')) || 0;
  const usdAt = useUsdAt(true);

  // What counts in the totals (the categories left out, e.g. «مدیریت نقدینگی», don't)
  const countedIncomes = useMemo(
    () => splitCounted('income', incomes).counted,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [incomes, exclusionKey],
  );
  const countedExpenses = useMemo(
    () => (hasExpenses ? splitCounted('expense', yearExpenses).counted : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasExpenses, yearExpenses, exclusionKey],
  );

  const incomeSeries = useMemo(
    () => buildYearSeries(countedIncomes.map((i) => ({ date: i.incomeDate, amount: Number(i.amount) || 0, category: i.category })), jy, { throughMonth }),
    [countedIncomes, jy, throughMonth],
  );
  const expenseSeries = useMemo(
    () => buildYearSeries(countedExpenses.map((e) => ({ date: e.date, amount: expenseInToman(e, usdToman, usdAt) || 0, category: e.category })), jy, { throughMonth }),
    [countedExpenses, usdToman, usdAt, jy, throughMonth],
  );
  const incomeYear = useMemo(() => summarizeYear(incomeSeries), [incomeSeries]);
  const expenseYear = useMemo(() => summarizeYear(expenseSeries), [expenseSeries]);
  const inYear = (date) => date >= yearRange.from && date <= yearRange.to;
  const incomeDollar = useMemo(
    () => summarizeDollarValues(countedIncomes.filter((i) => inYear(i.incomeDate)).map((i) => incomeDollarValue(i, usdToman, usdAt)), usdToman),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [countedIncomes, usdToman, usdAt, yearRange.from, yearRange.to],
  );
  const expenseDollar = useMemo(
    () => summarizeDollarValue(countedExpenses.filter((e) => inYear(e.date)), { usdToman, usdAt }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [countedExpenses, usdToman, usdAt, yearRange.from, yearRange.to],
  );

  // The share of income invested
  const shareMonths = useMemo(
    () => investmentShareByMonth(
      countedIncomes.map((i) => ({ date: i.incomeDate, amount: Number(i.amount) || 0 })),
      investmentPoints(invest.holdings, invest.transactions),
      jy,
      { throughMonth },
    ),
    [countedIncomes, invest.holdings, invest.transactions, jy, throughMonth],
  );
  const shareYear = useMemo(() => summarizeInvestmentShare(shareMonths), [shareMonths]);

  // Income and expenses in dollars, each at its own day's rate (none at today's)
  const dollars = useMemo(() => {
    const inc = dollarPoints(countedIncomes.filter((i) => inYear(i.incomeDate)), (i) => i.incomeDate, (i) => incomeDollarValue(i, 0, usdAt));
    const exp = dollarPoints(countedExpenses.filter((e) => inYear(e.date)), (e) => e.date, (e) => expenseDollarValue(e, 0, usdAt));
    const months = dollarFlowByMonth(inc.points, exp.points, jy, { throughMonth });
    const income = months.reduce((s, m) => s + m.income, 0);
    const expense = months.reduce((s, m) => s + m.expense, 0);
    return { months, income, expense, unpriced: inc.unpriced + exp.unpriced };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countedIncomes, countedExpenses, usdAt, jy, throughMonth, yearRange.from, yearRange.to]);

  if (vaultStatus === 'locked') {
    return (
      <div className="incomes-page-container">
        <FeaturePageHeader {...HEADER} />
        <VaultUnlockCard title="گزارش‌ها از داده‌های رمزنگاری‌شده‌ی شما ساخته می‌شوند" />
      </div>
    );
  }

  const money = (v) => formatAmountMasked(v, hideValues);
  const compact = (v) => (hideValues ? MASK : formatCompactAmount(v));
  const usd = (v) => (hideValues ? MASK : `${v < 0 ? '−' : ''}$${formatUsd(Math.abs(v))}`);
  const loading = loadingIncomes || (hasExpenses && loadingExpenses) || invest.loading;
  const errors = [incomeError, hasExpenses && expenseError, invest.error].filter(Boolean);
  const yearLabel = formatShamsiYear(jy);

  return (
    <div className="incomes-page-container reports-page">
      <FeaturePageHeader {...HEADER} />
      <PeriodSwitcher mode="year" month={month} thisMonth={thisMonth} onMonthChange={setMonth} />
      {errors.map((e) => <AlertBanner key={e} type="error" message={e} />)}

      {loading ? (
        <div className="reports-loading" role="status" aria-label="در حال ساختن گزارش">
          <Skeleton height={96} radius={16} />
          <Skeleton height={260} radius={16} />
          <Skeleton height={260} radius={16} />
        </div>
      ) : (
        <>
          <div className="incomes-summary-grid report-summary">
            <MiniCard
              icon={<Wallet size={14} />}
              title={`درآمد سال ${yearLabel}`}
              value={money(incomeYear.total)}
              unit="تومان"
              color="green"
              className="incomes-summary-card is-primary"
            />
            <MiniCard
              icon={<PiggyBank size={14} />}
              title="سرمایه‌گذاری خالص"
              value={money(shareYear.net)}
              unit="تومان"
              color="blue"
              className="incomes-summary-card"
              footer={<span>خرید {compact(shareYear.bought)} · فروش {compact(shareYear.sold)}</span>}
            />
            <MiniCard
              icon={<Percent size={14} />}
              title="سهم سرمایه‌گذاری از درآمد"
              value={shareYear.share === null ? '—' : hideValues ? MASK : pct(shareYear.share)}
              color="gold"
              className="incomes-summary-card"
            />
            {hasExpenses && (
              <MiniCard
                icon={<DollarSign size={14} />}
                title="مانده به دلار (درآمد − هزینه)"
                value={usd(dollars.income - dollars.expense)}
                color={dollars.income >= dollars.expense ? 'green' : 'rose'}
                className="incomes-summary-card"
                footer={<span>درآمد {usd(dollars.income)} · هزینه {usd(dollars.expense)}</span>}
              />
            )}
          </div>

          <section className="report-section" aria-labelledby="report-share">
            <SectionHead
              title={<span id="report-share">سهم سرمایه‌گذاری از درآمد</span>}
              subtitle="خرید دارایی‌ها در همه‌ی پورتفوها منهای فروش، تقسیم بر درآمد همان ماه. خرید با وام و جابه‌جایی دارایی‌ها (خرید با دارایی دیگر) حساب نمی‌شود."
            />
            <div className="report-grid">
              <MonthBarChart
                title={`سهم سرمایه‌گذاری از درآمد — ${yearLabel}`}
                months={shareMonths}
                series={[{ key: 'share', label: 'سهم از درآمد', color: INCOME_COLOR, value: (m) => m.share ?? 0 }]}
                negativeColor={EXPENSE_COLOR}
                format={(v) => (hideValues ? MASK : pct(v))}
                average={shareYear.share}
                averageLabel="کل سال"
                ariaValue={(m) => (m.share === null ? 'بدون درآمد' : hideValues ? 'پنهان' : `${pct(m.share)} از درآمد`)}
                readout={(m) => (
                  <>
                    <div>
                      <strong>{m.share === null ? '—' : hideValues ? MASK : pct(m.share)}</strong>
                      <span><bdi>{m.label}</bdi>{m.share === null && m.net !== 0 ? '، بدون درآمد ثبت‌شده' : ''}</span>
                    </div>
                    <span className="report-readout-detail">
                      درآمد {compact(m.income)} · خرید {compact(m.bought)} · فروش {compact(m.sold)} · خالص {compact(m.net)}
                    </span>
                  </>
                )}
              />
              <div className="portfolio-table-card report-table-card">
                <div className="table-card-body">
                  <table className="flow-month-grid report-month-grid">
                    <caption className="sr-only">سهم سرمایه‌گذاری از درآمد، ماه‌به‌ماه</caption>
                    <thead>
                      <tr><th scope="col">ماه</th><th scope="col">درآمد</th><th scope="col">سرمایه‌گذاری خالص</th><th scope="col">سهم</th></tr>
                    </thead>
                    <tbody>
                      {shareMonths.map((m) => (
                        <tr key={m.key}>
                          <th scope="row">{m.monthLabel}</th>
                          <td>{compact(m.income)}</td>
                          <td className={m.net < 0 ? 'text-loss' : ''}>{compact(m.net)}</td>
                          <td>{m.share === null ? '—' : hideValues ? MASK : pct(m.share)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>

          {hasExpenses && (
            <section className="report-section" aria-labelledby="report-dollars">
              <SectionHead
                title={<span id="report-dollars">درآمد و هزینه به دلار</span>}
                subtitle="هر درآمد و هزینه به نرخ دلار همان روز (نرخ ثبت‌شده‌ی خودش، وگرنه تاریخچه‌ی قیمت)."
              />
              <MonthBarChart
                title={`درآمد و هزینه به دلار — ${yearLabel}`}
                months={dollars.months}
                series={[
                  { key: 'income', label: 'درآمد', color: INCOME_COLOR, value: (m) => m.income },
                  { key: 'expense', label: 'هزینه', color: EXPENSE_COLOR, value: (m) => m.expense },
                ]}
                format={usd}
                ariaValue={(m) => (hideValues ? 'پنهان' : `درآمد ${usd(m.income)}، هزینه ${usd(m.expense)}`)}
                readout={(m) => (
                  <>
                    <div>
                      <strong className={m.net < 0 ? 'text-loss' : ''}>{usd(m.net)}</strong>
                      <span><bdi>{m.label}</bdi>، مانده (درآمد − هزینه)</span>
                    </div>
                    <span className="report-readout-detail">درآمد {usd(m.income)} · هزینه {usd(m.expense)}</span>
                  </>
                )}
              />
              {dollars.unpriced > 0 && (
                <p className="report-footnote">
                  {dollars.unpriced.toLocaleString('fa-IR')} مورد نرخ دلار روزش معلوم نبود و در این نمودار حساب نشده است.
                </p>
              )}
            </section>
          )}

          <section className="report-section" aria-labelledby="report-incomes">
            <SectionHead title={<span id="report-incomes">درآمد سالانه</span>} />
            <FlowYearCards
              kind="income"
              yearLabel={yearLabel}
              summary={incomeYear}
              topCategory={incomeYear.byCategory[0] ? { label: incomeLabel(incomeYear.byCategory[0].category), total: incomeYear.byCategory[0].total } : null}
              hideValues={hideValues}
              dollar={incomeDollar}
            />
            <div className="report-grid">
              <YearFlowChart series={incomeSeries} kind="income" labelOf={incomeLabel} categoryOrder={incomeYear.byCategory.map((c) => c.category)} hideValues={hideValues} large />
              <YearMonthTable series={incomeSeries} kind="income" hideValues={hideValues} />
            </div>
          </section>

          {hasExpenses && (
            <section className="report-section" aria-labelledby="report-expenses">
              <SectionHead title={<span id="report-expenses">هزینه‌ی سالانه</span>} subtitle="هزینه‌های روزمره (هزینه‌های پروژه‌ها جدا حساب می‌شوند)." />
              <FlowYearCards
                kind="expense"
                yearLabel={yearLabel}
                summary={expenseYear}
                topCategory={expenseYear.byCategory[0] ? { label: expenseLabel(expenseYear.byCategory[0].category), total: expenseYear.byCategory[0].total } : null}
                hideValues={hideValues}
                dollar={expenseDollar}
              />
              <div className="report-grid">
                <YearFlowChart series={expenseSeries} kind="expense" labelOf={expenseLabel} categoryOrder={expenseYear.byCategory.map((c) => c.category)} hideValues={hideValues} large />
                <YearMonthTable series={expenseSeries} kind="expense" hideValues={hideValues} />
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

