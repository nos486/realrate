/**
 * ReportDashboard.jsx — The whole year on one page, in a grid of cards (12 columns on a wide
 * screen, 2 on a medium one, 1 on a phone), laid out to read — and later print — as one report:
 *
 *   ┌──────────────────────────── the year's figures ────────────────────────────┐
 *   │ income against expenses (7)              │ what stands out (5)             │
 *   │ income by month and source (6)           │ expenses by month and category  │
 *   │ income sources (4) │ expense categories (4) │ what was invested in (4)     │
 *   │ share of income invested (6)             │ income and expenses in $ (6)    │
 *   │ every month in one table, with totals and CSV (12)                         │
 *   │ the year's investments, table (6)        │ the year's subscriptions (6)    │
 *   │ left out of the totals, apart (6)        │ how the figures are worked (6)  │
 *   └────────────────────────────────────────────────────────────────────────────┘
 *
 * Every figure comes from useReportData (worked out once per year). What was invested is the
 * expenses recorded as «سرمایه‌گذاری»; without the expenses feature those cards are left out.
 */

import React from 'react';
import { Wallet, Coins, PiggyBank, TrendingUp, DollarSign, Percent, Lightbulb, ThumbsUp, AlertTriangle, Info, BookOpen, CalendarSync, EyeOff } from 'lucide-react';
import { MiniCard, GenericCsvExportButton } from '../../shared/ui/index.js';
import DonutChart from '../../shared/ui/DonutChart.jsx';
import { CHART_COLORS } from '../../shared/ui/chartColors.js';
import YearFlowChart from '../../shared/flow/YearFlowChart.jsx';
import { resolveAssetDisplayName } from '../../config/sourceRegistry.js';
import { getIncomeCategory } from '../incomes/constants/incomeCategories.js';
import { getExpenseCategory } from '../expenses/constants/expenseCategories.js';
import MonthBarChart from './MonthBarChart.jsx';

const INCOME_COLOR = CHART_COLORS[0];
const EXPENSE_COLOR = CHART_COLORS[1];
const TONE_ICON = { good: ThumbsUp, bad: AlertTriangle, info: Info };
const incomeLabel = (c) => getIncomeCategory(c).label;
const expenseLabel = (c) => getExpenseCategory(c).label;
/** What an investment went into: its asset's name, else the expense's own title */
const investedName = (a) => (a.assetId ? resolveAssetDisplayName(a.assetId) || a.assetId : a.title || 'بدون عنوان');

/** A card of the grid with a title (charts and donuts bring their own) */
function ReportCard({ title, Icon = null, actions = null, span, className = '', children }) {
  return (
    <section className={`portfolio-stat-card report-card ${span} ${className}`}>
      <header className="report-card-head">
        <h3>{Icon && <Icon size={15} aria-hidden="true" />}{title}</h3>
        {actions}
      </header>
      {children}
    </section>
  );
}

/** One insight in a sentence */
function insightText(item, f) {
  switch (item.id) {
    case 'best-month':
      return <>بیشترین پس‌انداز در <strong>{item.month}</strong>: <strong>{f.compact(item.net)}</strong> تومان{item.rate !== null ? <> ({f.pct(item.rate)} درآمد)</> : null}.</>;
    case 'negative-months':
      return <>در <strong>{item.count.toLocaleString('fa-IR')}</strong> ماه از {item.months.toLocaleString('fa-IR')} ماه، هزینه از درآمد بیشتر بود.</>;
    case 'worst-month':
      return <>بیشترین کسری در <strong>{item.month}</strong>: <strong>{f.compact(-item.net)}</strong> تومان بیش از درآمد.</>;
    case 'top-category':
      return <>بزرگ‌ترین دسته‌ی هزینه <strong>{expenseLabel(item.category)}</strong>: {f.pct(item.share)} کل هزینه‌ها ({f.compact(item.total)} تومان).</>;
    case 'costly-month':
      return <>هزینه‌ی <strong>{item.month}</strong> {f.pct(item.over)} بیشتر از میانگین ماهانه بود.</>;
    case 'invested-share':
      return <><strong>{f.pct(item.share)}</strong> درآمد سال ({f.compact(item.invested)} تومان) سرمایه‌گذاری شد.</>;
    case 'subscriptions-share':
      return <>اشتراک‌ها <strong>{f.pct(item.share)}</strong> هزینه‌های سال بودند ({f.compact(item.total)} تومان).</>;
    default:
      return null;
  }
}

const donutOf = (byCategory, metaOf) => byCategory.map((c) => {
  const meta = metaOf(c.category);
  return { key: c.category, label: meta.label, value: c.total, icon: <meta.Icon size={12} /> };
});

const CSV_HEADERS = ['ماه', 'درآمد (تومان)', 'هزینه (تومان)', 'مانده (تومان)', 'نرخ پس‌انداز (٪)', 'سرمایه‌گذاری (تومان)', 'سهم سرمایه‌گذاری از درآمد (٪)', 'درآمد (دلار)', 'هزینه (دلار)'];
const round1 = (v) => (v === null || v === undefined ? '' : Math.round(v * 10) / 10);

export default function ReportDashboard({ data, f, yearLabel, hideValues }) {
  const { hasExpenses, incomeSeries, expenseSeries, incomeYear, expenseYear, cash, cashMonths, shareMonths, shareYear, investedIn, subscriptionYear, apart, dollars, insights } = data;
  const apartRows = apart ? [
    ...apart.expenses.map((r) => ({ key: `e:${r.key}`, kind: 'هزینه', label: expenseLabel(r.key), ...r })),
    ...apart.projects.map((r) => ({ key: `p:${r.key}`, kind: 'پروژه', label: r.name, ...r })),
    ...apart.incomes.map((r) => ({ key: `i:${r.key}`, kind: 'درآمد', label: incomeLabel(r.key), ...r })),
  ] : [];
  const rows = cashMonths.map((m, i) => ({
    ...m,
    invested: shareMonths[i]?.invested || 0,
    investShare: shareMonths[i]?.share ?? null,
    incomeUsd: dollars.months[i]?.income || 0,
    expenseUsd: dollars.months[i]?.expense || 0,
    unpriced: dollars.months[i]?.unpriced || 0,
  }));
  const investDonut = investedIn.map((a) => ({ key: a.key, label: investedName(a), value: a.total }));

  return (
    <div className="report-dash">
      {/* The year's figures */}
      <div className="incomes-summary-grid report-kpis span-12">
        <MiniCard icon={<Wallet size={14} />} title={`درآمد ${yearLabel}`} value={f.money(incomeYear.total)} unit="تومان" color="green" className="incomes-summary-card is-primary" footer={<span>میانگین ماهانه {f.compact(incomeYear.monthlyAverage)}</span>} />
        {hasExpenses && (
          <MiniCard icon={<Coins size={14} />} title="هزینه‌ی سال" value={f.money(expenseYear.total)} unit="تومان" color="rose" className="incomes-summary-card" footer={<span>میانگین ماهانه {f.compact(expenseYear.monthlyAverage)}</span>} />
        )}
        {hasExpenses && (
          <MiniCard icon={<PiggyBank size={14} />} title="مانده (درآمد − هزینه)" value={f.money(cash.net)} unit="تومان" color={cash.net >= 0 ? 'green' : 'rose'} className="incomes-summary-card" footer={<span>میانگین ماهانه {f.compact(cash.monthlyNet)}</span>} />
        )}
        {hasExpenses && (
          <MiniCard icon={<Percent size={14} />} title="نرخ پس‌انداز" value={f.pct(cash.savingsRate)} color="gold" className="incomes-summary-card" footer={<span>{cash.negativeMonths ? `${cash.negativeMonths.toLocaleString('fa-IR')} ماه با کسری` : 'بدون ماه کسری'}</span>} />
        )}
        {hasExpenses && (
          <MiniCard icon={<TrendingUp size={14} />} title="سرمایه‌گذاری" value={f.money(shareYear.invested)} unit="تومان" color="blue" className="incomes-summary-card" footer={<span>{f.pct(shareYear.share)} درآمد</span>} />
        )}
        {hasExpenses && (
          <MiniCard icon={<DollarSign size={14} />} title="مانده به دلار" value={f.usd(dollars.net)} color={dollars.net >= 0 ? 'green' : 'rose'} className="incomes-summary-card" footer={<span>درآمد {f.usd(dollars.income)} · هزینه {f.usd(dollars.expense)}</span>} />
        )}
      </div>

      {/* Income against expenses, and what stands out */}
      {hasExpenses && (
        <div className="span-7">
          <MonthBarChart
            compact
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
                  <span><bdi>{m.label}</bdi>، مانده</span>
                </div>
                <span className="report-readout-detail">نرخ پس‌انداز {f.pct(m.savingsRate)}</span>
              </>
            )}
          />
        </div>
      )}
      <ReportCard title="نکته‌های سال" Icon={Lightbulb} span={hasExpenses ? 'span-5' : 'span-12'} className="report-insights">
        {insights.length ? (
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
        ) : (
          <p className="report-empty">با ثبت درآمد و هزینه‌های سال، نکته‌های مهم آن این‌جا می‌آید.</p>
        )}
      </ReportCard>

      {/* Month by month, by source and by category */}
      <div className={hasExpenses ? 'span-6' : 'span-12'}>
        <YearFlowChart series={incomeSeries} kind="income" labelOf={incomeLabel} categoryOrder={incomeYear.byCategory.map((c) => c.category)} hideValues={hideValues} />
      </div>
      {hasExpenses && (
        <div className="span-6">
          <YearFlowChart series={expenseSeries} kind="expense" labelOf={expenseLabel} categoryOrder={expenseYear.byCategory.map((c) => c.category)} hideValues={hideValues} />
        </div>
      )}

      {/* Where it came from and where it went */}
      <div className="span-4">
        <DonutChart title="منابع درآمد" items={donutOf(incomeYear.byCategory, getIncomeCategory)} centerLabel={`درآمد ${yearLabel}`} masked={hideValues} emptyMessage="درآمدی در این سال ثبت نشده است." />
      </div>
      {hasExpenses && (
        <div className="span-4">
          <DonutChart title="دسته‌های هزینه" items={donutOf(expenseYear.byCategory, getExpenseCategory)} centerLabel={`هزینه ${yearLabel}`} masked={hideValues} emptyMessage="هزینه‌ای در این سال ثبت نشده است." />
        </div>
      )}
      {hasExpenses && (
        <div className="span-4">
          <DonutChart title="سرمایه‌گذاری در" items={investDonut} centerLabel={`سرمایه‌گذاری ${yearLabel}`} masked={hideValues} emptyMessage="هزینه‌ای با دسته‌ی «سرمایه‌گذاری» ثبت نشده است." />
        </div>
      )}

      {/* The share of income invested, and the year in dollars */}
      {hasExpenses && (
      <div className="span-6">
        <MonthBarChart
          compact
          title="سهم سرمایه‌گذاری از درآمد"
          months={shareMonths}
          series={[{ key: 'share', label: 'سهم از درآمد', color: CHART_COLORS[2], value: (m) => m.share ?? 0 }]}
          negativeColor={EXPENSE_COLOR}
          format={f.pct}
          average={shareYear.share}
          averageLabel="کل سال"
          ariaValue={(m) => (m.share === null ? 'بدون درآمد' : `${f.pct(m.share)} از درآمد`)}
          readout={(m) => (
            <>
              <div>
                <strong>{f.pct(m.share)}</strong>
                <span><bdi>{m.label}</bdi></span>
              </div>
              <span className="report-readout-detail">سرمایه‌گذاری {f.compact(m.invested)} از درآمد {f.compact(m.income)}</span>
            </>
          )}
        />
      </div>
      )}
      {hasExpenses && (
        <div className="span-6">
          <MonthBarChart
            compact
            title="درآمد و هزینه به دلار"
            months={dollars.months}
            series={[
              { key: 'income', label: 'درآمد', color: INCOME_COLOR, value: (m) => m.income },
              { key: 'expense', label: 'هزینه', color: EXPENSE_COLOR, value: (m) => m.expense },
            ]}
            format={f.usd}
            ariaValue={(m) => `درآمد ${f.usd(m.income)}، هزینه ${f.usd(m.expense)}`}
            readout={(m) => (
              <>
                <div>
                  <strong className={m.net < 0 ? 'text-loss' : ''}>{f.usd(m.net)}</strong>
                  <span><bdi>{m.label}</bdi>، مانده</span>
                </div>
                {m.unpriced > 0 && <span className="report-readout-detail">{m.unpriced.toLocaleString('fa-IR')} مورد بدون نرخ دلار</span>}
              </>
            )}
          />
        </div>
      )}

      {/* Every month in one table */}
      <ReportCard
        title="ماه‌به‌ماه"
        span="span-12"
        className="report-table-card"
        actions={(
          <GenericCsvExportButton
            items={rows}
            headers={CSV_HEADERS}
            fileBaseName={`گزارش-${yearLabel}`}
            disabled={!rows.length}
            mapRow={(r) => [r.label, Math.round(r.income), Math.round(r.expense), Math.round(r.net), round1(r.savingsRate), Math.round(r.invested), round1(r.investShare), Math.round(r.incomeUsd), Math.round(r.expenseUsd)]}
          />
        )}
      >
        <div className="report-table-scroll">
          <table className="flow-month-grid report-month-grid">
            <caption className="sr-only">درآمد، هزینه، مانده، سرمایه‌گذاری و ارزش دلاری ماه‌به‌ماه</caption>
            <thead>
              <tr>
                <th scope="col">ماه</th>
                <th scope="col">درآمد</th>
                {hasExpenses && <th scope="col">هزینه</th>}
                {hasExpenses && <th scope="col">مانده</th>}
                {hasExpenses && <th scope="col">نرخ پس‌انداز</th>}
                {hasExpenses && <th scope="col">سرمایه‌گذاری</th>}
                {hasExpenses && <th scope="col">سهم از درآمد</th>}
                <th scope="col">درآمد $</th>
                {hasExpenses && <th scope="col">هزینه $</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row">
                    {r.monthLabel}
                    {r.unpriced > 0 && <span className="report-unpriced-mark" title={`${r.unpriced.toLocaleString('fa-IR')} مورد بدون نرخ دلار`}>*</span>}
                  </th>
                  <td>{f.compact(r.income)}</td>
                  {hasExpenses && <td>{f.compact(r.expense)}</td>}
                  {hasExpenses && <td className={r.net < 0 ? 'text-loss' : ''}>{f.compact(r.net)}</td>}
                  {hasExpenses && <td>{f.pct(r.savingsRate)}</td>}
                  {hasExpenses && <td>{f.compact(r.invested)}</td>}
                  {hasExpenses && <td>{f.pct(r.investShare)}</td>}
                  <td>{f.usd(r.incomeUsd)}</td>
                  {hasExpenses && <td>{f.usd(r.expenseUsd)}</td>}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">جمع سال</th>
                <td>{f.compact(cash.income)}</td>
                {hasExpenses && <td>{f.compact(cash.expense)}</td>}
                {hasExpenses && <td className={cash.net < 0 ? 'text-loss' : ''}>{f.compact(cash.net)}</td>}
                {hasExpenses && <td>{f.pct(cash.savingsRate)}</td>}
                {hasExpenses && <td>{f.compact(shareYear.invested)}</td>}
                {hasExpenses && <td>{f.pct(shareYear.share)}</td>}
                <td>{f.usd(dollars.income)}</td>
                {hasExpenses && <td>{f.usd(dollars.expense)}</td>}
              </tr>
            </tfoot>
          </table>
        </div>
      </ReportCard>

      {/* Invested by asset, and how the figures are worked */}
      {hasExpenses && (
        <ReportCard title="سرمایه‌گذاری‌های سال" Icon={TrendingUp} span="span-6" className="report-table-card">
          {investedIn.length ? (
            <table className="flow-month-grid report-month-grid">
              <caption className="sr-only">هزینه‌های سرمایه‌گذاری سال، به تفکیک آنچه در آن سرمایه‌گذاری شد</caption>
              <thead>
                <tr><th scope="col">در</th><th scope="col">تعداد</th><th scope="col">مبلغ</th><th scope="col">سهم</th></tr>
              </thead>
              <tbody>
                {investedIn.map((a) => (
                  <tr key={a.key}>
                    <th scope="row">{investedName(a)}</th>
                    <td>{a.count.toLocaleString('fa-IR')}</td>
                    <td>{f.compact(a.total)}</td>
                    <td>{f.pct(shareYear.invested > 0 ? (a.total / shareYear.invested) * 100 : null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="report-empty">هزینه‌ای با دسته‌ی «سرمایه‌گذاری» در این سال ثبت نشده است.</p>
          )}
        </ReportCard>
      )}
      {hasExpenses && subscriptionYear && (
        <ReportCard title="اشتراک‌های سال" Icon={CalendarSync} span="span-6" className="report-table-card">
          {subscriptionYear.count > 0 ? (
            <table className="flow-month-grid report-month-grid">
              <caption className="sr-only">پرداخت‌های سال برای هر اشتراک</caption>
              <thead>
                <tr><th scope="col">اشتراک</th><th scope="col">پرداخت</th><th scope="col">مبلغ</th><th scope="col">سهم</th></tr>
              </thead>
              <tbody>
                {subscriptionYear.rows.map((r) => (
                  <tr key={r.id}>
                    <th scope="row">{r.name}</th>
                    <td>{r.count.toLocaleString('fa-IR')}</td>
                    <td>{f.compact(r.total)}</td>
                    <td>{f.pct(subscriptionYear.total > 0 ? (r.total / subscriptionYear.total) * 100 : null)}</td>
                  </tr>
                ))}
                {subscriptionYear.unlinked.count > 0 && (
                  <tr>
                    <th scope="row">بدون اشتراک مشخص</th>
                    <td>{subscriptionYear.unlinked.count.toLocaleString('fa-IR')}</td>
                    <td>{f.compact(subscriptionYear.unlinked.total)}</td>
                    <td>{f.pct(subscriptionYear.total > 0 ? (subscriptionYear.unlinked.total / subscriptionYear.total) * 100 : null)}</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">جمع</th>
                  <td>{subscriptionYear.count.toLocaleString('fa-IR')}</td>
                  <td>{f.compact(subscriptionYear.total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          ) : (
            <p className="report-empty">پرداختی برای اشتراک‌ها در این سال ثبت نشده است.</p>
          )}
        </ReportCard>
      )}
      <ReportCard title="خارج از جمع (جدا)" Icon={EyeOff} span="span-6" className="report-table-card">
        {apartRows.length ? (
          <table className="flow-month-grid report-month-grid">
            <caption className="sr-only">آنچه در جمع درآمد و هزینه حساب نمی‌شود: دسته‌های خارج از جمع و هزینه‌های پروژه‌ها</caption>
            <thead>
              <tr><th scope="col">مورد</th><th scope="col">نوع</th><th scope="col">تعداد</th><th scope="col">مبلغ</th></tr>
            </thead>
            <tbody>
              {apartRows.map((r) => (
                <tr key={r.key}>
                  <th scope="row">{r.label}</th>
                  <td>{r.kind}</td>
                  <td>{r.count.toLocaleString('fa-IR')}</td>
                  <td>{f.compact(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="report-empty">در این سال چیزی خارج از جمع ثبت نشده است.</p>
        )}
      </ReportCard>
      <ReportCard title="روش محاسبه" Icon={BookOpen} span="span-6" className="report-method">
        <ul>
          <li>همه‌ی خرج‌ها در هزینه‌ها ثبت می‌شوند؛ دسته‌های «خارج از جمع» (مثل مدیریت نقدینگی) و هزینه‌های پروژه‌ها در جمع‌ها حساب نمی‌شوند و در «خارج از جمع (جدا)» آمده‌اند.</li>
          <li>سرمایه‌گذاری: هزینه‌های روزمره‌ای که با دسته‌ی «سرمایه‌گذاری» ثبت شده‌اند (سهم خود شما، هزینه‌ی دلاری به نرخ روزش)؛ این هزینه‌ها در جمع هزینه‌ها حساب نمی‌شوند. به تفکیک دارایی‌ای که به پورتفو اضافه شده، وگرنه به عنوان هزینه.</li>
          <li>اشتراک‌ها: هزینه‌هایی که به یک اشتراک وصل شده‌اند («ثبت پرداخت» در اشتراک‌ها، یا انتخاب اشتراک در فرم هزینه)؛ پرداخت‌های دسته‌ی «اینترنت و اشتراک‌ها» که به اشتراکی وصل نیستند جدا آمده‌اند.</li>
          <li>دلار: هر مورد به نرخ دلار روز خودش (نرخ ثبت‌شده، وگرنه تاریخچه‌ی قیمت)؛ مورد بی‌نرخ به نرخ امروز حساب نمی‌شود{dollars.unpriced > 0 ? ` (${dollars.unpriced.toLocaleString('fa-IR')} مورد در این سال، با * کنار نام ماه در جدول)` : ''}.</li>
        </ul>
      </ReportCard>
    </div>
  );
}
