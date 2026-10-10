/**
 * numberWords.js — A whole number in Persian words («یک میلیون و دویست و پنجاه هزار»)
 *
 * Under an amount being typed (AmountField): in tomans a zero too many or too few is easy to miss
 * among the digits, and impossible to miss in words.
 */

const ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
const TEENS = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
const TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const HUNDREDS = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
/** Each group of three digits' name, from the lowest */
const SCALES = ['', 'هزار', 'میلیون', 'میلیارد', 'هزار میلیارد'];

const AND = ' و ';

/** 1–999 in words */
function underThousand(n) {
  const parts = [];
  if (n >= 100) parts.push(HUNDREDS[Math.floor(n / 100)]);
  const rest = n % 100;
  if (rest >= 20) {
    parts.push(TENS[Math.floor(rest / 10)]);
    if (rest % 10) parts.push(ONES[rest % 10]);
  } else if (rest >= 10) {
    parts.push(TEENS[rest - 10]);
  } else if (rest > 0) {
    parts.push(ONES[rest]);
  }
  return parts.join(AND);
}

/**
 * A whole number in Persian words
 * @param {number} value
 * @returns {string} '' for anything not a positive whole number under 10^15
 */
export function numberToWords(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0 || n >= 1e15) return '';
  const groups = [];
  for (let rest = n, scale = 0; rest > 0; rest = Math.floor(rest / 1000), scale++) {
    const group = rest % 1000;
    // «هزار و پانصد», not «یک هزار و پانصد» (when it leads)
    const leading = Math.floor(rest / 1000) === 0;
    if (group) groups.unshift(scale === 1 && group === 1 && leading ? SCALES[1] : `${underThousand(group)}${SCALES[scale] ? ` ${SCALES[scale]}` : ''}`);
  }
  return groups.join(AND);
}
