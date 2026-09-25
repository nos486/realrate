/**
 * DonutChart.jsx — Part-to-whole donut card with a legend (used by the portfolio allocation
 * and the loans bank share).
 */

import React, { useMemo, useState } from 'react';
import { formatCompactAmount } from '../utils/formatters.js';
import { CHART_COLORS as DONUT_COLORS, CHART_OTHER_COLOR as OTHER_COLOR } from './chartColors.js';

// Slices take the shared hues in the order they're given; anything past the last hue folds into
// a neutral "Other" slice.
const OTHER_KEY = '__other__';

const SIZE = 148;
const OUTER_R = 72;
const INNER_R = 50;

const formatNum = (v) => Math.round(Number(v || 0)).toLocaleString('fa-IR');
const defaultOtherLabel = (count) => `سایر (${count.toLocaleString('fa-IR')} مورد)`;

const formatShare = (share) =>
  `${(share * 100).toLocaleString('fa-IR', { maximumFractionDigits: share < 0.1 ? 1 : 0 })}٪`;

/** SVG path of one donut segment between two angles (radians, clockwise from 12 o'clock) */
function arcPath(start, end) {
  const point = (r, a) => [SIZE / 2 + r * Math.sin(a), SIZE / 2 - r * Math.cos(a)];
  const large = end - start > Math.PI ? 1 : 0;
  const [x1, y1] = point(OUTER_R, start);
  const [x2, y2] = point(OUTER_R, end);
  const [x3, y3] = point(INNER_R, end);
  const [x4, y4] = point(INNER_R, start);
  return `M${x1} ${y1}A${OUTER_R} ${OUTER_R} 0 ${large} 1 ${x2} ${y2}L${x3} ${y3}A${INNER_R} ${INNER_R} 0 ${large} 0 ${x4} ${y4}Z`;
}

/**
 * @typedef {object} DonutItem
 * @property {string} key
 * @property {string} label        Legend / tooltip name
 * @property {string} [shortLabel] Name shown in the donut's center on hover
 * @property {number} value
 * @property {React.ReactNode} [icon] Shown before the name in the legend
 */

/**
 * @param {{
 *   title: string,
 *   items: DonutItem[],          // in display order; colors follow this order
 *   headerExtra?: React.ReactNode,
 *   centerLabel?: string,        // caption under the total in the center
 *   unit?: string,               // unit in tooltips, e.g. «تومان»
 *   masked?: boolean,            // hide amounts (percentages stay)
 *   otherLabel?: (count: number) => string,
 *   emptyMessage?: string,
 *   className?: string,
 * }} props
 */
export default function DonutChart({
  title,
  items = [],
  headerExtra = null,
  centerLabel = 'مجموع',
  unit = 'تومان',
  masked = false,
  otherLabel = defaultOtherLabel,
  emptyMessage = 'داده‌ای برای نمایش وجود ندارد.',
  className = '',
}) {
  const [activeKey, setActiveKey] = useState(null);

  // Keep the given order; fold everything past the palette into one gray "Other" slice
  const slices = useMemo(() => {
    const toValue = (item) => Math.max(0, Number(item.value) || 0);
    const top = items.slice(0, DONUT_COLORS.length);
    const rest = items.slice(DONUT_COLORS.length);
    const list = top.map((item, i) => ({ ...item, value: toValue(item), color: DONUT_COLORS[i] }));
    if (rest.length === 1) {
      list.push({ ...rest[0], value: toValue(rest[0]), color: OTHER_COLOR });
    } else if (rest.length > 1) {
      list.push({
        key: OTHER_KEY,
        label: otherLabel(rest.length),
        shortLabel: 'سایر',
        value: rest.reduce((acc, item) => acc + toValue(item), 0),
        color: OTHER_COLOR,
        icon: (
          <span className="donut-chart-other-icon" aria-hidden="true">
            …
          </span>
        ),
      });
    }
    return list;
  }, [items, otherLabel]);

  const total = slices.reduce((acc, s) => acc + s.value, 0);

  const arcs = useMemo(() => {
    if (total <= 0) return [];
    let angle = 0;
    return slices
      .filter((s) => s.value > 0)
      .map((s) => {
        const sweep = (s.value / total) * Math.PI * 2;
        const arc = { ...s, share: s.value / total, start: angle, end: angle + sweep };
        angle += sweep;
        return arc;
      });
  }, [slices, total]);

  const active = activeKey ? slices.find((s) => s.key === activeKey) : null;
  const shareOf = (s) => (total > 0 ? s.value / total : 0);
  const amount = (v, compact = true) => (masked ? '****' : compact ? formatCompactAmount(v) : `${formatNum(v)} ${unit}`);

  return (
    <div className={`portfolio-stat-card donut-chart-card ${className}`}>
      <div className="stat-header">
        <span className="stat-label">{title}</span>
        {headerExtra}
      </div>

      {total <= 0 ? (
        <div className="stat-sub donut-chart-empty">{emptyMessage}</div>
      ) : (
        <div className="donut-chart-body">
          <div className="donut-chart-figure">
            <svg
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              width={SIZE}
              height={SIZE}
              role="img"
              aria-label={title}
              onMouseLeave={() => setActiveKey(null)}
            >
              {arcs.length === 1 ? (
                <circle
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={(OUTER_R + INNER_R) / 2}
                  fill="none"
                  stroke={arcs[0].color}
                  strokeWidth={OUTER_R - INNER_R}
                  onMouseEnter={() => setActiveKey(arcs[0].key)}
                />
              ) : (
                arcs.map((a) => (
                  <path
                    key={a.key}
                    d={arcPath(a.start, a.end)}
                    fill={a.color}
                    className={`donut-chart-slice ${activeKey && activeKey !== a.key ? 'is-dimmed' : ''}`}
                    onMouseEnter={() => setActiveKey(a.key)}
                  >
                    <title>{`${a.label}: ${formatShare(a.share)}${masked ? '' : ` — ${amount(a.value, false)}`}`}</title>
                  </path>
                ))
              )}
            </svg>
            <div className="donut-chart-center" aria-live="polite">
              {active ? (
                <>
                  <strong>{formatShare(shareOf(active))}</strong>
                  <span>{active.shortLabel || active.label}</span>
                </>
              ) : (
                <>
                  <strong>{amount(total)}</strong>
                  <span>{centerLabel}</span>
                </>
              )}
            </div>
          </div>

          <ul className="donut-chart-legend">
            {slices.map((s) => (
              <li
                key={s.key}
                className={`donut-chart-row ${s.icon ? 'has-icon' : ''} ${activeKey && activeKey !== s.key ? 'is-dimmed' : ''}`}
                onMouseEnter={() => setActiveKey(s.key)}
                onMouseLeave={() => setActiveKey(null)}
              >
                <span className="donut-chart-swatch" style={{ background: s.color }} aria-hidden="true" />
                {s.icon}
                <span className="donut-chart-name" title={s.label}>
                  {s.label}
                </span>
                <span className="donut-chart-pct">{formatShare(shareOf(s))}</span>
                <span className="donut-chart-amount">{amount(s.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Small pill toggle for switching what a chart measures.
 * @param {{ options: Array<{ id: string, label: string }>, value: string, onChange: (id: string) => void, label: string }} props
 */
export function ChartToggle({ options, value, onChange, label }) {
  return (
    <div className="donut-chart-toggle" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={o.id === value ? 'is-active' : ''}
          aria-pressed={o.id === value}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
