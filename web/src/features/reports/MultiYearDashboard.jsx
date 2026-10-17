/**
 * MultiYearDashboard.jsx — Several Shamsi years on one page: the totals of the span, each year as
 * a pair of bars (income / expenses), and a table year by year with the change from the year
 * before and a CSV. Figures come from useMultiYearReport (summarizeYears).
 */

import { intlLocale, t } from '../../utils/i18n.js';
import React from 'react';
import { Wallet, Coins, PiggyBank, TrendingUp } from 'lucide-react';
import { MiniCard, GenericCsvExportButton } from '../../shared/ui/index.js';
import { CHART_COLORS } from '../../shared/ui/chartColors.js';
import { formatShamsiYear } from '../../shared/flow/flowYear.js';
import MonthBarChart from './MonthBarChart.jsx';
import ReportCard from './ReportCard.jsx';

const INCOME_COLOR = CHART_COLORS[0];
const EXPENSE_COLOR = CHART_COLORS[1];
const CSV_HEADERS = [t('سال'), t('درآمد (تومان)'), t('هزینه (تومان)'), t('مانده (تومان)'), t('نرخ پس‌انداز (٪)'), t('سرمایه‌گذاری (تومان)')];
const round1 = (v) => (v === null || v === undefined ? '' : Math.round(v * 10) / 10);
const sum = (rows, key) => rows.reduce((s, r) => s + r[key], 0);

/** A change against the year before: «+۱۲٪», «—» when there is nothing to compare with */
const changeText = (v, f) => (v === null ? '—' : `${v > 0 ? '+' : ''}${f.pct(v)}`);

/**
 * @param {{ rows: ReturnType<import('./reportMath.js').summarizeYears>, hasExpenses: boolean,
 *   f: object }} props
 */
export default function MultiYearDashboard({ rows, hasExpenses, f }) {
  const years = rows.map((r) => ({ ...r, key: String(r.jy), label: formatShamsiYear(r.jy), monthLabel: formatShamsiYear(r.jy) }));
  const income = sum(rows, 'income');
  const expense = sum(rows, 'expense');
  const net = income - expense;
  const count = rows.length || 1;
  const series = [
    { key: 'income', label: t('درآمد'), color: INCOME_COLOR, value: (y) => y.income },
    ...(hasExpenses ? [{ key: 'expense', label: t('هزینه'), color: EXPENSE_COLOR, value: (y) => y.expense }] : []),
  ];
  const span = `${formatShamsiYear(rows[0]?.jy)}–${formatShamsiYear(rows[rows.length - 1]?.jy)}`;

  return (
    <div className="report-dash">
      <div className="incomes-summary-grid report-kpis span-12">
        <MiniCard icon={<Wallet size={14} />} title={t('درآمد {span}', { span })} value={f.money(income)} unit={t('تومان')} color="green" className="incomes-summary-card is-primary" footer={<span>{t('میانگین سالانه {value}', { value: f.compact(income / count) })}</span>} />
        {hasExpenses && (
          <MiniCard icon={<Coins size={14} />} title={t('هزینه‌ی این سال‌ها')} value={f.money(expense)} unit={t('تومان')} color="rose" className="incomes-summary-card" footer={<span>{t('میانگین سالانه {value}', { value: f.compact(expense / count) })}</span>} />
        )}
        {hasExpenses && (
          <MiniCard icon={<PiggyBank size={14} />} title={t('مانده (درآمد − هزینه)')} value={f.money(net)} unit={t('تومان')} color={net >= 0 ? 'green' : 'rose'} className="incomes-summary-card" footer={<span>{t('نرخ پس‌انداز {value}', { value: f.pct(income > 0 ? (net / income) * 100 : null) })}</span>} />
        )}
        {hasExpenses && (
          <MiniCard icon={<TrendingUp size={14} />} title={t('سرمایه‌گذاری')} value={f.money(sum(rows, 'invested'))} unit={t('تومان')} color="blue" className="incomes-summary-card" footer={<span>{t('میانگین سالانه {value}', { value: f.compact(sum(rows, 'invested') / count) })}</span>} />
        )}
      </div>

      <div className="span-12">
        <MonthBarChart
          compact
          title={t('درآمد و هزینه سال‌به‌سال')}
          months={years}
          series={series}
          format={f.compact}
          ariaValue={(y) => t('درآمد {income}، هزینه {expense}', { income: f.compact(y.income), expense: f.compact(y.expense) })}
          readout={(y) => (
            <>
              <div>
                <strong className={y.net < 0 ? 'text-loss' : ''}>{f.compact(y.net)}</strong>
                <span><bdi>{y.label}</bdi></span>
              </div>
              {y.months < 12 && <span className="report-readout-detail">{t('{n} ماه اول سال', { n: y.months.toLocaleString(intlLocale()) })}</span>}
            </>
          )}
        />
      </div>

      <ReportCard
        title={t('سال‌به‌سال')}
        span="span-12"
        className="report-table-card"
        actions={(
          <GenericCsvExportButton
            items={years}
            headers={CSV_HEADERS}
            fileBaseName={t('گزارش-{year}', { year: span })}
            disabled={!years.length}
            mapRow={(y) => [y.label, Math.round(y.income), Math.round(y.expense), Math.round(y.net), round1(y.savingsRate), Math.round(y.invested)]}
          />
        )}
      >
        <div className="report-table-scroll">
          <table className="flow-month-grid report-month-grid">
            <caption className="sr-only">{t('درآمد، هزینه، مانده و سرمایه‌گذاری سال‌به‌سال')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('سال')}</th>
                <th scope="col">{t('درآمد')}</th>
                <th scope="col">{t('تغییر درآمد')}</th>
                {hasExpenses && <th scope="col">{t('هزینه')}</th>}
                {hasExpenses && <th scope="col">{t('تغییر هزینه')}</th>}
                {hasExpenses && <th scope="col">{t('مانده')}</th>}
                {hasExpenses && <th scope="col">{t('نرخ پس‌انداز')}</th>}
                {hasExpenses && <th scope="col">{t('سرمایه‌گذاری')}</th>}
              </tr>
            </thead>
            <tbody>
              {years.map((y) => (
                <tr key={y.key}>
                  <th scope="row">{y.label}{y.months < 12 && <span title={t('{n} ماه اول سال', { n: y.months.toLocaleString(intlLocale()) })}>*</span>}</th>
                  <td>{f.compact(y.income)}</td>
                  <td>{changeText(y.incomeChange, f)}</td>
                  {hasExpenses && <td>{f.compact(y.expense)}</td>}
                  {hasExpenses && <td>{changeText(y.expenseChange, f)}</td>}
                  {hasExpenses && <td className={y.net < 0 ? 'text-loss' : ''}>{f.compact(y.net)}</td>}
                  {hasExpenses && <td>{f.pct(y.savingsRate)}</td>}
                  {hasExpenses && <td>{f.compact(y.invested)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="report-table-note">{t('نرخ‌های ارز هر رکورد، نرخ همان روز است. سال جاری فقط تا همین ماه حساب شده است.')}</p>
      </ReportCard>
    </div>
  );
}
