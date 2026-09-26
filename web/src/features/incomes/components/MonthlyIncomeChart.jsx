/**
 * MonthlyIncomeChart.jsx — Stacked bar chart of income per Shamsi month over the chosen period
 *
 * One bar per month (oldest on the left, so growth reads as a rising line of bars), stacked by
 * income source, a dashed line at the monthly average, and a readout above the plot: by default
 * the latest month with income (the current month may have only just begun) and its change
 * against the month before; hovering / tapping a bar shows that month instead. The legend lists
 * the sources with the selected month's amount of each.
 */

import React, { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatCompactAmount } from '../../../shared/utils/formatters.js';
import { CHART_COLORS, CHART_OTHER_COLOR } from '../../../shared/ui/chartColors.js';
import { getIncomeCategory } from '../constants/incomeCategories.js';

const OTHER_KEY = '__other__';

const formatPct = (v) => `${Math.abs(v).toLocaleString('fa-IR', { maximumFractionDigits: Math.abs(v) < 10 ? 1 : 0 })}٪`;

/** Change of `month` against the month before it, or null when there is nothing to compare */
function changeFrom(prev, month) {
  if (!prev || prev.total <= 0) return null;
  return ((month.total - prev.total) / prev.total) * 100;
}

/**
 * The stacked series: one per income source, in `order` first (so colors match the source donut,
 * which takes the same hues in that order), then the rest by their total over the whole chart.
 * Sources past the palette fold into one gray "Other".
 */
function buildStacks(series, order) {
  const totals = new Map();
  for (const m of series) {
    for (const [category, value] of Object.entries(m.byCategory || {})) {
      totals.set(category, (totals.get(category) || 0) + value);
    }
  }
  const present = [
    ...order.filter((c) => totals.has(c)),
    ...[...totals.keys()].filter((c) => !order.includes(c)).sort((a, b) => totals.get(b) - totals.get(a)),
  ];
  const stacks = present.slice(0, CHART_COLORS.length).map((category, i) => ({
    key: category,
    categories: [category],
    label: getIncomeCategory(category).label,
    color: CHART_COLORS[i],
  }));
  const rest = present.slice(CHART_COLORS.length);
  if (rest.length > 0) {
    stacks.push({
      key: rest.length === 1 ? rest[0] : OTHER_KEY,
      categories: rest,
      label: rest.length === 1 ? getIncomeCategory(rest[0]).label : 'سایر منابع',
      color: CHART_OTHER_COLOR,
    });
  }
  return stacks;
}

const stackValue = (month, stack) => stack.categories.reduce((acc, c) => acc + (month.byCategory?.[c] || 0), 0);

/**
 * @param {{
 *   series: Array<{ key: string, label: string, monthLabel: string, total: number, count: number,
 *     byCategory: Record<string, number> }>,
 *   title?: string,             // the period, e.g. «۶ ماه اخیر»
 *   categoryOrder?: string[],   // source order of the donut next to it, to share its colors
 *   hideValues?: boolean,
 * }} props oldest month first
 */
export default function MonthlyIncomeChart({ series, title = 'یک سال اخیر', categoryOrder = [], hideValues = false }) {
  const [activeIndex, setActiveIndex] = useState(null);
  const [activeStack, setActiveStack] = useState(null);

  const stacks = useMemo(() => buildStacks(series, categoryOrder), [series, categoryOrder]);

  const { max, average, total, latestIndex } = useMemo(() => {
    const sum = series.reduce((acc, m) => acc + m.total, 0);
    return {
      max: Math.max(0, ...series.map((m) => m.total)),
      total: sum,
      average: series.length ? sum / series.length : 0,
      latestIndex: series.findLastIndex((m) => m.total > 0),
    };
  }, [series]);

  if (series.length === 0 || total <= 0) return null;

  const index = activeIndex ?? latestIndex;
  const month = series[index];
  const change = changeFrom(series[index - 1], month);
  const amount = (v) => (hideValues ? '****' : formatCompactAmount(v));
  const height = (v) => (max > 0 ? (v / max) * 100 : 0);
  const labelStep = series.length <= 4 ? 1 : series.length <= 8 ? 2 : 3;

  return (
    <div className="portfolio-stat-card monthly-income-chart">
      <div className="stat-header">
        <span className="stat-label">درآمد ماهانه ({title})</span>
        <span className="monthly-income-avg-label">
          <span className="monthly-income-avg-key" aria-hidden="true" />
          میانگین {amount(average)}
        </span>
      </div>

      <div className="monthly-income-readout" aria-live="polite">
        <div>
          <strong>{amount(month.total)}</strong>
          <span>
            <bdi>{month.label}</bdi>
            {month.count > 0 && (
              <>
                {'، '}
                <bdi>{month.count.toLocaleString('fa-IR')} مورد</bdi>
              </>
            )}
          </span>
        </div>
        {change !== null && (
          <span
            className={`monthly-income-change ${change >= 0 ? 'is-up' : 'is-down'}`}
            title="نسبت به ماه قبل"
          >
            {change >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {change >= 0 ? '+' : '−'}
            {formatPct(change)}
            <small>نسبت به ماه قبل</small>
          </span>
        )}
      </div>

      <div className="monthly-income-plot" onMouseLeave={() => setActiveIndex(null)}>
        {average > 0 && (
          <div className="monthly-income-average" style={{ bottom: `${height(average)}%` }} aria-hidden="true" />
        )}
        {series.map((m, i) => (
          <button
            key={m.key}
            type="button"
            className={`monthly-income-col ${i === index ? 'is-active' : ''}`}
            onMouseEnter={() => setActiveIndex(i)}
            onFocus={() => setActiveIndex(i)}
            onClick={() => setActiveIndex(i)}
            aria-label={`${m.label}: ${hideValues ? 'مبلغ پنهان' : formatCompactAmount(m.total)}`}
            aria-pressed={i === index}
          >
            <span className="monthly-income-bar" style={{ height: `${height(m.total)}%` }}>
              {stacks.map((st) => {
                const value = stackValue(m, st);
                return value > 0 ? (
                  <span
                    key={st.key}
                    className={`monthly-income-seg ${activeStack && activeStack !== st.key ? 'is-dimmed' : ''}`}
                    style={{ flexGrow: value, background: st.color }}
                  />
                ) : null;
              })}
            </span>
          </button>
        ))}
      </div>
      <div className="monthly-income-axis" aria-hidden="true">
        {series.map((m, i) => (
          // Every month up to 4, every other one up to 8, then every third (counting back from
          // the latest), plus the selected one
          <span
            key={m.key}
            className={`${i === index ? 'is-active' : ''} ${(series.length - 1 - i) % labelStep === 0 ? '' : 'is-minor'}`}
          >
            {m.monthLabel}
          </span>
        ))}
      </div>

      <ul className="monthly-income-legend" aria-label={`ترکیب درآمد ${month.label}`}>
        {stacks.map((st) => (
          <li
            key={st.key}
            className={activeStack && activeStack !== st.key ? 'is-dimmed' : ''}
            onMouseEnter={() => setActiveStack(st.key)}
            onMouseLeave={() => setActiveStack(null)}
          >
            <span className="monthly-income-swatch" style={{ background: st.color }} aria-hidden="true" />
            <span className="monthly-income-legend-name">{st.label}</span>
            <span className="monthly-income-legend-amount">
              {stackValue(month, st) > 0 ? amount(stackValue(month, st)) : '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
