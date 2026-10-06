/**
 * OverviewView.jsx — The reports page's «خلاصه»: the year at a glance
 *
 * - The headline figures: income, expenses, what was left with the savings rate, what was
 *   invested with its share of income, and what was left in dollars
 * - What stands out (reportInsights), in plain sentences
 * - Income against expenses month by month (one scale), each month's net and savings rate
 * - Every month in one table, with the year's totals and a CSV export
 */

import React from 'react';
import { Wallet, Coins, PiggyBank, TrendingUp, DollarSign, Lightbulb, ThumbsUp, AlertTriangle, Info } from 'lucide-react';
import { MiniCard, GenericCsvExportButton } from '../../../shared/ui/index.js';
import { CHART_COLORS } from '../../../shared/ui/chartColors.js';
import { getExpenseCategory } from '../../expenses/constants/expenseCategories.js';
import MonthBarChart from '../MonthBarChart.jsx';

const INCOME_COLOR = CHART_COLORS[0];
const EXPENSE_COLOR = CHART_COLORS[1];
const TONE_ICON = { good: ThumbsUp, bad: AlertTriangle, info: Info };

/** One insight in a sentence */
function insightText(item, f) {
  switch (item.id) {
    case 'best-month':
      return <>بیشترین پس‌انداز در <strong>{item.month}</strong> بود: <strong>{f.compact(item.net)}</strong> تومان{item.rate !== null ? <> ({f.pct(item.rate)} درآمد)</> : null}.</>;
    case 'negative-months':
      return <>در <strong>{item.count.toLocaleString('fa-IR')}</strong> ماه از {item.months.toLocaleString('fa-IR')} ماه، هزینه از درآمد بیشتر بود.</>;
    case 'worst-month':
      return <>بیشترین کسری در <strong>{item.month}</strong>: <strong>{f.compact(-item.net)}</strong> تومان بیش از درآمد خرج شد.</>;
    case 'top-category':
      return <>بزرگ‌ترین دسته‌ی هزینه <strong>{getExpenseCategory(item.category).label}</strong> است: {f.pct(item.share)} کل هزینه‌ها ({f.compact(item.total)} تومان).</>;
    case 'costly-month':
      return <>هزینه‌ی <strong>{item.month}</strong> {f.pct(item.over)} بیشتر از میانگین ماهانه بود.</>;
    case 'invested-share':
      return <><strong>{f.pct(item.share)}</strong> درآمد سال ({f.compact(item.net)} تومان) سرمایه‌گذاری شد.</>;
    default:
      return null;
  }
}

const CSV_HEADERS = ['ماه', 'درآمد (تومان)', 'هزینه (تومان)', 'مانده (تومان)', 'نرخ پس‌انداز (٪)', 'سرمایه‌گذاری خالص (تومان)', 'سهم سرمایه‌گذاری از درآمد (٪)'];
const round1 = (v) => (v === null ? '' : Math.round(v * 10) / 10);

export default function OverviewView({ data, f, yearLabel }) {
  const { hasExpenses, incomeYear, expenseYear, cash, cashMonths, shareYear, shareMonths, dollars, insights } = data;
  const rows = cashMonths.map((m, i) => ({ ...m, invested: shareMonths[i]?.net || 0, investShare: shareMonths[i]?.share ?? null }));
  const totals = { income: cash.income, expense: cash.expense, net: cash.net, savingsRate: cash.savingsRate, invested: shareYear.net, investShare: shareYear.share };

  return (
    <div className="report-view">
      <div className="incomes-summary-grid report-summary">
        <MiniCard
          icon={<Wallet size={14} />}
          title={`درآمد ${yearLabel}`}
          value={f.money(incomeYear.total)}
          unit="تومان"
          color="green"
          className="incomes-summary-card is-primary"
          footer={<span>میانگین ماهانه {f.compact(incomeYear.monthlyAverage)}</span>}
        />
        {hasExpenses && (
          <MiniCard
            icon={<Coins size={14} />}
            title="هزینه‌ی سال"
            value={f.money(expenseYear.total)}
            unit="تومان"
            color="rose"
            className="incomes-summary-card"
            footer={<span>میانگین ماهانه {f.compact(expenseYear.monthlyAverage)}</span>}
          />
        )}
        {hasExpenses && (
          <MiniCard
            icon={<PiggyBank size={14} />}
            title="مانده (درآمد − هزینه)"
            value={f.money(cash.net)}
            unit="تومان"
            color={cash.net >= 0 ? 'green' : 'rose'}
            className="incomes-summary-card"
            footer={<span>نرخ پس‌انداز {f.pct(cash.savingsRate)}</span>}
          />
        )}
        <MiniCard
          icon={<TrendingUp size={14} />}
          title="سرمایه‌گذاری خالص"
          value={f.money(shareYear.net)}
          unit="تومان"
          color="blue"
          className="incomes-summary-card"
          footer={<span>{f.pct(shareYear.share)} درآمد</span>}
        />
        {hasExpenses && (
          <MiniCard
            icon={<DollarSign size={14} />}
            title="مانده به دلار"
            value={f.usd(dollars.net)}
            color={dollars.net >= 0 ? 'green' : 'rose'}
            className="incomes-summary-card"
            footer={<span>درآمد {f.usd(dollars.income)} · هزینه {f.usd(dollars.expense)}</span>}
          />
        )}
      </div>

      {insights.length > 0 && (
        <section className="portfolio-stat-card report-insights" aria-label="نکته‌های سال">
          <h3><Lightbulb size={16} aria-hidden="true" /> نکته‌های سال</h3>
          <ul>
            {insights.map((item) => {
              const Icon = TONE_ICON[item.tone] || Info;
              return (
                <li key={item.id} className={`is-${item.tone}`}>
                  <Icon size={15} aria-hidden="true" />
                  <span>{insightText(item, f)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {hasExpenses && (
        <MonthBarChart
          title={`درآمد و هزینه — ${yearLabel}`}
          months={cashMonths}
          series={[
            { key: 'income', label: 'درآمد', color: INCOME_COLOR, value: (m) => m.income },
            { key: 'expense', label: 'هزینه', color: EXPENSE_COLOR, value: (m) => m.expense },
          ]}
          format={f.compact}
          ariaValue={(m) => `درآمد ${f.compact(m.income)}، هزینه ${f.compact(m.expense)}`}
          readout={(m) => (
            <>
              <div>
                <strong className={m.net < 0 ? 'text-loss' : ''}>{f.compact(m.net)}</strong>
                <span><bdi>{m.label}</bdi>، مانده (درآمد − هزینه)</span>
              </div>
              <span className="report-readout-detail">نرخ پس‌انداز {f.pct(m.savingsRate)}</span>
            </>
          )}
        />
      )}

      <section className="portfolio-table-card report-table-card">
        <div className="portfolio-table-header">
          <div className="table-title">
            <div className="table-title-main"><h3>ماه‌به‌ماه</h3></div>
          </div>
          <GenericCsvExportButton
            items={rows}
            headers={CSV_HEADERS}
            fileBaseName={`گزارش-${yearLabel}`}
            disabled={!rows.length}
            mapRow={(r) => [r.label, Math.round(r.income), Math.round(r.expense), Math.round(r.net), round1(r.savingsRate), Math.round(r.invested), round1(r.investShare)]}
          />
        </div>
        <div className="table-card-body">
          <table className="flow-month-grid report-month-grid">
            <caption className="sr-only">درآمد، هزینه، مانده و سرمایه‌گذاری ماه‌به‌ماه</caption>
            <thead>
              <tr>
                <th scope="col">ماه</th>
                <th scope="col">درآمد</th>
                {hasExpenses && <th scope="col">هزینه</th>}
                {hasExpenses && <th scope="col">مانده</th>}
                {hasExpenses && <th scope="col">نرخ پس‌انداز</th>}
                <th scope="col">سرمایه‌گذاری خالص</th>
                <th scope="col">سهم از درآمد</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row">{r.monthLabel}</th>
                  <td>{f.compact(r.income)}</td>
                  {hasExpenses && <td>{f.compact(r.expense)}</td>}
                  {hasExpenses && <td className={r.net < 0 ? 'text-loss' : ''}>{f.compact(r.net)}</td>}
                  {hasExpenses && <td>{f.pct(r.savingsRate)}</td>}
                  <td className={r.invested < 0 ? 'text-loss' : ''}>{f.compact(r.invested)}</td>
                  <td>{f.pct(r.investShare)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">جمع سال</th>
                <td>{f.compact(totals.income)}</td>
                {hasExpenses && <td>{f.compact(totals.expense)}</td>}
                {hasExpenses && <td className={totals.net < 0 ? 'text-loss' : ''}>{f.compact(totals.net)}</td>}
                {hasExpenses && <td>{f.pct(totals.savingsRate)}</td>}
                <td className={totals.invested < 0 ? 'text-loss' : ''}>{f.compact(totals.invested)}</td>
                <td>{f.pct(totals.investShare)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}

