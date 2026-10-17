/**
 * SalaryMonthBar.jsx — «ماه حقوقی» beside the month switcher (PeriodSwitcher's `extra`) of the expenses and incomes pages:
 * a switch between the salary's months and the calendar's, and «روزهای حقوق»: the list of the
 * marked days on a calendar (shared/ui/MonthCalendar): a tap on a day marks it, a tap on a marked
 * day removes it
 */

import React, { useState } from 'react';
import { Wallet } from 'lucide-react';
import { FilterPills, IconButton, Modal, MonthCalendar } from '../ui/index.js';
import { useFeedback } from '../ui/FeedbackProvider.jsx';
import { shamsiMonthOf } from '../../utils/expenseDocument.js';
import { formatShamsiDisplay } from '../../features/portfolio/components/ShamsiDatePicker.jsx';
import { todayIso } from '../utils/dates.js';
import { t } from '../../utils/i18n.js';

const VIEWS = [
  { value: 'salary', label: t('حقوقی') },
  { value: 'calendar', label: t('تقویمی') },
];

/**
 * @param {{ salary: ReturnType<import('../salary/useSalaryMonths.js').useSalaryMonths>,
 *   disabled?: boolean }} props disabled: a read-only demo
 */
export default function SalaryMonthBar({ salary, disabled = false }) {
  const { toast } = useFeedback();
  const today = todayIso();
  const [open, setOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => shamsiMonthOf(today));
  const [busy, setBusy] = useState(false);

  const toggleDay = async (iso) => {
    setBusy(true);
    try {
      if (salary.starts.includes(iso)) {
        await salary.remove(iso);
      } else {
        await salary.add(iso);
        salary.setView('salary');
      }
    } catch (err) {
      toast.error(err?.message || t('ذخیره نشد.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="salary-month-controls">
      <FilterPills variant="segmented" size="sm" options={VIEWS} activeValue={salary.view} onChange={salary.setView} />
      <IconButton icon={<Wallet size={16} />} label={t('روزهای حقوق')} onClick={() => setOpen(true)} />
      <Modal isOpen={open} onClose={() => setOpen(false)} title={t('روزهای دریافت حقوق')} subtitle={t('روی روزی که حقوق گرفتی بزن تا ماه از آن روز شروع شود؛ دوباره بزنی برداشته می‌شود. ماهی که روزی ندارد از اول تقویمی‌اش شروع می‌شود.')}>
        <MonthCalendar
          month={calendarMonth}
          onMonthChange={setCalendarMonth}
          marked={salary.starts}
          today={today}
          onDayClick={toggleDay}
          disabled={disabled || busy}
          label={(iso) => formatShamsiDisplay(`${iso}T00:00:00`)}
        />
      </Modal>
    </div>
  );
}
