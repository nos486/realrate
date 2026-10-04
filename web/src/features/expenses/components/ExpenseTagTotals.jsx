/**
 * ExpenseTagTotals.jsx — «برچسب‌ها»: a project's total per tag (the user's share, in tomans),
 * largest first, with a bar of its part of the project. Tapping a tag shows only its expenses
 * (again: all of them). An expense with several tags counts under each. Under each tag, what
 * its expenses were in dollars (each at its day's rate) and what that costs at today's rate.
 */

import React from 'react';
import { Tags } from 'lucide-react';
import { formatAmount } from '../utils/format.js';
import { DollarValueLine } from '../../../shared/ui/DollarValue.jsx';

const MASK = '****';
const faNum = (n) => Number(n || 0).toLocaleString('fa-IR');

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
              <DollarValueLine value={t.dollar.counted ? t.dollar : null} hideValues={hideValues} />
              <span className="expense-tag-bar" aria-hidden="true"><i style={{ width: `${share(t.totalToman)}%` }} /></span>
            </button>
          </li>
        ))}
        {byTag.untagged.count > 0 && (
          <li className="expense-tag-untagged">
            <span>بدون برچسب · {faNum(byTag.untagged.count)} مورد</span>
            <strong>{money(byTag.untagged.totalToman)} <small>تومان</small></strong>
            <DollarValueLine value={byTag.untagged.dollar.counted ? byTag.untagged.dollar : null} hideValues={hideValues} />
          </li>
        )}
      </ul>
    </div>
  );
}
