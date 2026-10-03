/**
 * AllocationTargetsCard.jsx — «هدف ترکیب»: each category's share today against its target
 *
 * A pie of today's shares (with each category's target as a thin outer ring) and a row per
 * category: today's share, its target, and how far apart they are, in points and in tomans — red
 * when more than DRIFT_THRESHOLD points (utils/allocationTargets.js). Without targets it invites
 * setting them.
 */

import React from 'react';
import { Target, AlertTriangle, Pencil } from 'lucide-react';
import { CategoryIcon } from '../utils/holdingHelpers.js';
import { CHART_COLORS, CHART_OTHER_COLOR } from '../../../shared/ui/chartColors.js';
import { DRIFT_THRESHOLD } from '../utils/allocationTargets.js';
import { formatCompactAmount } from '../../../shared/utils/formatters.js';

const SIZE = 132;
const C = SIZE / 2;
const PIE_R = 52;
const RING_R = 61;

const faPct = (n) => `${Number(n || 0).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪`;
const signedPct = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${faPct(Math.abs(n))}`;
/** «+۱۲ میلیون»: how many tomans above or below the target */
const signedAmount = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatCompactAmount(Math.abs(n))}`;
const colorOf = (i) => CHART_COLORS[i] || CHART_OTHER_COLOR;

const point = (r, a) => [C + r * Math.sin(a), C - r * Math.cos(a)];

/** A pie slice (whole circle when it is all of it) */
function slicePath(start, end) {
  if (end - start >= Math.PI * 2 - 1e-6) return `M${C} ${C - PIE_R}A${PIE_R} ${PIE_R} 0 1 1 ${C - 0.01} ${C - PIE_R}Z`;
  const [x1, y1] = point(PIE_R, start);
  const [x2, y2] = point(PIE_R, end);
  return `M${C} ${C}L${x1} ${y1}A${PIE_R} ${PIE_R} 0 ${end - start > Math.PI ? 1 : 0} 1 ${x2} ${y2}Z`;
}

function arcPath(start, end) {
  const span = Math.min(end - start, Math.PI * 2 - 1e-3);
  const [x1, y1] = point(RING_R, start);
  const [x2, y2] = point(RING_R, start + span);
  return `M${x1} ${y1}A${RING_R} ${RING_R} 0 ${span > Math.PI ? 1 : 0} 1 ${x2} ${y2}`;
}

/** Each row's angles: today's share as a slice, its target as an arc of the ring */
function layoutSlices(rows) {
  const turn = (pct) => (pct / 100) * Math.PI * 2;
  const slices = [];
  rows.forEach((r, i) => {
    const prev = slices[i - 1];
    const start = prev ? prev.end : 0;
    const ringStart = prev ? prev.ringEnd : 0;
    slices.push({ r, color: colorOf(i), start, end: start + turn(r.currentPct), ringStart, ringEnd: ringStart + turn(r.targetPct || 0) });
  });
  return slices;
}

function Pie({ rows }) {
  const slices = layoutSlices(rows);
  return (
    <svg className="allocation-targets-pie" width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="ترکیب فعلی و هدف">
      {slices.filter((s) => s.end > s.start).map((s) => (
        <path key={s.r.targetKey} d={slicePath(s.start, s.end)} fill={s.color}>
          <title>{`${s.r.name}: ${faPct(s.r.currentPct)}`}</title>
        </path>
      ))}
      {slices.filter((s) => s.ringEnd > s.ringStart).map((s) => (
        <path key={`t-${s.r.targetKey}`} d={arcPath(s.ringStart, s.ringEnd)} stroke={s.color} strokeWidth="5" fill="none" strokeLinecap="butt" opacity="0.75">
          <title>{`هدف ${s.r.name}: ${faPct(s.r.targetPct)}`}</title>
        </path>
      ))}
    </svg>
  );
}

export default function AllocationTargetsCard({ allocation, onEdit, readOnly = false, hideValues = false }) {
  const { rows, hasTargets, complete, drifted, targetsTotal } = allocation;
  // Largest share first: the same color order as the pie
  const ordered = [...rows].sort((a, b) => b.currentPct - a.currentPct || (b.targetPct || 0) - (a.targetPct || 0));

  return (
    <div className={`portfolio-stat-card allocation-targets-card ${drifted.length ? 'has-drift' : ''}`}>
      <div className="stat-header">
        <span className="stat-label"><Target size={13} /> هدف ترکیب پورتفو</span>
        {!readOnly && onEdit && (
          <button type="button" className="btn-table-action edit" title="هدف‌گذاری" aria-label="هدف‌گذاری" onClick={onEdit}>
            <Pencil size={13} />
          </button>
        )}
      </div>

      {!hasTargets ? (
        <div className="allocation-targets-empty">
          <p className="stat-sub">
            برای هر دسته سهم هدف بگذارید (مثلاً طلا ۳۰٪، ارز ۲۵٪)؛ اگر ترکیب پورتفو بیش از {DRIFT_THRESHOLD.toLocaleString('fa-IR')}٪ از هدف فاصله گرفت، هشدار می‌گیرید.
          </p>
          {!readOnly && onEdit && (
            <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={onEdit}>
              <Target size={14} /> هدف‌گذاری
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="allocation-targets-body">
            <Pie rows={ordered} />
            <div className="allocation-targets-legend-note">
              <span><i className="is-fill" /> اکنون</span>
              <span><i className="is-ring" /> هدف</span>
            </div>
          </div>
          {!complete && (
            <div className="allocation-targets-note">
              جمع اهداف {faPct(targetsTotal)} است؛ تا ۱۰۰٪ نشود فاصله‌ها بررسی نمی‌شوند.
            </div>
          )}
          <ul className="allocation-targets-list">
            {ordered.map((r, i) => (
              <li key={r.targetKey} className={r.drifted ? 'is-drifted' : ''}>
                <span className="allocation-targets-swatch" style={{ background: colorOf(i) }} aria-hidden="true" />
                <span className="allocation-targets-name" title={r.name}>
                  <CategoryIcon category={r.icon} size={12} /> {r.name}
                </span>
                <span className="allocation-targets-now">{faPct(r.currentPct)}</span>
                <span className="allocation-targets-goal">هدف {faPct(r.targetPct)}</span>
                <span className={`allocation-targets-diff ${r.drifted ? 'is-off' : ''}`}>
                  <span className="allocation-targets-diff-pct">{r.drifted && <AlertTriangle size={12} />} {signedPct(r.diff)}</span>
                  {r.diffValue !== null && r.diffValue !== 0 && (
                    <small className="allocation-targets-diff-amount" title={r.diffValue > 0 ? 'بیشتر از هدف (تومان)' : 'کمتر از هدف (تومان)'}>
                      {hideValues ? '****' : `${signedAmount(r.diffValue)} تومان`}
                    </small>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
