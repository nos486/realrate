import React, { useState, useRef } from 'react';
import { Calendar } from 'lucide-react';

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
  } catch (e) {
    return '';
  }
}

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
  } catch (e) {
    return dateStr;
  }
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

export default function ShamsiDatePicker({ value = '', onChange, label = 'تاریخ خرید', className = '' }) {
  const [showPicker, setShowPicker] = useState(false);
  const nativeDateRef = useRef(null);

  const handleSetToday = () => {
    onChange?.(getTodayShamsi());
  };

  const handleDatePartChange = (part, val) => {
    const current = parseShamsiDate(value);
    const updated = { ...current, [part]: val };
    onChange?.(`${updated.year}/${updated.month}/${updated.day}`);
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
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
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
              onChange?.(gregorianToShamsi(e.target.value));
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
