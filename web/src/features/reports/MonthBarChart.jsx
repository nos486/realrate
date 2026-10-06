/**
 * MonthBarChart.jsx — A Shamsi year month by month as bars: one series, or two side by side on
 * the same scale (never two scales). Values below zero hang under a zero line. Hovering / tapping
 * a month shows its figures in the readout above the plot; with two series a legend names them
 * (and gives the month's values), so a series is never told apart by color alone.
 *
 * Built on the same plot as the incomes / expenses year chart (styles/incomes.css
 * `.monthly-income-*`), with its own bars (styles/reports.css).
 */

import React, { useMemo, useState } from 'react';

/**
 * @param {{
 *   title: string,
 *   months: Array<{ key: string, label: string, monthLabel: string }>,
 *   series: Array<{ key: string, label: string, color: string, value: (m: object) => number|null }>,
 *   format: (v: number) => string,
 *   readout: (m: object) => React.ReactNode,
 *   average?: number|null, averageLabel?: string,
 *   negativeColor?: string,
 *   ariaValue: (m: object) => string,
 * }} props
 */
export default function MonthBarChart({ title, months, series, format, readout, average = null, averageLabel = '', negativeColor = null, ariaValue }) {
  const [activeIndex, setActiveIndex] = useState(null);
  const { top, bottom } = useMemo(() => {
    const values = months.flatMap((m) => series.map((s) => Number(s.value(m)) || 0));
    if (average !== null) values.push(average);
    return { top: Math.max(0, ...values), bottom: Math.min(0, ...values) };
  }, [months, series, average]);

  if (!months.length) return null;
  const range = top - bottom || 1;
  // Where zero sits, from the bottom of the plot (%)
  const zero = (-bottom / range) * 100;
  const pos = (v) => ((v - bottom) / range) * 100;
  const fallback = Math.max(0, months.findLastIndex((m) => series.some((s) => Number(s.value(m)))));
  const index = activeIndex ?? fallback;
  const month = months[index];

  return (
    <div className="portfolio-stat-card monthly-income-chart report-bar-chart">
      <div className="stat-header">
        <span className="stat-label">{title}</span>
        {average !== null && (
          <span className="monthly-income-avg-label">
            <span className="monthly-income-avg-key" aria-hidden="true" />
            {averageLabel} {format(average)}
          </span>
        )}
      </div>

      <div className="monthly-income-readout" aria-live="polite">{readout(month)}</div>

      <div className="monthly-income-plot report-bar-plot" onMouseLeave={() => setActiveIndex(null)}>
        {bottom < 0 && <div className="report-zero-line" style={{ bottom: `${zero}%` }} aria-hidden="true" />}
        {average !== null && <div className="monthly-income-average" style={{ bottom: `${pos(average)}%` }} aria-hidden="true" />}
        {months.map((m, i) => (
          <button
            key={m.key}
            type="button"
            className={`monthly-income-col report-bar-col ${i === index ? 'is-active' : ''}`}
            onMouseEnter={() => setActiveIndex(i)}
            onFocus={() => setActiveIndex(i)}
            onClick={() => setActiveIndex(i)}
            aria-label={`${m.label}: ${ariaValue(m)}`}
            aria-pressed={i === index}
          >
            {series.map((s) => {
              const v = Number(s.value(m)) || 0;
              const negative = v < 0;
              const height = (Math.abs(v) / range) * 100;
              return (
                <span key={s.key} className="report-bar-slot">
                  {v !== 0 && (
                    <span
                      className={`report-bar ${negative ? 'is-negative' : ''}`}
                      style={{
                        bottom: `${negative ? zero - height : zero}%`,
                        height: `${height}%`,
                        background: negative && negativeColor ? negativeColor : s.color,
                      }}
                    />
                  )}
                </span>
              );
            })}
          </button>
        ))}
      </div>
      <div className="monthly-income-axis" aria-hidden="true">
        {months.map((m, i) => (
          // On a phone every other month is named (counting back from the latest), the active one always
          <span key={m.key} className={i === index ? 'is-active' : (months.length - 1 - i) % 2 ? 'is-minor' : ''}>{m.monthLabel}</span>
        ))}
      </div>

      {series.length > 1 && (
        <ul className="monthly-income-legend" aria-label={`${title} — ${month.label}`}>
          {series.map((s) => (
            <li key={s.key}>
              <span className="monthly-income-swatch" style={{ background: s.color }} aria-hidden="true" />
              <span className="monthly-income-legend-name">{s.label}</span>
              <span className="monthly-income-legend-amount">{format(Number(s.value(month)) || 0)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
