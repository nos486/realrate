/**
 * RiskMixPie.jsx — The suggested asset mix of a risk profile: a pie with a legend
 *
 * Shared by the risk-test modal's result and the portfolio's risk card. Shares are percents
 * (utils/riskProfile.js RISK_PROFILES[].allocation); colors come from chartColors.js.
 */

import React from 'react';
import { CHART_COLORS, CHART_OTHER_COLOR } from '../../../shared/ui/chartColors.js';
import { RISK_ASSET_CLASSES } from '../../../utils/riskProfile.js';

const fa = (n) => Number(n || 0).toLocaleString('fa-IR');

/** A profile's allocation as legend items, in the profile's order */
export const mixItemsOf = (allocation = {}) =>
  Object.entries(allocation).map(([key, value]) => ({ key, label: RISK_ASSET_CLASSES[key] || key, value }));

const PIE = { size: 120, r: 54 };

/** @param {{ items: Array<{ key: string, label: string, value: number }> }} props */
export default function RiskMixPie({ items }) {
  const c = PIE.size / 2;
  const shown = items.filter((i) => i.value > 0);
  const slices = shown.map((item, i) => {
    const before = shown.slice(0, i).reduce((sum, x) => sum + x.value, 0);
    return {
      ...item,
      start: (before / 100) * Math.PI * 2,
      end: ((before + item.value) / 100) * Math.PI * 2,
      color: CHART_COLORS[i] || CHART_OTHER_COLOR,
    };
  });
  const pt = (a) => [c + PIE.r * Math.sin(a), c - PIE.r * Math.cos(a)];
  const path = (s) => {
    if (s.end - s.start >= Math.PI * 2 - 1e-6) return `M${c} ${c - PIE.r}A${PIE.r} ${PIE.r} 0 1 1 ${c - 0.01} ${c - PIE.r}Z`;
    const [x1, y1] = pt(s.start);
    const [x2, y2] = pt(s.end);
    return `M${c} ${c}L${x1} ${y1}A${PIE.r} ${PIE.r} 0 ${s.end - s.start > Math.PI ? 1 : 0} 1 ${x2} ${y2}Z`;
  };
  return (
    <div className="risk-mix">
      <svg width={PIE.size} height={PIE.size} viewBox={`0 0 ${PIE.size} ${PIE.size}`} role="img" aria-label="ترکیب پیشنهادی">
        {slices.map((s) => <path key={s.key} d={path(s)} fill={s.color}><title>{`${s.label}: ${fa(s.value)}٪`}</title></path>)}
      </svg>
      <ul className="risk-mix-legend">
        {slices.map((s) => (
          <li key={s.key}><i style={{ background: s.color }} /> {s.label} <strong>{fa(s.value)}٪</strong></li>
        ))}
      </ul>
    </div>
  );
}

