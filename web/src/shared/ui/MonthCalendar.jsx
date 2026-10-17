/**
 * MonthCalendar.jsx — A Shamsi month as a calendar grid (weeks start on Saturday), with the days
 * the caller marks shown highlighted and a tap on a day handed back as its Gregorian date
 *
 * Generic: the salary days use it, and any other "pick or show days of a month" screen can.
 */

import React, { useMemo } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import IconButton from './IconButton.jsx';
import { shamsiMonthRange, shiftShamsiMonth } from '../../utils/expenseDocument.js';
import { formatShamsiMonth } from '../flow/flowYear.js';
import { intlLocale, t } from '../../utils/i18n.js';

/** Column titles, Saturday first */
const WEEKDAYS = [t('ش'), t('ی'), t('د'), t('س'), t('چ'), t('پ'), t('ج')];
const DAY_MS = 86_400_000;

const dayLabel = (n) => n.toLocaleString(intlLocale(), { useGrouping: false });

/**
 * @param {{ month: { jy: number, jm: number }, onMonthChange: (month: object) => void,
 *   marked?: Iterable<string>, today?: string, onDayClick?: (isoDay: string) => void,
 *   disabled?: boolean, label?: (isoDay: string) => string }} props
 *   marked: Gregorian YYYY-MM-DD days to highlight; today: the day to outline
 */
export default function MonthCalendar({ month, onMonthChange, marked = [], today = '', onDayClick = null, disabled = false, label = null }) {
  const markedSet = useMemo(() => new Set(marked), [marked]);
  const { from, days } = useMemo(() => shamsiMonthRange(month.jy, month.jm), [month.jy, month.jm]);
  // Saturday is column 0 (Date's Sunday is 0, Saturday 6)
  const offset = (new Date(`${from}T00:00:00Z`).getUTCDay() + 1) % 7;
  const cells = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => i)];
  const isoAt = (i) => new Date(Date.parse(from) + i * DAY_MS).toISOString().slice(0, 10);

  return (
    <div className="month-calendar">
      <div className="month-calendar-head">
        <IconButton icon={<ChevronRight size={16} />} label={t('ماه قبل')} onClick={() => onMonthChange(shiftShamsiMonth(month, -1))} />
        <strong>{formatShamsiMonth(month.jy, month.jm)}</strong>
        <IconButton icon={<ChevronLeft size={16} />} label={t('ماه بعد')} onClick={() => onMonthChange(shiftShamsiMonth(month, 1))} />
      </div>
      <div className="month-calendar-grid" role="grid">
        {WEEKDAYS.map((w) => <span key={w} className="month-calendar-weekday">{w}</span>)}
        {cells.map((i, slot) => {
          if (i === null) return <span key={`blank-${slot}`} />;
          const iso = isoAt(i);
          const isMarked = markedSet.has(iso);
          return (
            <button
              key={iso}
              type="button"
              className={`month-calendar-day${isMarked ? ' is-marked' : ''}${iso === today ? ' is-today' : ''}`}
              aria-pressed={isMarked}
              aria-label={label ? label(iso) : iso}
              disabled={disabled || !onDayClick}
              onClick={() => onDayClick?.(iso)}
            >
              {dayLabel(i + 1)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
