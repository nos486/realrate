/**
 * MonthlyIncomeChart.jsx — Bar chart of income per Shamsi month over the last year
 *
 * One bar per month (oldest on the left, so growth reads as a rising line of bars), a dashed
 * line at the monthly average, and a readout above the plot: by default the latest month with
 * income (the current month may have only just begun) and its change against the month before;
 * hovering / tapping a bar shows that month instead.
 */

import React, { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatCompactAmount } from '../../../shared/utils/formatters.js';

const formatPct = (v) => `${Math.abs(v).toLocaleString('fa-IR', { maximumFractionDigits: Math.abs(v) < 10 ? 1 : 0 })}٪`;

/** Change of `month` against the month before it, or null when there is nothing to compare */
function changeFrom(prev, month) {
  if (!prev || prev.total <= 0) return null;
  return ((month.total - prev.total) / prev.total) * 100;
}

/**
 * @param {{
 *   series: Array<{ key: string, label: string, monthLabel: string, total: number, count: number }>,
 *   hideValues?: boolean,
 * }} props oldest month first
 */
export default function MonthlyIncomeChart({ series, hideValues = false }) {
  const [activeIndex, setActiveIndex] = useState(null);

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

  return (
    <div className="portfolio-stat-card monthly-income-chart">
      <div className="stat-header">
        <span className="stat-label">درآمد ماهانه (یک سال اخیر)</span>
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
            <span className="monthly-income-bar" style={{ height: `${height(m.total)}%` }} />
          </button>
        ))}
      </div>
      <div className="monthly-income-axis" aria-hidden="true">
        {series.map((m, i) => (
          // Every third month (counting back from the latest) is labeled, plus the selected one
          <span
            key={m.key}
            className={`${i === index ? 'is-active' : ''} ${(series.length - 1 - i) % 3 === 0 ? '' : 'is-minor'}`}
          >
            {m.monthLabel}
          </span>
        ))}
      </div>
    </div>
  );
}
