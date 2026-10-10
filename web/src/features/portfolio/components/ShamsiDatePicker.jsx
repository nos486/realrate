/**
 * ShamsiDatePicker.jsx — The app's date field, plus the Shamsi ⇄ Gregorian date helpers
 *
 * The field is picked in Shamsi by default; a «شمسی / میلادی» switch in every picker lets the
 * user type and pick the date in Gregorian instead (one remembered choice for all pickers,
 * shared/calendar/calendarMode.js). Whichever calendar is shown, the field reports the same
 * values to its form: a Shamsi `YYYY/MM/DD` through onChange and the ISO date through
 * onChangeIso, so no caller depends on the calendar the user picked in.
 */
import React, { useState, useRef } from 'react';
import { Calendar } from 'lucide-react';
import { toPersianDigits } from '../../../shared/utils/formatters.js';
import { todayIso } from '../../../shared/utils/dates.js';
import { useBackToClose } from '../../../shared/hooks/useBackToClose.js';
import FilterPills from '../../../shared/ui/FilterPills.jsx';
import {
  CALENDAR_GREGORIAN,
  CALENDAR_OPTIONS,
  useCalendarMode,
} from '../../../shared/calendar/calendarMode.js';

export const PERSIAN_MONTHS = [
  { value: '01', label: 'فروردین' },
  { value: '02', label: 'اردیبهشت' },
  { value: '03', label: 'خرداد' },
  { value: '04', label: 'تیر' },
  { value: '05', label: 'مرداد' },
  { value: '06', label: 'شهریور' },
  { value: '07', label: 'مهر' },
  { value: '08', label: 'آبان' },
  { value: '09', label: 'آذر' },
  { value: '10', label: 'دی' },
  { value: '11', label: 'بهمن' },
  { value: '12', label: 'اسفند' }
];

export const YEARS_LIST = Array.from({ length: 18 }, (_, i) => String(1390 + i)).reverse();
export const DAYS_LIST = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));

/** Gregorian month names as written in Persian, for the picker's Gregorian mode */
export const GREGORIAN_MONTHS = [
  { value: '01', label: 'ژانویه' },
  { value: '02', label: 'فوریه' },
  { value: '03', label: 'مارس' },
  { value: '04', label: 'آوریل' },
  { value: '05', label: 'مه' },
  { value: '06', label: 'ژوئن' },
  { value: '07', label: 'ژوئیه' },
  { value: '08', label: 'اوت' },
  { value: '09', label: 'سپتامبر' },
  { value: '10', label: 'اکتبر' },
  { value: '11', label: 'نوامبر' },
  { value: '12', label: 'دسامبر' }
];

/** The Gregorian years matching YEARS_LIST (1390–1407 ≈ 2011–2029), newest first */
export const GREGORIAN_YEARS_LIST = Array.from({ length: 19 }, (_, i) => String(2011 + i)).reverse();

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days in a Gregorian month (month 1–12) */
function gregorianMonthDays(year, month) {
  return new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
}

/** Persian (۰–۹) and Arabic (٠–٩) digits to ASCII, so a typed date parses either way */
function toLatinDigits(str) {
  return String(str ?? '')
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/**
 * Read a typed Gregorian date — `2026/10/10`, `2026-10-10`, `2026/1/5`, Persian digits too —
 * into an ISO date, or '' when it is not a whole, real date yet.
 * @param {string} text
 * @returns {string} 'YYYY-MM-DD' or ''
 */
export function parseGregorianInput(text) {
  const match = toLatinDigits(text).trim().match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (!match) return '';
  const [, year, month, day] = match;
  const m = Number(month);
  const d = Number(day);
  if (m < 1 || m > 12 || d < 1 || d > gregorianMonthDays(year, m)) return '';
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** An ISO date as the picker shows it in Gregorian mode: `2026/10/10` */
export function formatGregorianInput(iso) {
  return ISO_DATE.test(iso || '') ? iso.replace(/-/g, '/') : '';
}

export function getTodayShamsi() {
  try {
    const formatter = new Intl.DateTimeFormat('fa-IR-u-nu-latn', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(new Date());
  } catch {
    return '';
  }
}

// Latin digits on purpose — this string round-trips through shamsiToGregorian/parseShamsiDate
// (raw .split('/') + parseInt) and feeds ShamsiDatePicker's own editable input, both of which
// only understand ASCII digits. Never switch this to Persian digits; use formatShamsiDisplay
// below wherever a Shamsi date is only ever being displayed, not parsed or re-typed.
export function gregorianToShamsi(dateStr) {
  try {
    if (!dateStr) return '';
    // A bare ISO day is a calendar day, not UTC midnight: read it at local noon so a time zone
    // behind UTC does not turn it into the day before
    const day = ISO_DATE.exec(dateStr);
    const date = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), 12) : new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    const formatter = new Intl.DateTimeFormat('fa-IR-u-nu-latn', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(date);
  } catch {
    return dateStr;
  }
}

/** Display-only: same as gregorianToShamsi but with Persian digits, for read-only UI text. */
export function formatShamsiDisplay(dateStr) {
  return toPersianDigits(gregorianToShamsi(dateStr));
}

export function jalaliToGregorian(jY, jM, jD) {
  jY = parseInt(jY, 10);
  jM = parseInt(jM, 10);
  jD = parseInt(jD, 10);
  if (isNaN(jY) || isNaN(jM) || isNaN(jD)) return '';

  let jy = jY - 979;
  let jm = jM - 1;
  let jd = jD - 1;

  let j_day_no = 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4);
  for (let i = 0; i < jm; ++i) {
    j_day_no += i < 6 ? 31 : 30;
  }
  j_day_no += jd;

  let g_day_no = j_day_no + 79;

  let gy = 1600 + 400 * Math.floor(g_day_no / 146097);
  g_day_no = g_day_no % 146097;

  let leap = true;
  if (g_day_no >= 36525) {
    g_day_no--;
    gy += 100 * Math.floor(g_day_no / 36524);
    g_day_no = g_day_no % 36524;
    if (g_day_no >= 365) {
      g_day_no++;
    } else {
      leap = false;
    }
  }

  gy += 4 * Math.floor(g_day_no / 1461);
  g_day_no %= 1461;

  if (g_day_no >= 366) {
    leap = false;
    g_day_no--;
    gy += Math.floor(g_day_no / 365);
    g_day_no = g_day_no % 365;
  }

  let gd = g_day_no + 1;
  let gm = 0;
  const g_days_in_month = [31, (leap ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  for (let i = 0; i < 12; i++) {
    if (gd > g_days_in_month[i]) {
      gd -= g_days_in_month[i];
    } else {
      gm = i + 1;
      break;
    }
  }

  const gyStr = String(gy).padStart(4, '0');
  const gmStr = String(gm).padStart(2, '0');
  const gdStr = String(gd).padStart(2, '0');
  return `${gyStr}-${gmStr}-${gdStr}`;
}

export function shamsiToGregorian(shamsiStr) {
  if (!shamsiStr) return '';
  const parts = String(shamsiStr).split('/');
  if (parts.length === 3) {
    return jalaliToGregorian(parts[0], parts[1], parts[2]);
  }
  return '';
}

export function parseShamsiDate(str) {
  const parts = (str || '').split('/');
  if (parts.length === 3 && parts[0].length === 4) {
    return {
      year: parts[0].trim(),
      month: parts[1].trim().padStart(2, '0'),
      day: parts[2].trim().padStart(2, '0')
    };
  }
  const todayParts = getTodayShamsi().split('/');
  return {
    year: todayParts[0] || '1405',
    month: todayParts[1] || '01',
    day: todayParts[2] || '01'
  };
}

/**
 * The app's date field: typed or picked from day/month/year lists, in Shamsi or — after the
 * user switches it — in Gregorian.
 * @param {object} props
 * @param {string} [props.value] Shamsi `YYYY/MM/DD` (or an ISO date)
 * @param {(shamsi: string) => void} [props.onChange] the date as Shamsi `YYYY/MM/DD`
 * @param {(iso: string) => void} [props.onChangeIso] the date as ISO `YYYY-MM-DD`, once whole
 * @param {(shamsi: string) => void} [props.onTodayClick]
 * @param {string} [props.label]
 * @param {string} [props.className]
 */
export default function ShamsiDatePicker({
  value = '',
  onChange,
  onChangeIso,
  onTodayClick,
  label = 'تاریخ خرید',
  className = ''
}) {
  const [showPicker, setShowPicker] = useState(false);
  useBackToClose(showPicker, () => setShowPicker(false));
  const nativeDateRef = useRef(null);
  const [calendar, setCalendar] = useCalendarMode();
  const gregorian = calendar === CALENDAR_GREGORIAN;
  // What the user is typing in Gregorian mode, until it is a whole date (the form only ever
  // holds Shamsi, which a half-typed Gregorian date cannot be turned into)
  const [gregorianDraft, setGregorianDraft] = useState(null);

  // If value passed is an ISO date (e.g. 2026-09-21), format to Shamsi for display
  const displayShamsi = value && value.includes('-') ? gregorianToShamsi(value) : value;
  const valueIso = value && value.includes('-') ? value : shamsiToGregorian(value);

  /** Report a picked day to the form, in both shapes */
  const emitIso = (iso) => {
    onChange?.(gregorianToShamsi(iso));
    onChangeIso?.(iso);
  };

  const handleSetToday = () => {
    const todayShamsi = getTodayShamsi();
    setGregorianDraft(null);
    onChange?.(todayShamsi);
    onChangeIso?.(todayIso());
    onTodayClick?.(todayShamsi);
  };

  const handleDatePartChange = (part, val) => {
    const current = parseShamsiDate(displayShamsi);
    const updated = { ...current, [part]: val };
    const shamsiStr = `${updated.year}/${updated.month}/${updated.day}`;
    onChange?.(shamsiStr);
    const isoStr = shamsiToGregorian(shamsiStr);
    if (isoStr) onChangeIso?.(isoStr);
  };

  // Gregorian mode: the picked day's parts (today's when nothing whole is picked yet)
  const gregorianParts = (() => {
    const [year, month, day] = (ISO_DATE.test(valueIso || '') ? valueIso : todayIso()).split('-');
    return { year, month, day };
  })();

  const handleGregorianPartChange = (part, val) => {
    const updated = { ...gregorianParts, [part]: val };
    const maxDay = gregorianMonthDays(updated.year, updated.month);
    const day = String(Math.min(Number(updated.day), maxDay)).padStart(2, '0');
    setGregorianDraft(null);
    emitIso(`${updated.year}-${updated.month}-${day}`);
  };

  const changeCalendar = (mode) => {
    setGregorianDraft(null);
    setCalendar(mode);
  };

  const shamsiParts = parseShamsiDate(displayShamsi);
  const dayValue = gregorian ? gregorianParts.day : shamsiParts.day;
  const monthValue = gregorian ? gregorianParts.month : shamsiParts.month;
  const yearValue = gregorian ? gregorianParts.year : shamsiParts.year;
  const months = gregorian ? GREGORIAN_MONTHS : PERSIAN_MONTHS;
  const years = gregorian ? GREGORIAN_YEARS_LIST : YEARS_LIST;
  const listedYears = years.includes(yearValue) ? years : [yearValue, ...years];

  return (
    <div className={`form-item date-picker-field ${className}`.trim()}>
      <div className="label-with-action">
        <label>{label}</label>
        <div className="date-picker-actions">
          <FilterPills
            options={CALENDAR_OPTIONS}
            activeValue={calendar}
            onChange={changeCalendar}
            variant="segmented"
            size="sm"
            className="calendar-mode-toggle"
          />
          <button
            type="button"
            className="btn-set-today"
            onClick={handleSetToday}
            title="تنظیم تاریخ امروز"
          >
            ⚡ امروز
          </button>
        </div>
      </div>
      <div className="date-input-wrap">
        {gregorian ? (
          <input
            type="text"
            dir="ltr"
            inputMode="numeric"
            placeholder="مثلاً 2026/10/10"
            value={gregorianDraft ?? formatGregorianInput(valueIso)}
            onChange={(e) => {
              const val = e.target.value;
              setGregorianDraft(val);
              const iso = parseGregorianInput(val);
              if (iso) emitIso(iso);
            }}
            onBlur={() => setGregorianDraft(null)}
            className="form-input date-text-input"
          />
        ) : (
          <input
            type="text"
            placeholder="مثلاً ۱۴۰۳/۱۱/۲۰ یا آبان ۱۴۰۳"
            value={displayShamsi}
            onChange={(e) => {
              const val = e.target.value;
              onChange?.(val);
              const iso = shamsiToGregorian(val);
              if (iso) onChangeIso?.(iso);
            }}
            className="form-input date-text-input"
          />
        )}
        <button
          type="button"
          className={`btn-toggle-datepicker ${showPicker ? 'active' : ''}`}
          onClick={() => setShowPicker((prev) => !prev)}
          title="انتخاب از تقویم"
        >
          <Calendar size={15} />
        </button>
        {/* Hidden native system date picker */}
        <input
          type="date"
          ref={nativeDateRef}
          className="hidden-native-date-picker"
          onChange={(e) => {
            if (e.target.value) {
              setGregorianDraft(null);
              emitIso(e.target.value);
            }
          }}
        />
      </div>

      {/* Date Selector Popover Box — day/month/year in the chosen calendar */}
      {showPicker && (
        <div className="shamsi-date-selector-box">
          <div className="date-selector-row">
            {/* Day Select */}
            <div className="date-select-col">
              <span className="select-col-label">روز:</span>
              <select
                aria-label="روز"
                value={dayValue}
                onChange={(e) => (gregorian
                  ? handleGregorianPartChange('day', e.target.value)
                  : handleDatePartChange('day', e.target.value))}
                className="form-select date-part-select"
              >
                {DAYS_LIST.map((d) => (
                  <option key={d} value={d}>
                    {Number(d).toLocaleString('fa-IR')}
                  </option>
                ))}
              </select>
            </div>

            {/* Month Select */}
            <div className="date-select-col">
              <span className="select-col-label">ماه:</span>
              <select
                aria-label="ماه"
                value={monthValue}
                onChange={(e) => (gregorian
                  ? handleGregorianPartChange('month', e.target.value)
                  : handleDatePartChange('month', e.target.value))}
                className="form-select date-part-select"
              >
                {months.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Year Select */}
            <div className="date-select-col">
              <span className="select-col-label">سال:</span>
              <select
                aria-label="سال"
                value={yearValue}
                onChange={(e) => (gregorian
                  ? handleGregorianPartChange('year', e.target.value)
                  : handleDatePartChange('year', e.target.value))}
                className="form-select date-part-select"
              >
                {listedYears.map((y) => (
                  <option key={y} value={y}>
                    {Number(y).toLocaleString('fa-IR', { useGrouping: false })}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="date-selector-footer">
            <button
              type="button"
              className="btn-date-today-mini"
              onClick={handleSetToday}
            >
              امروز
            </button>
            <button
              type="button"
              className="btn-date-system-mini"
              onClick={() => {
                try {
                  if (nativeDateRef.current?.showPicker) {
                    nativeDateRef.current.showPicker();
                  } else {
                    nativeDateRef.current?.click();
                  }
                } catch {
                  nativeDateRef.current?.click();
                }
              }}
              title="تقویم سیستم"
            >
              تقویم
            </button>
            <button
              type="button"
              className="btn-date-done-mini"
              onClick={() => setShowPicker(false)}
            >
              تأیید
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
