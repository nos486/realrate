/**
 * FlowCards.jsx — The headline cards of the incomes and expenses pages, the same on both
 *
 * - FlowMonthCards: the month's total, the change from the same days of the month before (all
 *   of it for a past month), the daily average and the largest category
 * - FlowYearCards: the year's total, the monthly average, the month with the most and the
 *   largest category
 * - CategoryPills: the list's category filter, with counts
 * - ExcludedBox: the categories left out of the totals, with their sums
 */

import React from 'react';
import { Coins, Wallet, TrendingUp, TrendingDown, CalendarDays, CalendarRange, Tag, Trophy, Sigma } from 'lucide-react';
import { MiniCard } from '../ui/index.js';
import { formatAmountMasked } from './flowFormat.js';

const KIND = {
  income: { color: 'green', Icon: Wallet, noun: 'درآمد', nouns: 'درآمد' },
  expense: { color: 'rose', Icon: Coins, noun: 'هزینه', nouns: 'هزینه' },
};

const pct = (v) => `${v > 0 ? '+' : ''}${v.toLocaleString('fa-IR', { maximumFractionDigits: 0 })}٪`;

/**
 * @param {{ kind: 'income'|'expense', monthLabel: string, total: number, count: number,
 *   previousTotal: number, previousCount: number, current: boolean, days: number,
 *   top: { label: string, total: number }|null, hideValues?: boolean, totalFooter?: React.ReactNode }} props
 */
export function FlowMonthCards({ kind, monthLabel, total, count, previousTotal, previousCount, current, days, top, hideValues = false, totalFooter = null }) {
  const k = KIND[kind];
  const money = (v) => formatAmountMasked(v, hideValues);
  const change = previousTotal > 0 ? ((total - previousTotal) / previousTotal) * 100 : null;
  // More income is good news, more spending isn't
  const good = change !== null && (change >= 0) === (kind === 'income');
  return (
    <div className="incomes-summary-grid">
      <MiniCard
        icon={<k.Icon size={14} />}
        title={`جمع ${monthLabel}`}
        value={money(total)}
        unit="تومان"
        color={k.color}
        className="incomes-summary-card is-primary"
        footer={totalFooter}
      />
      <MiniCard
        icon={change !== null && change < 0 ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
        title={current ? 'نسبت به همین روزهای ماه قبل' : 'نسبت به ماه قبل'}
        value={change === null ? '—' : pct(change)}
        color={change === null ? 'text' : good ? 'green' : 'rose'}
        className="incomes-summary-card"
        footer={previousCount > 0 && <span>ماه قبل: {money(previousTotal)} تومان</span>}
      />
      <MiniCard
        icon={<CalendarDays size={14} />}
        title="میانگین روزانه"
        value={money(total / Math.max(1, days))}
        unit="تومان"
        className="incomes-summary-card"
        footer={<span>{count.toLocaleString('fa-IR')} {k.noun} در {days.toLocaleString('fa-IR')} روز</span>}
      />
      <MiniCard
        icon={<Tag size={14} />}
        title="بیشترین دسته"
        value={top ? top.label : '—'}
        className="incomes-summary-card"
        footer={top && <span>{money(top.total)} تومان</span>}
      />
    </div>
  );
}

/**
 * @param {{ kind: 'income'|'expense', yearLabel: string, summary: ReturnType<import('./flowYear.js').summarizeYear>,
 *   topCategory: { label: string, total: number }|null, hideValues?: boolean }} props
 */
export function FlowYearCards({ kind, yearLabel, summary, topCategory, hideValues = false }) {
  const k = KIND[kind];
  const money = (v) => formatAmountMasked(v, hideValues);
  return (
    <div className="incomes-summary-grid">
      <MiniCard
        icon={<k.Icon size={14} />}
        title={`جمع سال ${yearLabel}`}
        value={money(summary.total)}
        unit="تومان"
        color={k.color}
        className="incomes-summary-card is-primary"
        footer={<span>{summary.count.toLocaleString('fa-IR')} {k.noun} در {summary.months.toLocaleString('fa-IR')} ماه</span>}
      />
      <MiniCard
        icon={<CalendarRange size={14} />}
        title="میانگین ماهانه"
        value={money(summary.monthlyAverage)}
        unit="تومان"
        color="blue"
        className="incomes-summary-card"
      />
      <MiniCard
        icon={<Trophy size={14} />}
        title={kind === 'income' ? 'پردرآمدترین ماه' : 'پرخرج‌ترین ماه'}
        value={summary.top ? summary.top.monthLabel : '—'}
        color="gold"
        className="incomes-summary-card"
        footer={summary.top && <span>{money(summary.top.total)} تومان</span>}
      />
      <MiniCard
        icon={<Tag size={14} />}
        title="بیشترین دسته"
        value={topCategory ? topCategory.label : '—'}
        className="incomes-summary-card"
        footer={topCategory && <span>{money(topCategory.total)} تومان</span>}
      />
    </div>
  );
}

/**
 * @param {{ items: Array<{ category: string, count: number }>, total: number, value: string,
 *   onChange: (category: string) => void, labelOf: (category: string) => string }} props
 */
export function CategoryPills({ items, total, value, onChange, labelOf }) {
  if (items.length < 2) return null;
  return (
    <div className="tx-filter-pills-bar expense-category-filter" role="group" aria-label="دسته‌بندی">
      {[{ category: 'all', count: total }, ...items].map(({ category, count }) => (
        <button
          key={category}
          type="button"
          className={`tx-filter-pill ${value === category ? 'active' : ''}`}
          aria-pressed={value === category}
          onClick={() => onChange(category)}
        >
          {category === 'all' ? 'همه' : labelOf(category)}
          <span className="cheque-filter-count">{count.toLocaleString('fa-IR')}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * @param {{ kind: 'income'|'expense', items: Array<{ category: string, total: number }>,
 *   metaOf: (category: string) => { label: string, Icon: any }, hideValues?: boolean }} props
 */
export function ExcludedBox({ kind, items, metaOf, hideValues = false }) {
  if (!items.length) return null;
  return (
    <div className="expense-side-card">
      <div className="expense-side-card-head"><h4><Sigma size={14} /> خارج از جمع</h4></div>
      <ul className="expense-account-breakdown">
        {items.map((c) => {
          const meta = metaOf(c.category);
          return (
            <li key={c.category}>
              <span><meta.Icon size={12} /> {meta.label}</span>
              <strong>{formatAmountMasked(c.total, hideValues)} <small>تومان</small></strong>
            </li>
          );
        })}
      </ul>
      <p className="expense-side-card-empty">این دسته‌ها {KIND[kind].nouns} حساب نمی‌شوند (از «دسته‌ها» قابل تغییر است).</p>
    </div>
  );
}
