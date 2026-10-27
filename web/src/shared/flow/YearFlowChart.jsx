/**
 * YearFlowChart.jsx — The Shamsi year so far, month by month: stacked bars by category, the change
 * from the month before over each bar, the monthly average as a dashed line, and the total since
 * the start of the year. Hovering / tapping a bar shows that month (its categories in the legend);
 * with `onOpenMonth`, a second tap on it opens that month. Tapping a legend item hides / shows
 * that category: the bars, the change, the average and the total are then of the ones shown.
 *
 * The same chart for incomes and expenses (`kind`): a rise is good news for incomes (green) and
 * bad news for expenses (red). Over several years (the multi-year report) the percent over each
 * bar is left out and only the year is named on the axis (at its Farvardin).
 */

import { intlLocale, t, plural } from '../../utils/i18n.js';
import React, { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatCompactAmount } from '../utils/formatters.js';
import { CHART_COLORS, CHART_OTHER_COLOR } from '../ui/chartColors.js';
import { formatShamsiYear, visibleSeries } from './flowYear.js';
import { legendItemProps, useLegendSelection } from '../ui/legendSelection.js';

const OTHER_KEY = '__other__';
const KIND = {
  income: { noun: t('درآمد'), nouns: plural(2, t('درآمد'), t('درآمدها')), otherLabel: t('سایر منابع') },
  expense: { noun: t('هزینه'), nouns: plural(2, t('هزینه'), t('هزینه‌ها')), otherLabel: t('سایر دسته‌ها') },
};

const formatPct = (v) => t('{count}٪', { count: Math.abs(v).toLocaleString(intlLocale(), { maximumFractionDigits: Math.abs(v) < 10 ? 1 : 0 }) });

/** One stack per category: `order` first (the donut's, so colors match), then by total; extras fold into gray */
function buildStacks(series, order, labelOf, otherLabel) {
  const totals = new Map();
  for (const m of series) {
    for (const [category, value] of Object.entries(m.byCategory || {})) totals.set(category, (totals.get(category) || 0) + value);
  }
  const present = [
    ...order.filter((c) => totals.has(c)),
    ...[...totals.keys()].filter((c) => !order.includes(c)).sort((a, b) => totals.get(b) - totals.get(a)),
  ];
  const stacks = present.slice(0, CHART_COLORS.length).map((category, i) => ({
    key: category,
    categories: [category],
    label: labelOf(category),
    color: CHART_COLORS[i],
  }));
  const rest = present.slice(CHART_COLORS.length);
  if (rest.length) {
    stacks.push({ key: rest.length === 1 ? rest[0] : OTHER_KEY, categories: rest, label: rest.length === 1 ? labelOf(rest[0]) : otherLabel, color: CHART_OTHER_COLOR });
  }
  return stacks;
}

const stackValue = (month, stack) => stack.categories.reduce((acc, c) => acc + (month.byCategory?.[c] || 0), 0);

/**
 * @param {{ series: ReturnType<import('./flowYear.js').buildYearSeries>, kind: 'income'|'expense',
 *   labelOf: (category: string) => string, categoryOrder?: string[], selectedMonth?: number|null,
 *   onOpenMonth?: (jm: number) => void, hideValues?: boolean, large?: boolean,
 *   title?: string, totalLabel?: string }} props title / totalLabel: when the series is not one
 *   year («از ابتدای سال …», «جمع سال:»)
 */
export default function YearFlowChart({ series, kind, labelOf, categoryOrder = [], selectedMonth = null, onOpenMonth, hideValues = false, large = false, title = '', totalLabel = '' }) {
  const [activeIndex, setActiveIndex] = useState(null);
  const [activeStack, setActiveStack] = useState(null);
  const meta = KIND[kind];
  const stacks = useMemo(() => buildStacks(series, categoryOrder, labelOf, meta.otherLabel), [series, categoryOrder, labelOf, meta.otherLabel]);
  const stackKeys = useMemo(() => stacks.map((st) => st.key), [stacks]);
  const legend = useLegendSelection(stackKeys);
  const shownStacks = useMemo(() => stacks.filter((st) => !legend.hidden.has(st.key)), [stacks, legend.hidden]);
  const months = useMemo(() => visibleSeries(series, legend.anyHidden ? shownStacks.flatMap((st) => st.categories) : null), [series, shownStacks, legend.anyHidden]);
  const { max, average, total } = useMemo(() => {
    const sum = months.reduce((acc, m) => acc + m.total, 0);
    return { max: Math.max(0, ...months.map((m) => m.total)), total: sum, average: months.length ? sum / months.length : 0 };
  }, [months]);

  if (!months.length) return null;
  const selectedIndex = selectedMonth ? months.findIndex((m) => m.jm === selectedMonth) : -1;
  const fallback = selectedIndex >= 0 ? selectedIndex : Math.max(0, months.findLastIndex((m) => m.total > 0));
  const index = activeIndex ?? fallback;
  const month = months[index];
  const amount = (v) => (hideValues ? '****' : formatCompactAmount(v));
  const height = (v) => (max > 0 ? (v / max) * 100 : 0);
  // For expenses a rise is the bad direction
  const tone = (change) => ((change >= 0) === (kind === 'income') ? 'is-up' : 'is-down');
  const year = months[0].jy;
  // Every month when there is room, else every other / third one (counting back from the latest)
  const labelStep = large || months.length <= 4 || months.length > 24 ? 1 : months.length <= 8 ? 2 : 3;
  // Dozens of bars have no room for a percent over each
  const dense = months.length > 24;
  // As many columns as months shown (the current year so far fills the width)
  const columns = { gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` };

  return (
    <div className={`portfolio-stat-card monthly-income-chart flow-year-chart ${large ? 'is-large' : ''}`}>
      <div className="stat-header">
        <span className="stat-label">{title || t('{noun} از ابتدای سال {year}', { noun: meta.nouns, year: formatShamsiYear(year) })}</span>
        <span className="monthly-income-avg-label">
          <span className="monthly-income-avg-key" aria-hidden="true" />{t('میانگین {amount}', { amount: amount(average) })}</span>
      </div>

      <div className="monthly-income-readout" aria-live="polite">
        <div>
          <strong>{amount(month.total)}</strong>
          <span>
            <bdi>{month.label}</bdi>
            {month.count > 0 && <>{t('، ')}<bdi>{plural(month.count, t('{count} مورد', { count: month.count.toLocaleString(intlLocale()) }), t('{count} موارد', { count: month.count.toLocaleString(intlLocale()) }))}</bdi></>}
          </span>
        </div>
        {month.change !== null ? (
          <span className={`monthly-income-change ${tone(month.change)}`} title={t('نسبت به ماه قبل')}>
            {month.change >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {month.change >= 0 ? '+' : '−'}
            {formatPct(month.change)}
            <small>{t('نسبت به ماه قبل')}</small>
          </span>
        ) : (
          <span className="flow-year-total">{totalLabel || t('جمع سال:')}{' '}<strong>{amount(total)}</strong></span>
        )}
      </div>

      <div className="monthly-income-plot flow-year-plot" style={columns} onMouseLeave={() => setActiveIndex(null)}>
        {average > 0 && <div className="monthly-income-average" style={{ bottom: `${height(average)}%` }} aria-hidden="true" />}
        {months.map((m, i) => (
          <button
            key={m.key}
            type="button"
            className={`monthly-income-col ${i === index ? 'is-active' : ''} ${m.jm === selectedMonth ? 'is-selected' : ''}`}
            onMouseEnter={() => setActiveIndex(i)}
            onFocus={() => setActiveIndex(i)}
            onClick={() => {
              if (onOpenMonth && (i === activeIndex || window.matchMedia?.('(hover: hover)').matches)) onOpenMonth(m.jm);
              setActiveIndex(i);
            }}
            aria-label={m.change !== null
              ? t('{label}: {amount}، {direction} {pct} نسبت به ماه قبل', { label: m.label, amount: hideValues ? t('مبلغ پنهان') : formatCompactAmount(m.total), direction: m.change >= 0 ? t('افزایش') : t('کاهش'), pct: formatPct(m.change) })
              : t('{label}: {amount}', { label: m.label, amount: hideValues ? t('مبلغ پنهان') : formatCompactAmount(m.total) })}
            aria-pressed={i === index}
          >
            {!dense && m.change !== null && m.total > 0 && (
              <span className={`flow-bar-pct ${tone(m.change)}`} style={{ bottom: `calc(${height(m.total)}% + 3px)` }} aria-hidden="true">
                {m.change >= 0 ? '+' : '−'}{formatPct(m.change)}
              </span>
            )}
            <span className="monthly-income-bar" style={{ height: `${height(m.total)}%` }}>
              {shownStacks.map((st) => {
                const value = stackValue(m, st);
                return value > 0 ? (
                  <span key={st.key} className={`monthly-income-seg ${activeStack && activeStack !== st.key && !legend.isHidden(activeStack) ? 'is-dimmed' : ''}`} style={{ flexGrow: value, background: st.color }} />
                ) : null;
              })}
            </span>
          </button>
        ))}
      </div>
      <div className="monthly-income-axis" style={columns} aria-hidden="true">
        {months.map((m, i) => (
          <span key={m.key} className={`${i === index ? 'is-active' : ''} ${(months.length - 1 - i) % labelStep === 0 || i === index ? '' : 'is-minor'}`}>{m.monthLabel}</span>
        ))}
      </div>

      {stacks.length > 0 && (
        <ul className="monthly-income-legend" aria-label={t('ترکیب {noun} {month}', { noun: meta.nouns, month: month.label })}>
          {stacks.map((st) => (
            <li
              key={st.key}
              className={activeStack && activeStack !== st.key && !legend.isHidden(activeStack) ? 'is-dimmed' : ''}
              onMouseEnter={() => setActiveStack(st.key)}
              onMouseLeave={() => setActiveStack(null)}
              {...legendItemProps(legend, st.key, st.label)}
            >
              <span className="monthly-income-swatch" style={{ background: st.color }} aria-hidden="true" />
              <span className="monthly-income-legend-name">{st.label}</span>
              <span className="monthly-income-legend-amount">{stackValue(month, st) > 0 ? amount(stackValue(month, st)) : '—'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
