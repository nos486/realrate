/**
 * PeriodSwitcher.jsx — «ماهانه / سالانه», and the Shamsi month or year shown (previous / next /
 * back to now), the same on the incomes and expenses pages
 */

import React from 'react';
import { ChevronRight, ChevronLeft, CalendarDays, CalendarRange } from 'lucide-react';
import { Button, FilterPills } from '../ui/index.js';
import { formatShamsiMonth, formatShamsiYear, monthIndex, shiftShamsiMonth } from './flowYear.js';

const MODES = [
  { value: 'month', label: 'ماهانه', icon: <CalendarDays size={14} /> },
  { value: 'year', label: 'سالانه', icon: <CalendarRange size={14} /> },
];

/**
 * @param {{ mode: 'month'|'year', month: { jy: number, jm: number }, thisMonth: { jy: number, jm: number },
 *   onModeChange: (mode: string) => void, onMonthChange: (month: object) => void }} props
 *   the year shown is `month.jy`; moving a year keeps the month (capped at this month)
 */
export default function PeriodSwitcher({ mode, month, thisMonth, onModeChange, onMonthChange }) {
  const yearly = mode === 'year';
  const atNow = yearly ? month.jy >= thisMonth.jy : monthIndex(month) >= monthIndex(thisMonth);
  const step = (delta) => {
    if (!yearly) return onMonthChange(shiftShamsiMonth(month, delta));
    const next = { jy: month.jy + delta, jm: month.jm };
    onMonthChange(monthIndex(next) > monthIndex(thisMonth) ? thisMonth : next);
  };
  return (
    <div className="flow-period-bar">
      <FilterPills options={MODES} activeValue={mode} onChange={onModeChange} size="sm" />
      <div className="flow-period-nav">
        <Button size="sm" variant="secondary" icon={<ChevronRight size={16} />} onClick={() => step(-1)} aria-label={yearly ? 'سال قبل' : 'ماه قبل'} />
        <strong className="flow-period-label">{yearly ? `سال ${formatShamsiYear(month.jy)}` : formatShamsiMonth(month.jy, month.jm)}</strong>
        <Button size="sm" variant="secondary" icon={<ChevronLeft size={16} />} onClick={() => step(1)} disabled={atNow} aria-label={yearly ? 'سال بعد' : 'ماه بعد'} />
        {!atNow && (
          <Button size="sm" variant="secondary" onClick={() => onMonthChange(thisMonth)}>
            {yearly ? 'امسال' : 'این ماه'}
          </Button>
        )}
      </div>
    </div>
  );
}
