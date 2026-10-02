/**
 * ExpenseTagTotals.jsx — «برچسب‌ها»: a project's total per tag (the user's share, in tomans),
 * largest first, with a bar of its part of the project. Tapping a tag shows only its expenses
 * (again: all of them). An expense with several tags counts under each. Under each tag, what
 * its expenses were in dollars (each at its day's rate) and what that costs at today's rate.
 */

import React from 'react';
import { Tags } from 'lucide-react';
import { formatAmount } from '../utils/format.js';

const MASK = '****';
const faNum = (n) => Number(n || 0).toLocaleString('fa-IR');
const faPct = (n) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toLocaleString('fa-IR', { maximumFractionDigits: 0 })}٪`;

/** «≈ X دلار · امروز Y تومان (±٪)» for a tag's expenses with the day's rate */
function TagDollarLine({ dollar, money }) {
  if (!dollar || dollar.counted === 0) return null;
  return (
    <span className="expense-tag-today">
      ≈ {money(dollar.usd, 'USD')} دلار
      {dollar.todayToman !== null && (
        <>
          {' · به نرخ امروز '}<strong>{money(dollar.todayToman)}</strong> تومان
          {dollar.changePct !== null && <b className={dollar.changePct >= 0 ? 'is-up' : 'is-down'}> ({faPct(dollar.changePct)})</b>}
        </>
      )}
      {dollar.missing > 0 && <small> · {faNum(dollar.missing)} بدون نرخ</small>}
    </span>
  );
}

export default function ExpenseTagTotals({ byTag, totalToman = 0, activeTag = null, onSelect, hideValues = false }) {
  if (!byTag?.tags?.length) return null;
  const money = (v, currency = 'IRT') => (hideValues ? MASK : formatAmount(v, currency));
  const share = (v) => (totalToman > 0 ? Math.min(100, (v / totalToman) * 100) : 0);

  return (
    <div className="expense-side-card expense-tag-totals">
      <div className="expense-tag-totals-head">
        <span><Tags size={14} /> برچسب‌ها</span>
        {activeTag && <button type="button" className="expense-tag-clear" onClick={() => onSelect(null)}>همه</button>}
      </div>
      <ul>
        {byTag.tags.map((t) => (
          <li key={t.tag}>
            <button
              type="button"
              className={`expense-tag-row ${activeTag && activeTag.toLowerCase() === t.tag.toLowerCase() ? 'is-active' : ''}`}
              onClick={() => onSelect(activeTag && activeTag.toLowerCase() === t.tag.toLowerCase() ? null : t.tag)}
              aria-pressed={Boolean(activeTag && activeTag.toLowerCase() === t.tag.toLowerCase())}
            >
              <span className="expense-tag-name">#{t.tag}</span>
              <span className="expense-tag-count">{faNum(t.count)} مورد</span>
              <strong className="expense-tag-sum">{money(t.totalToman)} <small>تومان</small></strong>
              <TagDollarLine dollar={t.dollar} money={money} />
              <span className="expense-tag-bar" aria-hidden="true"><i style={{ width: `${share(t.totalToman)}%` }} /></span>
            </button>
          </li>
        ))}
        {byTag.untagged.count > 0 && (
          <li className="expense-tag-untagged">
            <span>بدون برچسب · {faNum(byTag.untagged.count)} مورد</span>
            <strong>{money(byTag.untagged.totalToman)} <small>تومان</small></strong>
            <TagDollarLine dollar={byTag.untagged.dollar} money={money} />
          </li>
        )}
      </ul>
    </div>
  );
}
