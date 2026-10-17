/**
 * SalaryMonthBar.jsx — «ماه حقوقی» under the period switcher of the expenses and incomes pages:
 * a switch between the salary's months and the calendar's, «حقوق گرفتم» (the salary arrived
 * today: the month starts now), and the list of the marked days, where past months get theirs by
 * picking the day from the calendar
 */

import React, { useState } from 'react';
import { Wallet, Trash2 } from 'lucide-react';
import { Button, FilterPills, Modal } from '../ui/index.js';
import { useFeedback } from '../ui/FeedbackProvider.jsx';
import DateField from '../form/DateField.jsx';
import { getTodayShamsi, formatShamsiDisplay, shamsiToGregorian } from '../../features/portfolio/components/ShamsiDatePicker.jsx';
import { todayIso } from '../utils/dates.js';
import { t } from '../../utils/i18n.js';

const VIEWS = [
  { value: 'salary', label: t('ماه حقوقی') },
  { value: 'calendar', label: t('ماه تقویمی') },
];

/**
 * @param {{ salary: ReturnType<import('../salary/useSalaryMonths.js').useSalaryMonths>,
 *   disabled?: boolean }} props disabled: a read-only demo
 */
export default function SalaryMonthBar({ salary, disabled = false }) {
  const { toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(getTodayShamsi());
  const [busy, setBusy] = useState(false);

  const run = async (action, message) => {
    setBusy(true);
    try {
      await action();
      if (message) toast.success(message);
    } catch (err) {
      toast.error(err?.message || t('ذخیره نشد.'));
    } finally {
      setBusy(false);
    }
  };

  const received = () => run(async () => {
    await salary.add(todayIso());
    salary.setView('salary');
  }, t('ماه حقوقی از امروز شروع شد.'));
  const addPicked = () => {
    const iso = shamsiToGregorian(day);
    if (!iso) return;
    run(() => salary.add(iso), t('روز حقوق ثبت شد.'));
  };

  return (
    <div className="flow-period-bar salary-month-bar">
      <FilterPills variant="segmented" size="sm" options={VIEWS} activeValue={salary.view} onChange={salary.setView} />
      <div className="flow-period-nav">
        <Button size="sm" icon={<Wallet size={14} />} onClick={received} disabled={disabled || busy}>{t('حقوق گرفتم')}</Button>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>{t('روزهای حقوق')}</Button>
      </div>
      <Modal isOpen={open} onClose={() => setOpen(false)} title={t('روزهای دریافت حقوق')} subtitle={t('هر ماه از روز دریافت حقوق شروع می‌شود؛ ماهی که روزی ندارد از اول تقویمی‌اش.')}>
        <DateField label={t('روز دریافت حقوق')} value={day} onChange={setDay} />
        <Button size="sm" onClick={addPicked} disabled={disabled || busy}>{t('افزودن')}</Button>
        <ul className="salary-month-list">
          {salary.starts.map((iso) => (
            <li key={iso}>
              <span>{formatShamsiDisplay(`${iso}T00:00:00`)}</span>
              <Button size="sm" variant="secondary" icon={<Trash2 size={14} />} aria-label={t('حذف')} disabled={disabled || busy} onClick={() => run(() => salary.remove(iso))} />
            </li>
          ))}
          {!salary.starts.length && <li className="salary-month-empty">{t('هنوز روزی ثبت نشده.')}</li>}
        </ul>
      </Modal>
    </div>
  );
}
