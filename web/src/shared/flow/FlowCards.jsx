/**
 * FlowCards.jsx — The headline cards of the incomes and expenses pages, the same on both
 *
 * - FlowMonthCards: the month's total, the change from the same days of the month before (all
 *   of it for a past month), the daily average and the largest category
 * - FlowYearCards: the year's total, the monthly average, the month with the most and the
 *   largest category
 * - CategoryPills: the list's category filter, with counts
 * - ExcludedBox: the categories left out of the totals, with their sums
 * - FlowDollarCard: the list in dollars, each record at its own day's rate, and what those dollars
 *   are worth today (in the month and year cards, and a project's)
 */

import { intlLocale, plural, t } from '../../utils/i18n.js';
import React from 'react';
import { Coins, Wallet, TrendingUp, TrendingDown, CalendarDays, CalendarRange, Tag, Trophy, Sigma, DollarSign } from 'lucide-react';
import { MiniCard } from '../ui/index.js';
import { DollarValueFoot, formatUsd } from '../ui/DollarValue.jsx';
import { formatAmountMasked } from './flowFormat.js';

const KIND = {
  income: { color: 'green', Icon: Wallet, noun: t('درآمد'), nouns: plural(2, t('درآمد'), t('درآمدها')) },
  expense: { color: 'rose', Icon: Coins, noun: t('هزینه'), nouns: plural(2, t('هزینه'), t('هزینه‌ها')) },
};

/**
 * @param {{ kind: 'income'|'expense', view: ReturnType<import('../../utils/dollarValue.js').summarizeDollarValues>|null,
 *   hideValues?: boolean, wide?: boolean }} props - nothing while no record has its day's rate;
 *   `wide`: a row of its own in the phone's two-per-row grid (false: it pairs with the card before)
 */
export function FlowDollarCard({ kind, view, hideValues = false, wide = true }) {
  if (!view || view.counted === 0) return null;
  return (
    <MiniCard
      icon={<DollarSign size={14} />}
      title={t('به دلار (نرخ روز هر مورد)')}
      value={hideValues ? '****' : formatUsd(view.usd)}
      unit={t('دلار')}
      color="blue"
      className={`incomes-summary-card is-dollar${wide ? ' is-wide' : ''}`}
      footer={<DollarValueFoot view={view} noun={KIND[kind].noun} hideValues={hideValues} />}
    />
  );
}

const pct = (v) => t('{sign}{count}٪', { sign: v > 0 ? '+' : '', count: v.toLocaleString(intlLocale(), { maximumFractionDigits: 0 }) });

/**
 * @param {{ kind: 'income'|'expense', monthLabel: string, total: number, count: number,
 *   previousTotal: number, previousCount: number, current: boolean, days: number,
 *   top: { label: string, total: number }|null, hideValues?: boolean, totalFooter?: React.ReactNode,
 *   dollar?: object|null }} props - dollar: the month in dollars (FlowDollarCard)
 */
export function FlowMonthCards({ kind, monthLabel, total, count, previousTotal, previousCount, current, days, top, hideValues = false, totalFooter = null, dollar = null }) {
  const k = KIND[kind];
  const money = (v) => formatAmountMasked(v, hideValues);
  const change = previousTotal > 0 ? ((total - previousTotal) / previousTotal) * 100 : null;
  // More income is good news, more spending isn't
  const good = change !== null && (change >= 0) === (kind === 'income');
  return (
    <div className="incomes-summary-grid">
      <MiniCard
        icon={<k.Icon size={14} />}
        title={t('جمع {monthLabel}', { monthLabel })}
        value={money(total)}
        unit={t('تومان')}
        color={k.color}
        className="incomes-summary-card is-primary"
        footer={totalFooter}
      />
      <MiniCard
        icon={change !== null && change < 0 ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
        title={current ? t('نسبت به همین روزهای ماه قبل') : t('نسبت به ماه قبل')}
        value={change === null ? '—' : pct(change)}
        color={change === null ? 'text' : good ? 'green' : 'rose'}
        className="incomes-summary-card"
        footer={previousCount > 0 && <span>{t('ماه قبل: {amount} تومان', { amount: money(previousTotal) })}</span>}
      />
      <MiniCard
        icon={<CalendarDays size={14} />}
        title={t('میانگین روزانه')}
        value={money(total / Math.max(1, days))}
        unit={t('تومان')}
        className="incomes-summary-card"
        footer={<span>{t('{count} {noun} در {days} روز', { count: count.toLocaleString(intlLocale()), noun: plural(count, k.noun, k.nouns), days: days.toLocaleString(intlLocale()) })}</span>}
      />
      <MiniCard
        icon={<Tag size={14} />}
        title={t('بیشترین دسته')}
        value={top ? top.label : '—'}
        className="incomes-summary-card"
        footer={top && <span>{t('{amount} تومان', { amount: money(top.total) })}</span>}
      />
      {/* Next to «بیشترین دسته» on a phone (two per row) */}
      <FlowDollarCard kind={kind} view={dollar} hideValues={hideValues} wide={false} />
    </div>
  );
}

/**
 * @param {{ kind: 'income'|'expense', yearLabel: string, summary: ReturnType<import('./flowYear.js').summarizeYear>,
 *   topCategory: { label: string, total: number }|null, hideValues?: boolean, dollar?: object|null }} props
 */
export function FlowYearCards({ kind, yearLabel, summary, topCategory, hideValues = false, dollar = null }) {
  const k = KIND[kind];
  const money = (v) => formatAmountMasked(v, hideValues);
  return (
    <div className="incomes-summary-grid">
      <MiniCard
        icon={<k.Icon size={14} />}
        title={t('جمع سال {yearLabel}', { yearLabel })}
        value={money(summary.total)}
        unit={t('تومان')}
        color={k.color}
        className="incomes-summary-card is-primary"
        footer={<span>{t('{count} {noun} در {months} ماه', { count: summary.count.toLocaleString(intlLocale()), noun: plural(summary.count, k.noun, k.nouns), months: summary.months.toLocaleString(intlLocale()) })}</span>}
      />
      <MiniCard
        icon={<CalendarRange size={14} />}
        title={t('میانگین ماهانه')}
        value={money(summary.monthlyAverage)}
        unit={t('تومان')}
        color="blue"
        className="incomes-summary-card"
      />
      <MiniCard
        icon={<Trophy size={14} />}
        title={kind === 'income' ? t('پردرآمدترین ماه') : t('پرخرج‌ترین ماه')}
        value={summary.top ? summary.top.monthLabel : '—'}
        color="gold"
        className="incomes-summary-card"
        footer={summary.top && <span>{t('{amount} تومان', { amount: money(summary.top.total) })}</span>}
      />
      <MiniCard
        icon={<Tag size={14} />}
        title={t('بیشترین دسته')}
        value={topCategory ? topCategory.label : '—'}
        className="incomes-summary-card"
        footer={topCategory && <span>{t('{amount} تومان', { amount: money(topCategory.total) })}</span>}
      />
      {/* Next to «بیشترین دسته» on a phone (two per row) */}
      <FlowDollarCard kind={kind} view={dollar} hideValues={hideValues} wide={false} />
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
    <div className="tx-filter-pills-bar expense-category-filter" role="group" aria-label={t('دسته‌بندی')}>
      {[{ category: 'all', count: total }, ...items].map(({ category, count }) => (
        <button
          key={category}
          type="button"
          className={`tx-filter-pill ${value === category ? 'active' : ''}`}
          aria-pressed={value === category}
          onClick={() => onChange(category)}
        >
          {category === 'all' ? t('همه') : labelOf(category)}
          <span className="cheque-filter-count">{count.toLocaleString(intlLocale())}</span>
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
      <div className="expense-side-card-head"><h4><Sigma size={14} />{' '}{t('خارج از جمع')}</h4></div>
      <ul className="expense-account-breakdown">
        {items.map((c) => {
          const meta = metaOf(c.category);
          return (
            <li key={c.category}>
              <span><meta.Icon size={12} /> {meta.label}</span>
              <strong>{formatAmountMasked(c.total, hideValues)} <small>{t('تومان')}</small></strong>
            </li>
          );
        })}
      </ul>
      <p className="expense-side-card-empty">{t('این دسته‌ها {kind} حساب نمی‌شوند (از «دسته‌ها» قابل تغییر است).', { kind: KIND[kind].nouns })}</p>
    </div>
  );
}
