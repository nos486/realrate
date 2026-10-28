/**
 * RiskMixPie.jsx — The suggested asset mix of a risk profile: a pie with a legend
 *
 * Shared by the risk-test modal's result and the portfolio's risk card. Shares are percents
 * (utils/riskProfile.js RISK_PROFILES[].allocation); colors come from chartColors.js. Tapping a
 * legend item hides / shows its slice; the pie then splits the shown slices (the legend keeps
 * the suggested percents).
 */

import { intlLocale, t } from '../../../utils/i18n.js';
import React, { useMemo } from 'react';
import { CHART_COLORS, CHART_OTHER_COLOR } from '../../../shared/ui/chartColors.js';
import { legendItemProps, useLegendSelection } from '../../../shared/ui/legendSelection.js';

const fa = (n) => Number(n || 0).toLocaleString(intlLocale());

const PIE = { size: 120, r: 54 };

/** @param {{ items: Array<{ key: string, label: string, value: number }> }} props */
export default function RiskMixPie({ items }) {
  const c = PIE.size / 2;
  const present = items.filter((i) => i.value > 0);
  const keys = useMemo(() => items.filter((i) => i.value > 0).map((i) => i.key), [items]);
  const legend = useLegendSelection(keys);
  const colored = present.map((item, i) => ({ ...item, color: CHART_COLORS[i] || CHART_OTHER_COLOR }));
  const shown = colored.filter((s) => !legend.isHidden(s.key));
  const whole = shown.reduce((sum, x) => sum + x.value, 0) || 100;
  const slices = shown.map((item, i) => {
    const before = shown.slice(0, i).reduce((sum, x) => sum + x.value, 0);
    return {
      ...item,
      start: (before / whole) * Math.PI * 2,
      end: ((before + item.value) / whole) * Math.PI * 2,
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
      <svg width={PIE.size} height={PIE.size} viewBox={`0 0 ${PIE.size} ${PIE.size}`} role="img" aria-label={t('ترکیب پیشنهادی')}>
        {slices.map((s) => <path key={s.key} d={path(s)} fill={s.color}><title>{t('{label}: {pct}٪', { label: s.label, pct: fa(s.value) })}</title></path>)}
      </svg>
      <ul className="risk-mix-legend">
        {colored.map((s) => (
          <li key={s.key} {...legendItemProps(legend, s.key, s.label)}><i style={{ background: s.color }} /> {s.label} <strong>{t('{pct}٪', { pct: fa(s.value) })}</strong></li>
        ))}
      </ul>
    </div>
  );
}

