/**
 * formatters.js — Shared UI formatting utilities for numbers, currencies, and inputs
 */

/**
 * Convert Persian and Arabic digits to standard ASCII digits (0-9)
 * @param {string|number} str
 * @returns {string}
 */
export function toEnglishDigits(str) {
  if (str === null || str === undefined || str === '') return '';
  const pers = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  const arab = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  let s = String(str);
  for (let i = 0; i < 10; i++) {
    s = s.replace(new RegExp(pers[i], 'g'), String(i));
    s = s.replace(new RegExp(arab[i], 'g'), String(i));
  }
  return s;
}

/**
 * Format a percentage value with Persian (fa-IR) digits and a fixed 1-decimal precision,
 * matching the convention already used for allocation percentages (e.g. "۱۲.۳٪"). Prefer this
 * over `.toFixed(1)` for any percentage shown directly in the UI, since `.toFixed` always
 * produces Latin digits — inconsistent with the fa-IR amounts typically shown right next to it.
 * @param {number} val
 * @returns {string} e.g. "12.3" (rendered with Persian digits)
 */
export function formatPct(val) {
  return Number(val || 0).toLocaleString('fa-IR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/**
 * Format a number or numeric string with 3-digit comma separators (e.g. 234,370 or 4,420.1)
 * @param {string|number} val - Input value
 * @param {boolean} [allowDecimals=false] - Whether to allow a decimal part
 * @returns {string} Comma-separated formatted string
 */
export function formatThousands(val, allowDecimals = false) {
  if (val === null || val === undefined || val === '') return '';
  const clean = toEnglishDigits(String(val)).replace(/,/g, '').trim();
  if (!clean) return '';

  if (allowDecimals) {
    const parts = clean.split('.');
    const intPart = parts[0].replace(/\D/g, '');
    const decPart = parts.length > 1 ? parts.slice(1).join('').replace(/\D/g, '') : null;
    const formattedInt = intPart
      ? parseInt(intPart, 10).toLocaleString('en-US')
      : (parts[0] === '' && decPart !== null ? '0' : '');

    if (decPart !== null) {
      return `${formattedInt}.${decPart}`;
    }
    return formattedInt;
  } else {
    const intPart = clean.replace(/\D/g, '');
    if (!intPart) return '';
    return parseInt(intPart, 10).toLocaleString('en-US');
  }
}

/**
 * Convert standard ASCII digits (0-9) to Persian digits (۰-۹), for read-only display text —
 * never use this on a value that will be typed into or re-parsed from an editable field (e.g.
 * ShamsiDatePicker's own input), since Persian digits break that round-trip.
 * @param {string|number} n
 * @returns {string}
 */
export function toPersianDigits(n) {
  if (n === null || n === undefined) return '';
  const pers = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return String(n).replace(/[0-9]/g, (w) => pers[+w]);
}

/** Short Persian amount, e.g. «۱٫۲ میلیارد» */
export function formatCompactAmount(value) {
  const v = Number(value || 0);
  const abs = Math.abs(v);
  const units = [
    [1e12, 'هزار میلیارد'],
    [1e9, 'میلیارد'],
    [1e6, 'میلیون'],
  ];
  for (const [size, label] of units) {
    if (abs >= size) {
      const n = v / size;
      return `${n.toLocaleString('fa-IR', { maximumFractionDigits: Math.abs(n) < 10 ? 1 : 0 })} ${label}`;
    }
  }
  return Math.round(v).toLocaleString('fa-IR');
}
