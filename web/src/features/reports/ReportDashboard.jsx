/**
 * ReportDashboard.jsx — The whole year on one page, in a grid of cards (12 columns on a wide
 * screen, 2 on a medium one, 1 on a phone), laid out to read — and later print — as one report:
 *
 *   ┌──────────────────────────── the year's figures ────────────────────────────┐
 *   │ income against expenses (7)              │ what stands out (5)             │
 *   │ net worth: its figures (12), month by month (7) │ against the dollar (5)   │
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
 * The net worth comes from useNetWorth (NetWorthSection), loaded on its own.
 */

import { intlLocale, t } from '../../utils/i18n.js';
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
import ReportCard from './ReportCard.jsx';
import NetWorthSection from './NetWorthSection.jsx';

const INCOME_COLOR = CHART_COLORS[0];
const EXPENSE_COLOR = CHART_COLORS[1];
const TONE_ICON = { good: ThumbsUp, bad: AlertTriangle, info: Info };
const incomeLabel = (c) => getIncomeCategory(c).label;
const expenseLabel = (c) => getExpenseCategory(c).label;
/** What an investment went into: its asset's name, else the expense's own title */
const investedName = (a) => (a.assetId ? resolveAssetDisplayName(a.assetId) || a.assetId : a.title || t('بدون عنوان'));

/**
 * A translated sentence with its emphasis kept: `<b>…</b>` becomes <strong>, `<bdi>…</bdi>` stays
 * an isolated run (the translator can move them, so the sentence order is free in English)
 */
function rich(translated, params) {
  const parts = [];
  let last = 0;
  const text = translated.replace(/\{(\w+)\}/g, (whole, name) => (params[name] === undefined ? whole : String(params[name])));
  for (const m of text.matchAll(/<(b|bdi)>(.*?)<\/\1>/g)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(m[1] === 'b' ? <strong key={m.index}>{m[2]}</strong> : <bdi key={m.index}>{m[2]}</bdi>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

/** One insight in a sentence */
function insightText(item, f) {
  switch (item.id) {
    case 'best-month':
      return item.rate !== null
        ? rich(t('بیشترین پس‌انداز در <b>{month}</b>: <b>{amount}</b> تومان ({pct} درآمد).'), { month: item.month, amount: f.compact(item.net), pct: f.pct(item.rate) })
        : rich(t('بیشترین پس‌انداز در <b>{month}</b>: <b>{amount}</b> تومان.'), { month: item.month, amount: f.compact(item.net) });
    case 'negative-months':
      return rich(t('در <b>{count}</b> ماه از {months} ماه، هزینه از درآمد بیشتر بود.'), { count: item.count.toLocaleString(intlLocale()), months: item.months.toLocaleString(intlLocale()) });
    case 'worst-month':
      return rich(t('بیشترین کسری در <b>{month}</b>: <b>{amount}</b> تومان بیش از درآمد.'), { month: item.month, amount: f.compact(-item.net) });
    case 'top-category':
      return rich(t('بزرگ‌ترین دسته‌ی هزینه <b>{category}</b>: {pct} کل هزینه‌ها ({amount} تومان).'), { category: expenseLabel(item.category), pct: f.pct(item.share), amount: f.compact(item.total) });
    case 'costly-month':
      return rich(t('هزینه‌ی <b>{month}</b> {pct} بیشتر از میانگین ماهانه بود.'), { month: item.month, pct: f.pct(item.over) });
    case 'invested-share':
      return rich(t('<b>{pct}</b> درآمد سال ({amount} تومان) سرمایه‌گذاری شد.'), { pct: f.pct(item.share), amount: f.compact(item.invested) });
    case 'subscriptions-share':
      return rich(t('اشتراک‌ها <b>{pct}</b> هزینه‌های سال بودند ({amount} تومان).'), { pct: f.pct(item.share), amount: f.compact(item.total) });
    default:
      return null;
  }
}

const donutOf = (byCategory, metaOf) => byCategory.map((c) => {
  const meta = metaOf(c.category);
  return { key: c.category, label: meta.label, value: c.total, icon: <meta.Icon size={12} /> };
});

const CSV_HEADERS = [t('ماه'), t('درآمد (تومان)'), t('هزینه (تومان)'), t('مانده (تومان)'), t('نرخ پس‌انداز (٪)'), t('سرمایه‌گذاری (تومان)'), t('سهم سرمایه‌گذاری از درآمد (٪)'), t('درآمد (دلار)'), t('هزینه (دلار)')];
const round1 = (v) => (v === null || v === undefined ? '' : Math.round(v * 10) / 10);

export default function ReportDashboard({ data, netWorth = null, f, yearLabel, hideValues }) {
  const { hasExpenses, incomeSeries, expenseSeries, incomeYear, expenseYear, cash, cashMonths, shareMonths, shareYear, investedIn, subscriptionYear, apart, dollars, insights } = data;
  const apartRows = apart ? [
    ...apart.expenses.map((r) => ({ key: `e:${r.key}`, kind: t('هزینه'), label: expenseLabel(r.key), ...r })),
    ...apart.projects.map((r) => ({ key: `p:${r.key}`, kind: t('پروژه'), label: r.name, ...r })),
    ...apart.incomes.map((r) => ({ key: `i:${r.key}`, kind: t('درآمد'), label: incomeLabel(r.key), ...r })),
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
        <MiniCard icon={<Wallet size={14} />} title={t('درآمد {year}', { year: yearLabel })} value={f.money(incomeYear.total)} unit={t('تومان')} color="green" className="incomes-summary-card is-primary" footer={<span>{t('میانگین ماهانه {value}', { value: f.compact(incomeYear.monthlyAverage) })}</span>} />
        {hasExpenses && (
          <MiniCard icon={<Coins size={14} />} title={t('هزینه‌ی سال')} value={f.money(expenseYear.total)} unit={t('تومان')} color="rose" className="incomes-summary-card" footer={<span>{t('میانگین ماهانه {value}', { value: f.compact(expenseYear.monthlyAverage) })}</span>} />
        )}
        {hasExpenses && (
          <MiniCard icon={<PiggyBank size={14} />} title={t('مانده (درآمد − هزینه)')} value={f.money(cash.net)} unit={t('تومان')} color={cash.net >= 0 ? 'green' : 'rose'} className="incomes-summary-card" footer={<span>{t('میانگین ماهانه {value}', { value: f.compact(cash.monthlyNet) })}</span>} />
        )}
        {hasExpenses && (
          <MiniCard icon={<Percent size={14} />} title={t('نرخ پس‌انداز')} value={f.pct(cash.savingsRate)} color="gold" className="incomes-summary-card" footer={<span>{cash.negativeMonths ? t('{n} ماه با کسری', { n: cash.negativeMonths.toLocaleString(intlLocale()) }) : t('بدون ماه کسری')}</span>} />
        )}
        {hasExpenses && (
          <MiniCard icon={<TrendingUp size={14} />} title={t('سرمایه‌گذاری')} value={f.money(shareYear.invested)} unit={t('تومان')} color="blue" className="incomes-summary-card" footer={<span>{t('{pct} درآمد', { pct: f.pct(shareYear.share) })}</span>} />
        )}
        {hasExpenses && (
          <MiniCard icon={<DollarSign size={14} />} title={t('مانده به دلار')} value={f.usd(dollars.net)} color={dollars.net >= 0 ? 'green' : 'rose'} className="incomes-summary-card" footer={<span>{t('درآمد {income} · هزینه {expense}', { income: f.usd(dollars.income), expense: f.usd(dollars.expense) })}</span>} />
        )}
      </div>

      {/* Income against expenses, and what stands out */}
      {hasExpenses && (
        <div className="span-7">
          <MonthBarChart
            compact
            title={t('درآمد و هزینه — {year}', { year: yearLabel })}
            months={cashMonths}
            series={[
              { key: 'income', label: t('درآمد'), color: INCOME_COLOR, value: (m) => m.income },
              { key: 'expense', label: t('هزینه'), color: EXPENSE_COLOR, value: (m) => m.expense },
            ]}
            format={f.compact}
            ariaValue={(m) => t('درآمد {income}، هزینه {expense}', { income: f.compact(m.income), expense: f.compact(m.expense) })}
            readout={(m) => (
              <>
                <div>
                  <strong className={m.net < 0 ? 'text-loss' : ''}>{f.compact(m.net)}</strong>
                  <span>{rich(t('<bdi>{month}</bdi>، مانده'), { month: m.label })}</span>
                </div>
                <span className="report-readout-detail">{t('نرخ پس‌انداز {pct}', { pct: f.pct(m.savingsRate) })}</span>
              </>
            )}
          />
        </div>
      )}
      <ReportCard title={t('نکته‌های سال')} Icon={Lightbulb} span={hasExpenses ? 'span-5' : 'span-12'} className="report-insights">
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
          <p className="report-empty">{t('با ثبت درآمد و هزینه‌های سال، نکته‌های مهم آن این‌جا می‌آید.')}</p>
        )}
      </ReportCard>

      {/* What is owned minus what is owed, and how it moved against the dollar */}
      {netWorth && <NetWorthSection netWorth={netWorth} f={f} yearLabel={yearLabel} />}

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
        <DonutChart title={t('منابع درآمد')} items={donutOf(incomeYear.byCategory, getIncomeCategory)} centerLabel={t('درآمد {year}', { year: yearLabel })} masked={hideValues} emptyMessage={t('درآمدی در این سال ثبت نشده است.')} />
      </div>
      {hasExpenses && (
        <div className="span-4">
          <DonutChart title={t('دسته‌های هزینه')} items={donutOf(expenseYear.byCategory, getExpenseCategory)} centerLabel={t('هزینه {year}', { year: yearLabel })} masked={hideValues} emptyMessage={t('هزینه‌ای در این سال ثبت نشده است.')} />
        </div>
      )}
      {hasExpenses && (
        <div className="span-4">
          <DonutChart title={t('سرمایه‌گذاری در')} items={investDonut} centerLabel={t('سرمایه‌گذاری {year}', { year: yearLabel })} masked={hideValues} emptyMessage={t('هزینه‌ای با دسته‌ی «سرمایه‌گذاری» ثبت نشده است.')} />
        </div>
      )}

      {/* The share of income invested, and the year in dollars */}
      {hasExpenses && (
      <div className="span-6">
        <MonthBarChart
          compact
          title={t('سهم سرمایه‌گذاری از درآمد')}
          months={shareMonths}
          series={[{ key: 'share', label: t('سهم از درآمد'), color: CHART_COLORS[2], value: (m) => m.share ?? 0 }]}
          negativeColor={EXPENSE_COLOR}
          format={f.pct}
          average={shareYear.share}
          averageLabel={t('کل سال')}
          ariaValue={(m) => (m.share === null ? t('بدون درآمد') : t('{pct} از درآمد', { pct: f.pct(m.share) }))}
          readout={(m) => (
            <>
              <div>
                <strong>{f.pct(m.share)}</strong>
                <span><bdi>{m.label}</bdi></span>
              </div>
              <span className="report-readout-detail">{t('سرمایه‌گذاری {invested} از درآمد {income}', { invested: f.compact(m.invested), income: f.compact(m.income) })}</span>
            </>
          )}
        />
      </div>
      )}
      {hasExpenses && (
        <div className="span-6">
          <MonthBarChart
            compact
            title={t('درآمد و هزینه به دلار')}
            months={dollars.months}
            series={[
              { key: 'income', label: t('درآمد'), color: INCOME_COLOR, value: (m) => m.income },
              { key: 'expense', label: t('هزینه'), color: EXPENSE_COLOR, value: (m) => m.expense },
            ]}
            format={f.usd}
            ariaValue={(m) => t('درآمد {income}، هزینه {expense}', { income: f.usd(m.income), expense: f.usd(m.expense) })}
            readout={(m) => (
              <>
                <div>
                  <strong className={m.net < 0 ? 'text-loss' : ''}>{f.usd(m.net)}</strong>
                  <span>{rich(t('<bdi>{month}</bdi>، مانده'), { month: m.label })}</span>
                </div>
                {m.unpriced > 0 && <span className="report-readout-detail">{t('{n} مورد بدون نرخ دلار', { n: m.unpriced.toLocaleString(intlLocale()) })}</span>}
              </>
            )}
          />
        </div>
      )}

      {/* Every month in one table */}
      <ReportCard
        title={t('ماه‌به‌ماه')}
        span="span-12"
        className="report-table-card"
        actions={(
          <GenericCsvExportButton
            items={rows}
            headers={CSV_HEADERS}
            fileBaseName={t('گزارش-{year}', { year: yearLabel })}
            disabled={!rows.length}
            mapRow={(r) => [r.label, Math.round(r.income), Math.round(r.expense), Math.round(r.net), round1(r.savingsRate), Math.round(r.invested), round1(r.investShare), Math.round(r.incomeUsd), Math.round(r.expenseUsd)]}
          />
        )}
      >
        <div className="report-table-scroll">
          <table className="flow-month-grid report-month-grid">
            <caption className="sr-only">{t('درآمد، هزینه، مانده، سرمایه‌گذاری و ارزش دلاری ماه‌به‌ماه')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('ماه')}</th>
                <th scope="col">{t('درآمد')}</th>
                {hasExpenses && <th scope="col">{t('هزینه')}</th>}
                {hasExpenses && <th scope="col">{t('مانده')}</th>}
                {hasExpenses && <th scope="col">{t('نرخ پس‌انداز')}</th>}
                {hasExpenses && <th scope="col">{t('سرمایه‌گذاری')}</th>}
                {hasExpenses && <th scope="col">{t('سهم از درآمد')}</th>}
                <th scope="col">{t('درآمد $')}</th>
                {hasExpenses && <th scope="col">{t('هزینه $')}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row">
                    {r.monthLabel}
                    {r.unpriced > 0 && <span className="report-unpriced-mark" title={t('{n} مورد بدون نرخ دلار', { n: r.unpriced.toLocaleString(intlLocale()) })}>*</span>}
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
                <th scope="row">{t('جمع سال')}</th>
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
        <ReportCard title={t('سرمایه‌گذاری‌های سال')} Icon={TrendingUp} span="span-6" className="report-table-card">
          {investedIn.length ? (
            <table className="flow-month-grid report-month-grid">
              <caption className="sr-only">{t('هزینه‌های سرمایه‌گذاری سال، به تفکیک آنچه در آن سرمایه‌گذاری شد')}</caption>
              <thead>
                <tr><th scope="col">{t('در')}</th><th scope="col">{t('تعداد')}</th><th scope="col">{t('مبلغ')}</th><th scope="col">{t('سهم')}</th></tr>
              </thead>
              <tbody>
                {investedIn.map((a) => (
                  <tr key={a.key}>
                    <th scope="row">{investedName(a)}</th>
                    <td>{a.count.toLocaleString(intlLocale())}</td>
                    <td>{f.compact(a.total)}</td>
                    <td>{f.pct(shareYear.invested > 0 ? (a.total / shareYear.invested) * 100 : null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="report-empty">{t('هزینه‌ای با دسته‌ی «سرمایه‌گذاری» در این سال ثبت نشده است.')}</p>
          )}
        </ReportCard>
      )}
      {hasExpenses && subscriptionYear && (
        <ReportCard title={t('اشتراک‌های سال')} Icon={CalendarSync} span="span-6" className="report-table-card">
          {subscriptionYear.count > 0 ? (
            <table className="flow-month-grid report-month-grid">
              <caption className="sr-only">{t('پرداخت‌های سال برای هر اشتراک')}</caption>
              <thead>
                <tr><th scope="col">{t('اشتراک')}</th><th scope="col">{t('پرداخت')}</th><th scope="col">{t('مبلغ')}</th><th scope="col">{t('سهم')}</th></tr>
              </thead>
              <tbody>
                {subscriptionYear.rows.map((r) => (
                  <tr key={r.id}>
                    <th scope="row">{r.name}</th>
                    <td>{r.count.toLocaleString(intlLocale())}</td>
                    <td>{f.compact(r.total)}</td>
                    <td>{f.pct(subscriptionYear.total > 0 ? (r.total / subscriptionYear.total) * 100 : null)}</td>
                  </tr>
                ))}
                {subscriptionYear.unlinked.count > 0 && (
                  <tr>
                    <th scope="row">{t('بدون اشتراک مشخص')}</th>
                    <td>{subscriptionYear.unlinked.count.toLocaleString(intlLocale())}</td>
                    <td>{f.compact(subscriptionYear.unlinked.total)}</td>
                    <td>{f.pct(subscriptionYear.total > 0 ? (subscriptionYear.unlinked.total / subscriptionYear.total) * 100 : null)}</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">{t('جمع')}</th>
                  <td>{subscriptionYear.count.toLocaleString(intlLocale())}</td>
                  <td>{f.compact(subscriptionYear.total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          ) : (
            <p className="report-empty">{t('پرداختی برای اشتراک‌ها در این سال ثبت نشده است.')}</p>
          )}
        </ReportCard>
      )}
      <ReportCard title={t('خارج از جمع (جدا)')} Icon={EyeOff} span="span-6" className="report-table-card">
        {apartRows.length ? (
          <table className="flow-month-grid report-month-grid">
            <caption className="sr-only">{t('آنچه در جمع درآمد و هزینه حساب نمی‌شود: دسته‌های خارج از جمع و هزینه‌های پروژه‌ها')}</caption>
            <thead>
              <tr><th scope="col">{t('مورد')}</th><th scope="col">{t('نوع')}</th><th scope="col">{t('تعداد')}</th><th scope="col">{t('مبلغ')}</th></tr>
            </thead>
            <tbody>
              {apartRows.map((r) => (
                <tr key={r.key}>
                  <th scope="row">{r.label}</th>
                  <td>{r.kind}</td>
                  <td>{r.count.toLocaleString(intlLocale())}</td>
                  <td>{f.compact(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="report-empty">{t('در این سال چیزی خارج از جمع ثبت نشده است.')}</p>
        )}
      </ReportCard>
      <ReportCard title={t('روش محاسبه')} Icon={BookOpen} span="span-6" className="report-method">
        <ul>
          <li>{t('همه‌ی خرج‌ها در هزینه‌ها ثبت می‌شوند؛ دسته‌های «خارج از جمع» (مثل سرمایه‌گذاری) و هزینه‌های پروژه‌ها در جمع‌ها حساب نمی‌شوند و در «خارج از جمع (جدا)» آمده‌اند.')}</li>
          <li>{t('سرمایه‌گذاری: هزینه‌های روزمره‌ای که با دسته‌ی «سرمایه‌گذاری» ثبت شده‌اند (سهم خود شما، هزینه‌ی دلاری به نرخ روزش)؛ این هزینه‌ها در جمع هزینه‌ها حساب نمی‌شوند. به تفکیک دارایی‌ای که به پورتفو اضافه شده، وگرنه به عنوان هزینه.')}</li>
          <li>{t('اشتراک‌ها: هزینه‌هایی که به یک اشتراک وصل شده‌اند («ثبت پرداخت» در اشتراک‌ها، یا انتخاب اشتراک در فرم هزینه)؛ پرداخت‌های دسته‌ی «اینترنت و اشتراک‌ها» که به اشتراکی وصل نیستند جدا آمده‌اند.')}</li>
          <li>{t('ارزش خالص: ارزش همه‌ی پورتفوها (هر روز به قیمت همان روز) و چک‌های دریافتنی باز، منهای اقساط پرداخت‌نشده‌ی وام‌ها (با سودشان) و چک‌های پرداختنی باز، در پایان هر ماه. موجودی حساب‌ها ثبت نمی‌شود، پس پول نقد فقط اگر در پورتفو باشد حساب می‌شود. تغییر آن پس‌انداز تازه را هم دارد، نه فقط بازده؛ «به دلار» یعنی ارزش خالص هر روز تقسیم بر نرخ دلار همان روز.')}</li>
          <li>{t('دلار: هر مورد به نرخ دلار روز خودش (نرخ ثبت‌شده، وگرنه تاریخچه‌ی قیمت)؛ مورد بی‌نرخ به نرخ امروز حساب نمی‌شود')}{dollars.unpriced > 0 ? ` ${t('({n} مورد در این سال، با * کنار نام ماه در جدول)', { n: dollars.unpriced.toLocaleString(intlLocale()) })}` : ''}{t('.')}</li>
        </ul>
      </ReportCard>
    </div>
  );
}
