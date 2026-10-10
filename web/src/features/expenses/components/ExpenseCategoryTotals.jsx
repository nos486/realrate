/**
 * ExpenseCategoryTotals.jsx — «دسته‌بندی‌ها»: a project's total per category (the user's share,
 * in tomans), largest first, with a bar of its part of the project. A project is a place, not a
 * category: its expenses keep their own categories (materials, labour, ...), summed here.
 * Tapping a category shows only its expenses (again: all of them). Expenses without a category
 * are «بدون دسته‌بندی» ('').
 */

import React from 'react';
import { Shapes } from 'lucide-react';
import { formatAmount } from '../utils/format.js';
import { getExpenseCategory } from '../constants/expenseCategories.js';

const MASK = '****';
const faNum = (n) => Number(n || 0).toLocaleString('fa-IR');

/** A category's name ('' : none) */
const projectCategoryLabel = (category) => (category ? getExpenseCategory(category).label : 'بدون دسته‌بندی');

/**
 * @param {{ items: Array<{ category: string, totalToman: number, count: number }>, totalToman?: number,
 *   active?: string|null, onSelect: (category: string|null) => void, hideValues?: boolean }} props
 *   items: summarizeByCategory(…, { none: '' }); active: the category shown alone, or null
 */
export default function ExpenseCategoryTotals({ items, totalToman = 0, active = null, onSelect, hideValues = false }) {
  // Nothing to break down while no expense has a category
  if (!items?.some((c) => c.category)) return null;
  const share = (v) => (totalToman > 0 ? Math.min(100, (v / totalToman) * 100) : 0);

  return (
    <div className="expense-side-card expense-tag-totals">
      <div className="expense-tag-totals-head">
        <span><Shapes size={14} /> دسته‌بندی‌ها</span>
        {active !== null && <button type="button" className="expense-tag-clear" onClick={() => onSelect(null)}>همه</button>}
      </div>
      <ul>
        {items.map((c) => (
          <li key={c.category || 'none'}>
            <button
              type="button"
              className={`expense-tag-row ${active === c.category ? 'is-active' : ''}`}
              onClick={() => onSelect(active === c.category ? null : c.category)}
              aria-pressed={active === c.category}
            >
              <span className="expense-tag-name">{projectCategoryLabel(c.category)}</span>
              <span className="expense-tag-count">{faNum(c.count)} مورد</span>
              <strong className="expense-tag-sum">{hideValues ? MASK : formatAmount(c.totalToman)} <small>تومان</small></strong>
              <span className="expense-tag-bar" aria-hidden="true"><i style={{ width: `${share(c.totalToman)}%` }} /></span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
