/**
 * formatters.js — Standard formatting utilities for numbers, currencies, and inputs
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
