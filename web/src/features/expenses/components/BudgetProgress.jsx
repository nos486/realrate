/**
 * BudgetProgress.jsx — One budget line: what was spent against the budget, as a bar
 * (warning past 80%, over-budget past 100%)
 */

import React from 'react';
import { formatAmount } from '../utils/format.js';

export default function BudgetProgress({ label, icon = null, spent, budget, hideValues = false }) {
  const share = budget > 0 ? spent / budget : 0;
  const tone = share > 1 ? 'is-over' : share >= 0.8 ? 'is-warning' : '';
  const money = (v) => (hideValues ? '****' : formatAmount(v));
  return (
    <div className={`budget-progress ${tone}`}>
      <div className="budget-progress-head">
        <span className="budget-progress-label">{icon}{label}</span>
        <span className="budget-progress-values">
          {money(spent)} / {money(budget)}
          <strong> {(share * 100).toLocaleString('fa-IR', { maximumFractionDigits: 0 })}٪</strong>
        </span>
      </div>
      <div
        className="budget-progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(share, 1) * 100)}
      >
        <span style={{ width: `${Math.min(share, 1) * 100}%` }} />
      </div>
      {share > 1 && <span className="budget-progress-over">{money(spent - budget)} تومان بیش از بودجه</span>}
    </div>
  );
}
