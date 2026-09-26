/**
 * RecurringIncomesCard.jsx — The user's fixed incomes: next date, pause / resume, edit, delete
 *
 * Shown inside the income form while «درآمد ثابت» is chosen (no add button there: the form itself
 * adds one).
 */

import React, { useState } from 'react';
import { Repeat, Plus, Pause, Play, Pencil, Trash2 } from 'lucide-react';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { formatNum } from '../../portfolio/utils/holdingHelpers.js';
import { intervalLabel, nextOccurrence } from '../../../utils/recurringIncome.js';
import { todayIso } from '../../../shared/utils/dates.js';
import { getIncomeCategory } from '../constants/incomeCategories.js';

export default function RecurringIncomesCard({ rules, onAdd = null, onEdit, onToggle, onDelete, hideValues = false, title = 'درآمدهای ثابت' }) {
  const [busyId, setBusyId] = useState(null);
  const today = todayIso();

  const run = (rule, fn) => async () => {
    setBusyId(rule.id);
    try {
      await fn(rule);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="recurring-card" aria-labelledby="recurring-card-title">
      <div className="recurring-card-head">
        <h3 id="recurring-card-title">
          <Repeat size={15} />
          {title}
        </h3>
        {onAdd && (
          <button type="button" className="recurring-add-btn" onClick={onAdd}>
            <Plus size={14} />
            <span>افزودن</span>
          </button>
        )}
      </div>

      {rules.length === 0 ? (
        <p className="recurring-empty">
          حقوق، اجاره یا هر درآمد تکراری را یک بار ثبت کنید تا هر دوره خودکار به لیست اضافه شود.
        </p>
      ) : (
        <ul className="recurring-list">
          {rules.map((rule) => {
            const next = nextOccurrence(rule, today);
            const { Icon, color } = getIncomeCategory(rule.category);
            const busy = busyId === rule.id;
            return (
              <li key={rule.id} className={`recurring-row ${rule.active ? '' : 'is-paused'}`}>
                <span className="recurring-icon" style={{ '--income-cat-color': color }} aria-hidden="true">
                  <Icon size={14} />
                </span>
                <div className="recurring-main">
                  <div className="recurring-top">
                    <strong className="recurring-title">{rule.title}</strong>
                    <span className="recurring-amount">
                      {hideValues ? '****' : formatNum(rule.amount)} <small>تومان</small>
                    </span>
                  </div>
                  <span className="recurring-meta">
                    {intervalLabel(rule.intervalMonths)}، روز {rule.dayOfMonth.toLocaleString('fa-IR')}
                    {' — '}
                    {rule.active
                      ? next ? `بعدی: ${formatShamsiDisplay(`${next}T00:00:00`)}` : 'پایان یافته'
                      : 'متوقف'}
                  </span>
                </div>
                <div className="recurring-actions">
                  <button
                    type="button"
                    className="btn-table-action"
                    onClick={run(rule, onToggle)}
                    disabled={busy}
                    title={rule.active ? 'توقف' : 'ادامه'}
                    aria-label={`${rule.active ? 'توقف' : 'ادامه'} ${rule.title}`}
                  >
                    {rule.active ? <Pause size={13} /> : <Play size={13} />}
                  </button>
                  <button type="button" className="btn-table-action edit" onClick={() => onEdit(rule)} disabled={busy} title="ویرایش" aria-label={`ویرایش ${rule.title}`}>
                    <Pencil size={13} />
                  </button>
                  <button type="button" className="btn-table-action delete" onClick={run(rule, onDelete)} disabled={busy} title="حذف" aria-label={`حذف ${rule.title}`}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
