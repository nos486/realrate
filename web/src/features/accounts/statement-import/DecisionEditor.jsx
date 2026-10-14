/**
 * DecisionEditor.jsx — What a row (or a whole group of rows) of the statement becomes: an expense
 * or an income in a category with a title, a transfer to or from another of the user's accounts,
 * or nothing. Used for a group's question and for one row in the review.
 */

import React from 'react';
import { FilterPills } from '../../../shared/ui/index.js';
import { accountLabel } from '../constants/accountDisplay.js';
import { sideOf } from './statementFormat.js';
import { t } from '../../../utils/i18n.js';

/**
 * @param {{ direction: 'debit'|'credit', value: { action: string, category?: string, title?: string, accountId?: string },
 *   onChange: (value: object) => void, accounts: object[], categories: { expense: object[], income: object[] },
 *   titlePlaceholder?: string, id: string }} props
 */
export default function DecisionEditor({ direction, value, onChange, accounts, categories, titlePlaceholder = t('عنوان (اختیاری)'), id }) {
  const side = sideOf(direction);
  const own = side; // 'expense' | 'income'
  const actions = [
    { value: own, label: side === 'expense' ? t('هزینه') : t('درآمد') },
    ...(accounts.length ? [{ value: 'transfer', label: direction === 'debit' ? t('انتقال به حساب خودم') : t('انتقال از حساب خودم') }] : []),
    { value: 'skip', label: t('نادیده بگیر') },
  ];
  const list = categories[side];
  const category = value.category && list.some((c) => c.value === value.category) ? value.category : (list.find((c) => c.value === 'other') || list[0])?.value;
  const set = (patch) => onChange({ ...value, ...patch });

  return (
    <div className="statement-decision">
      <FilterPills
        options={actions}
        activeValue={value.action}
        onChange={(action) => set({ action, ...(action === own && !value.category ? { category } : {}) })}
        variant="segmented"
        size="sm"
      />
      {value.action === own && (
        <div className="statement-decision-fields">
          <label className="statement-field" htmlFor={`${id}-category`}>
            <span>{t('دسته')}</span>
            <select id={`${id}-category`} className="statement-select" value={category} onChange={(e) => set({ category: e.target.value })}>
              {list.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
          <label className="statement-field" htmlFor={`${id}-title`}>
            <span>{t('عنوان')}</span>
            <input
              id={`${id}-title`}
              className="statement-input"
              value={value.title || ''}
              maxLength={120}
              placeholder={titlePlaceholder}
              onChange={(e) => set({ title: e.target.value })}
            />
          </label>
        </div>
      )}
      {value.action === 'transfer' && (
        <div className="statement-decision-fields">
          <label className="statement-field" htmlFor={`${id}-account`}>
            <span>{direction === 'debit' ? t('به حساب') : t('از حساب')}</span>
            <select id={`${id}-account`} className="statement-select" value={value.accountId || ''} onChange={(e) => set({ accountId: e.target.value })}>
              <option value="">{t('انتخاب کنید')}</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
