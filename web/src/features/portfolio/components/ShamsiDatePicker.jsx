import React, { useState, useRef } from 'react';
import { Calendar } from 'lucide-react';
import { toPersianDigits } from '../../../shared/utils/formatters.js';

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
    const date = new Date(dateStr);
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

export default function ShamsiDatePicker({
  value = '',
  onChange,
  onChangeIso,
  onTodayClick,
  label = 'تاریخ خرید',
  className = ''
}) {
  const [showPicker, setShowPicker] = useState(false);
  const nativeDateRef = useRef(null);

  // If value passed is an ISO date (e.g. 2026-09-21), format to Shamsi for display
  const displayShamsi = value && value.includes('-') ? gregorianToShamsi(value) : value;

  const handleSetToday = () => {
    const todayShamsi = getTodayShamsi();
    const todayIso = new Date().toISOString().split('T')[0];
    onChange?.(todayShamsi);
    onChangeIso?.(todayIso);
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

  return (
    <div className={`form-item date-picker-field ${className}`.trim()}>
      <div className="label-with-action">
        <label>{label}</label>
        <button
          type="button"
          className="btn-set-today"
          onClick={handleSetToday}
          title="تنظیم تاریخ امروز"
        >
          ⚡ امروز
        </button>
      </div>
      <div className="date-input-wrap">
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
              const iso = e.target.value;
              onChange?.(gregorianToShamsi(iso));
              onChangeIso?.(iso);
            }
          }}
        />
      </div>

      {/* Shamsi Date Selector Popover Box */}
      {showPicker && (
        <div className="shamsi-date-selector-box">
          <div className="date-selector-row">
            {/* Day Select */}
            <div className="date-select-col">
              <span className="select-col-label">روز:</span>
              <select
                value={parseShamsiDate(value).day}
                onChange={(e) => handleDatePartChange('day', e.target.value)}
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
                value={parseShamsiDate(value).month}
                onChange={(e) => handleDatePartChange('month', e.target.value)}
                className="form-select date-part-select"
              >
                {PERSIAN_MONTHS.map((m) => (
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
                value={parseShamsiDate(value).year}
                onChange={(e) => handleDatePartChange('year', e.target.value)}
                className="form-select date-part-select"
              >
                {YEARS_LIST.map((y) => (
                  <option key={y} value={y}>
                    {Number(y).toLocaleString('fa-IR')}
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
