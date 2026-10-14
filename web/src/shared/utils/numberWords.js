/**
 * numberWords.js — A whole number in words: Persian («یک میلیون و دویست و پنجاه هزار») or, in the
 * English UI, English («one million two hundred fifty thousand»)
 *
 * Under an amount being typed (AmountField): in tomans a zero too many or too few is easy to miss
 * among the digits, and impossible to miss in words.
 */

import { getLocale } from '../../utils/i18n.js';

const ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه']; // i18n-ignore
const TEENS = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده']; // i18n-ignore
const TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود']; // i18n-ignore
const HUNDREDS = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد']; // i18n-ignore
/** Each group of three digits' name, from the lowest */
const SCALES = ['', 'هزار', 'میلیون', 'میلیارد', 'هزار میلیارد']; // i18n-ignore

const AND = ' و '; // i18n-ignore

/** The English word tables (the Persian ones above are the Persian output, not UI texts) */
const EN_ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const EN_TEENS = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const EN_SCALES = ['', 'thousand', 'million', 'billion', 'trillion'];

/** 1–999 in English words: «two hundred fifty», «twenty-one» */
function underThousandEn(n) {
  const parts = [];
  if (n >= 100) parts.push(`${EN_ONES[Math.floor(n / 100)]} hundred`);
  const rest = n % 100;
  if (rest >= 20) parts.push(rest % 10 ? `${EN_TENS[Math.floor(rest / 10)]}-${EN_ONES[rest % 10]}` : EN_TENS[Math.floor(rest / 10)]);
  else if (rest >= 10) parts.push(EN_TEENS[rest - 10]);
  else if (rest > 0) parts.push(EN_ONES[rest]);
  return parts.join(' ');
}

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
 * A whole number in words (Persian, or English when the UI is English)
 * @param {number} value
 * @returns {string} '' for anything not a positive whole number under 10^15
 */
export function numberToWords(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0 || n >= 1e15) return '';
  if (getLocale() === 'en') {
    const words = [];
    for (let rest = n, scale = 0; rest > 0; rest = Math.floor(rest / 1000), scale++) {
      const group = rest % 1000;
      if (group) words.unshift(`${underThousandEn(group)}${EN_SCALES[scale] ? ` ${EN_SCALES[scale]}` : ''}`);
    }
    return words.join(' ');
  }
  const groups = [];
  for (let rest = n, scale = 0; rest > 0; rest = Math.floor(rest / 1000), scale++) {
    const group = rest % 1000;
    // «هزار و پانصد», not «یک هزار و پانصد» (when it leads)
    const leading = Math.floor(rest / 1000) === 0;
    if (group) groups.unshift(scale === 1 && group === 1 && leading ? SCALES[1] : `${underThousand(group)}${SCALES[scale] ? ` ${SCALES[scale]}` : ''}`);
  }
  return groups.join(AND);
}
