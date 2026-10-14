/**
 * ExpenseTagTotals.jsx — «برچسب‌ها»: a project's total per tag (the user's share, in tomans),
 * largest first, with a bar of its part of the project. Tapping a tag shows only its expenses
 * (again: all of them). An expense with several tags counts under each. Under each tag, what
 * its expenses were in dollars (each at its day's rate) and what that costs at today's rate.
 */

import { intlLocale, t } from '../../../utils/i18n.js';
import React from 'react';
import { Tags } from 'lucide-react';
import { formatAmount } from '../utils/format.js';
import { DollarValueLine } from '../../../shared/ui/DollarValue.jsx';

const MASK = '****';
const faNum = (n) => Number(n || 0).toLocaleString(intlLocale());

export default function ExpenseTagTotals({ byTag, totalToman = 0, activeTag = null, onSelect, hideValues = false }) {
  if (!byTag?.tags?.length) return null;
  const money = (v, currency = 'IRT') => (hideValues ? MASK : formatAmount(v, currency));
  const share = (v) => (totalToman > 0 ? Math.min(100, (v / totalToman) * 100) : 0);

  return (
    <div className="expense-side-card expense-tag-totals">
      <div className="expense-tag-totals-head">
        <span><Tags size={14} /> {t('برچسب‌ها')}</span>
        {activeTag && <button type="button" className="expense-tag-clear" onClick={() => onSelect(null)}>{t('همه')}</button>}
      </div>
      <ul>
        {byTag.tags.map((row) => (
          <li key={row.tag}>
            <button
              type="button"
              className={`expense-tag-row ${activeTag && activeTag.toLowerCase() === row.tag.toLowerCase() ? 'is-active' : ''}`}
              onClick={() => onSelect(activeTag && activeTag.toLowerCase() === row.tag.toLowerCase() ? null : row.tag)}
              aria-pressed={Boolean(activeTag && activeTag.toLowerCase() === row.tag.toLowerCase())}
            >
              <span className="expense-tag-name">#{row.tag}</span>
              <span className="expense-tag-count">{t('{n} مورد', { n: faNum(row.count) })}</span>
              <strong className="expense-tag-sum">{money(row.totalToman)} <small>{t('تومان')}</small></strong>
              <DollarValueLine value={row.dollar.counted ? row.dollar : null} hideValues={hideValues} />
              <span className="expense-tag-bar" aria-hidden="true"><i style={{ width: `${share(row.totalToman)}%` }} /></span>
            </button>
          </li>
        ))}
        {byTag.untagged.count > 0 && (
          <li className="expense-tag-untagged">
            <span>{t('بدون برچسب · {n} مورد', { n: faNum(byTag.untagged.count) })}</span>
            <strong>{money(byTag.untagged.totalToman)} <small>{t('تومان')}</small></strong>
            <DollarValueLine value={byTag.untagged.dollar.counted ? byTag.untagged.dollar : null} hideValues={hideValues} />
          </li>
        )}
      </ul>
    </div>
  );
}
