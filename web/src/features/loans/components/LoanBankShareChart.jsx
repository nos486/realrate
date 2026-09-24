/**
 * LoanBankShareChart.jsx — Donut chart of how the loans split across banks
 */

import React, { useMemo, useState } from 'react';
import { BankLogo } from '../../../shared/banks/index.js';

// Categorical hues in fixed order (validated for CVD separation and contrast on the dark card surface).
const SLICE_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'];
const OTHER_COLOR = '#6b7280';
const MAX_SLICES = SLICE_COLORS.length;

const MEASURES = [
  { id: 'principal', label: 'مبلغ وام', field: 'totalPrincipal', centerLabel: 'کل وام‌ها' },
  { id: 'remaining', label: 'مانده بدهی', field: 'totalRemaining', centerLabel: 'کل بدهی' },
];

const SIZE = 148;
const OUTER_R = 72;
const INNER_R = 50;

const formatNum = (v) => Math.round(Number(v || 0)).toLocaleString('fa-IR');

/** Short Persian amount for the donut's center, e.g. «۱٫۲ میلیارد» */
function formatCompact(value) {
  const v = Number(value || 0);
  const units = [
    [1e12, 'هزار میلیارد'],
    [1e9, 'میلیارد'],
    [1e6, 'میلیون'],
  ];
  for (const [size, label] of units) {
    if (v >= size) {
      const n = v / size;
      return `${n.toLocaleString('fa-IR', { maximumFractionDigits: n < 10 ? 1 : 0 })} ${label}`;
    }
  }
  return formatNum(v);
}

const formatPct = (share) =>
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
 * @param {{ groups: Array<{ key: string, name: string, bank: object, items: object[],
 *   totalPrincipal: number, totalRemaining: number }> }} props
 */
export default function LoanBankShareChart({ groups = [] }) {
  const [measureId, setMeasureId] = useState('principal');
  const [activeKey, setActiveKey] = useState(null);
  const measure = MEASURES.find((m) => m.id === measureId) || MEASURES[0];

  // Slices (and their colors) are picked by total loan amount and stay put when the measure
  // changes, so a bank keeps its color while switching views.
  const slices = useMemo(() => {
    const ranked = [...groups].sort((a, b) => b.totalPrincipal - a.totalPrincipal);
    const needsOther = ranked.length > MAX_SLICES;
    const top = needsOther ? ranked.slice(0, MAX_SLICES - 1) : ranked;
    const rest = needsOther ? ranked.slice(MAX_SLICES - 1) : [];
    const list = top.map((g, i) => ({
      key: g.key,
      name: g.name,
      bank: g.bank,
      count: g.items.length,
      color: SLICE_COLORS[i],
      totalPrincipal: g.totalPrincipal,
      totalRemaining: g.totalRemaining,
    }));
    if (rest.length > 0) {
      list.push({
        key: '__other__',
        name: `سایر (${rest.length.toLocaleString('fa-IR')} بانک)`,
        bank: null,
        count: rest.reduce((acc, g) => acc + g.items.length, 0),
        color: OTHER_COLOR,
        totalPrincipal: rest.reduce((acc, g) => acc + g.totalPrincipal, 0),
        totalRemaining: rest.reduce((acc, g) => acc + g.totalRemaining, 0),
      });
    }
    return list;
  }, [groups]);

  const total = slices.reduce((acc, s) => acc + s[measure.field], 0);

  const arcs = useMemo(() => {
    if (total <= 0) return [];
    let angle = 0;
    return slices
      .filter((s) => s[measure.field] > 0)
      .map((s) => {
        const sweep = (s[measure.field] / total) * Math.PI * 2;
        const arc = { ...s, share: s[measure.field] / total, start: angle, end: angle + sweep };
        angle += sweep;
        return arc;
      });
  }, [slices, measure.field, total]);

  const active = activeKey ? slices.find((s) => s.key === activeKey) : null;
  const activeShare = active && total > 0 ? active[measure.field] / total : 0;

  return (
    <div className="portfolio-stat-card loan-bank-share">
      <div className="stat-header">
        <span className="stat-label">سهم بانک‌ها از وام‌ها</span>
        <div className="loan-bank-share-toggle" role="group" aria-label="معیار نمودار">
          {MEASURES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={m.id === measureId ? 'is-active' : ''}
              aria-pressed={m.id === measureId}
              onClick={() => setMeasureId(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {total <= 0 ? (
        <div className="stat-sub loan-bank-share-empty">همه وام‌ها تسویه شده‌اند — بدهی باقیمانده‌ای وجود ندارد.</div>
      ) : (
        <div className="loan-bank-share-body">
          <div className="loan-bank-share-donut">
            <svg
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              width={SIZE}
              height={SIZE}
              role="img"
              aria-label={`سهم بانک‌ها بر اساس ${measure.label}`}
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
                    className={`loan-bank-share-slice ${activeKey && activeKey !== a.key ? 'is-dimmed' : ''}`}
                    onMouseEnter={() => setActiveKey(a.key)}
                  >
                    <title>{`${a.name}: ${formatPct(a.share)} — ${formatNum(a[measure.field])} تومان`}</title>
                  </path>
                ))
              )}
            </svg>
            <div className="loan-bank-share-center" aria-live="polite">
              {active ? (
                <>
                  <strong>{formatPct(activeShare)}</strong>
                  <span>{active.bank?.shortName || active.name}</span>
                </>
              ) : (
                <>
                  <strong>{formatCompact(total)}</strong>
                  <span>{measure.centerLabel}</span>
                </>
              )}
            </div>
          </div>

          <ul className="loan-bank-share-legend">
            {slices.map((s) => {
              const share = total > 0 ? s[measure.field] / total : 0;
              return (
                <li
                  key={s.key}
                  className={`loan-bank-share-row ${activeKey && activeKey !== s.key ? 'is-dimmed' : ''}`}
                  onMouseEnter={() => setActiveKey(s.key)}
                  onMouseLeave={() => setActiveKey(null)}
                >
                  <span className="loan-bank-share-swatch" style={{ background: s.color }} aria-hidden="true" />
                  {s.bank ? (
                    <BankLogo bank={s.bank} size={22} />
                  ) : (
                    <span className="bank-logo is-placeholder is-empty" style={{ width: 22, height: 22, fontSize: 10 }} aria-hidden="true">
                      …
                    </span>
                  )}
                  <span className="loan-bank-share-name" title={s.name}>
                    {s.name}
                  </span>
                  <span className="loan-bank-share-pct">{formatPct(share)}</span>
                  <span className="loan-bank-share-amount">{formatCompact(s[measure.field])}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
