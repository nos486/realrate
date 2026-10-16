/**
 * GoalForm.jsx — Modal to add or edit a goal: what it is for (an icon), how much it needs (in
 * tomans, dollars…) and an optional day to reach it by (utils/goalDocument.js). Editing also lists
 * what the goal holds — deposits and portfolio assets reserved for it — each removable.
 *
 * Laid out as an entry form (shared/form/): the amount first, the name, the icon as tiles, the
 * rarely needed — the day, the note, what it holds — folded under «جزئیات بیشتر».
 * Mounted only while open, so its state starts from props.
 */

import React, { useState } from 'react';
import { Target, X } from 'lucide-react';
import { t } from '../../../utils/i18n.js';
import { AlertBanner, Input, Modal } from '../../../shared/ui/index.js';
import { AmountField, CategoryGrid, EntryFormActions, MoreDetails } from '../../../shared/form/index.js';
import ShamsiDatePicker, { gregorianToShamsi, shamsiToGregorian } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { GOAL_ICONS, GOAL_LIMITS } from '../../../utils/goalDocument.js';
import { normalizeCurrency } from '../../../utils/currencies.js';
import { formatGoalAmount, goalIcon, goalNumber, shamsiDay } from '../constants/goalDisplay.js';

const ICON_OPTIONS = GOAL_ICONS.map(({ value, label }) => ({ value, label: t(label), Icon: goalIcon(value) }));
const amountOf = (v) => Number(String(v || '').replace(/[^\d.]/g, '')) || 0;
const shamsiOf = (iso) => (iso ? gregorianToShamsi(`${iso}T00:00:00`) : '');

/**
 * @param {{ goal?: object|null, onSubmit: (input: object) => Promise<unknown>, onClose: () => void, submitting?: boolean }} props
 */
export default function GoalForm({ goal = null, onSubmit, onClose, submitting = false }) {
  const g = goal;
  const [name, setName] = useState(g?.name || '');
  const [icon, setIcon] = useState(g?.icon || GOAL_ICONS[0].value);
  const [target, setTarget] = useState(g ? String(g.targetAmount) : '');
  const [dateShamsi, setDateShamsi] = useState(() => shamsiOf(g?.targetDate));
  const [currency, setCurrency] = useState(normalizeCurrency(g?.currency));
  const [notes, setNotes] = useState(g?.notes || '');
  const [deposits, setDeposits] = useState(g?.deposits || []);
  const [allocations, setAllocations] = useState(g?.allocations || []);
  const [error, setError] = useState('');

  const targetNum = amountOf(target);
  const isValid = Boolean(name.trim()) && targetNum > 0 && !submitting;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!isValid) return;
    setError('');
    try {
      await onSubmit({
        name: name.trim(),
        icon,
        currency,
        targetAmount: targetNum,
        targetDate: shamsiToGregorian(dateShamsi) || '',
        notes: notes.trim(),
        deposits,
        allocations,
      });
      onClose();
    } catch (err) {
      setError(err.message || t('ذخیره‌ی هدف ممکن نشد.'));
    }
  };

  const detailsFilled = [
    ...(dateShamsi ? [t('موعد')] : []),
    ...(deposits.length + allocations.length > 0 ? [t('واریزها')] : []),
    ...(notes.trim() ? [t('یادداشت')] : []),
  ];

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={g ? t('ویرایش هدف') : t('هدف جدید')}
      subtitle={t('مبلغ هدف و پیشرفت پس‌اندازتان')}
      icon={<Target size={18} />}
      maxWidth="560px"
      onSubmit={handleSubmit}
      footer={(
        <EntryFormActions
          submitLabel={g ? t('ذخیره تغییرات') : t('افزودن هدف')}
          valid={isValid}
          submitting={submitting}
          onCancel={onClose}
        />
      )}
    >
      <div className="entry-form-body">
        {error && <AlertBanner type="error" message={error} />}

        <AmountField id="goal-target" label={t('مبلغ هدف')} value={target} onValueChange={setTarget} currency={currency} onCurrencyChange={setCurrency} autoFocus={!g} />

        <Input id="goal-name" label={t('نام هدف *')} placeholder={t('مثلاً: پیش‌پرداخت خانه، سفر، خرید ماشین')} value={name}
          onChange={(e) => setName(e.target.value)} maxLength={GOAL_LIMITS.nameLength} required />

        <CategoryGrid kind="goal" label={t('نوع')} options={ICON_OPTIONS} value={icon} onChange={setIcon} />

        <MoreDetails filled={detailsFilled}>
          <div className="entry-form-section">
            <ShamsiDatePicker label={t('می‌خواهم تا این روز برسم')} value={dateShamsi} onChange={setDateShamsi} />
            <p className="expense-form-hint">{t('با تاریخ، می‌گوییم ماهی چقدر باید کنار بگذارید و آیا با روند فعلی می‌رسید.')}</p>
          </div>
          <Input id="goal-notes" as="textarea" label={t('یادداشت')} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={GOAL_LIMITS.notesLength} rows={2} />
          {deposits.length + allocations.length > 0 && (
            <div className="ui-input-group">
              <span className="ui-input-label">{t('واریزها')}</span>
              <ul className="goal-deposit-list">
                {allocations.map((a) => (
                  <li key={a.id} className="goal-deposit-row">
                    <span className="goal-deposit-date">{shamsiDay(a.date)}</span>
                    <strong>{a.assetName || a.assetId}</strong>
                    <small>{a.mode === 'percent' ? t('{n}٪ از دارایی', { n: goalNumber(a.value) }) : `${goalNumber(a.value)} ${a.unit}`}</small>
                    <button type="button" className="goal-deposit-remove" aria-label={t('حذف واریز')} title={t('حذف واریز')}
                      onClick={() => setAllocations((list) => list.filter((x) => x.id !== a.id))}>
                      <X size={14} />
                    </button>
                  </li>
                ))}
                {[...deposits].reverse().map((d) => (
                  <li key={d.id} className="goal-deposit-row">
                    <span className="goal-deposit-date">{shamsiDay(d.date)}</span>
                    <strong className={d.amount < 0 ? 'is-negative' : ''}>{formatGoalAmount(d.amount, d.currency)}</strong>
                    {d.note && <small>{d.note}</small>}
                    <button type="button" className="goal-deposit-remove" aria-label={t('حذف واریز')} title={t('حذف واریز')}
                      onClick={() => setDeposits((list) => list.filter((x) => x.id !== d.id))}>
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </MoreDetails>
      </div>
    </Modal>
  );
}
