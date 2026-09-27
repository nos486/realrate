/**
 * chequeScan.js — Domain logic for Iranian bank cheque AI scan normalization & validation
 *
 * Responsibilities:
 * - Pure, deterministic extraction & normalization from AI model output
 * - Persian/Arabic number string parsing to ASCII
 * - Conversion between cheque face value in Rials (ریال) and app storage unit in Tomans (تومان)
 * - Persian written numbers (amountWords) to numeric converter
 * - Shamsi / Jalali date parsing and ISO Gregorian conversion
 * - 16-digit Sayad ID validation
 * - Standard Iranian bank matching
 * - Robust JSON extraction from raw AI model response strings
 */

import { toAsciiDigits, CHEQUE_LIMITS } from './chequeDocument.js';
import { isValidIsoDate } from './isoDate.js';
import { matchBankIdByName, getBankById } from '../config/banks.config.js';

// ── Pure Jalali to Gregorian Date Converter ──────────────────────────────────
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

/**
 * Validates a Shamsi date string (YYYY/MM/DD or YYYY-MM-DD) and converts to ISO Gregorian.
 *
 * @param {string} str
 * @returns {{ isoDate: string, shamsiDate: string } | null}
 */
export function parseAndConvertShamsiDate(str) {
  if (!str) return null;
  const ascii = toAsciiDigits(str).trim();
  const match = ascii.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  if (year < 1300 || year > 1500) return null;
  if (month < 1 || month > 12) return null;
  const maxDays = month <= 6 ? 31 : 30;
  if (day < 1 || day > maxDays) return null;
  // Esfand 30 exists only in a leap year: otherwise it is the same day as Farvardin 1
  if (month === 12 && day === 30 && jalaliToGregorian(year, 12, 30) === jalaliToGregorian(year + 1, 1, 1)) return null;

  const iso = jalaliToGregorian(year, month, day);
  if (!isValidIsoDate(iso)) return null;

  const shamsi = `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
  return { isoDate: iso, shamsiDate: shamsi };
}

// ── Persian Words to Number Converter ───────────────────────────────────────
const ONES = {
  'صفر': 0, 'یک': 1, 'يك': 1, 'دو': 2, 'سه': 3, 'چهار': 4, 'پنج': 5,
  'شش': 6, 'شيش': 6, 'هفت': 7, 'هشت': 8, 'نه': 9,
  'ده': 10, 'یازده': 11, 'يازده': 11, 'دوازده': 12, 'سیزده': 13, 'چهارده': 14,
  'پانزده': 15, 'شانزده': 16, 'هفده': 17, 'هجده': 18, 'نوزده': 19,
};

const TENS = {
  'بیست': 20, 'بيست': 20, 'سی': 30, 'سي': 30, 'چهل': 40,
  'پنجاه': 50, 'شصت': 60, 'هفتاد': 70, 'هشتاد': 80, 'نود': 90,
};

const HUNDREDS = {
  'صد': 100, 'یکصد': 100, 'يكصد': 100, 'دویست': 200, 'سیصد': 300, 'سيصد': 300,
  'چهارصد': 400, 'پانصد': 500, 'ششصد': 600, 'هفتصد': 700, 'هشتصد': 800, 'نهصد': 900,
};

const MULTIPLIERS = {
  'هزار': 1000,
  'میلیون': 1000000,
  'ميليون': 1000000,
  'میلیارد': 1000000000,
  'ميليارد': 1000000000,
  'همت': 1000000000000,
};

/**
 * Converts a Persian verbal amount (e.g. "پنجاه میلیون ریال") to numeric value in Rials.
 *
 * @param {string} text
 * @returns {{ amountRials: number, rawNumber: number, unit: 'rial'|'toman' } | null}
 */
export function wordsToNumberPersian(text) {
  if (!text || typeof text !== 'string') return null;

  let cleaned = text
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[،,]/g, ' ')
    .trim();

  if (!cleaned) return null;

  // Detect currency unit:
  // In Iranian cheques, default currency is Rials (ریال). If "تومان" is explicitly stated,
  // we recognize it and multiply by 10 to obtain Rials for internal comparison.
  let unit = 'rial';
  if (/(?:^|\s)تومان(?:\s|$)/.test(cleaned)) {
    unit = 'toman';
  }

  // Remove noise words
  cleaned = cleaned
    .replace(/(^|\s)(تمام|تنها|فقط|مبلغ|عدد|برابر|ریال|تومان)(?=\s|$)/g, ' ')
    .trim();

  // Split tokens by space and filter out "و" connector
  const rawTokens = cleaned.split(/\s+/).filter(Boolean);
  const tokens = [];

  for (const t of rawTokens) {
    if (t === 'و') continue;
    // Handle combined forms like "بیست‌وچهار" or "صدوهشتاد"
    if (t.includes('و') && !ONES[t] && !TENS[t] && !HUNDREDS[t] && !MULTIPLIERS[t]) {
      const subParts = t.split('و').filter(Boolean);
      tokens.push(...subParts);
    } else {
      tokens.push(t);
    }
  }

  if (tokens.length === 0) return null;

  let total = 0;
  let currentChunk = 0;
  let hasValidToken = false;

  for (const token of tokens) {
    const asciiDigits = toAsciiDigits(token);
    if (/^\d+$/.test(asciiDigits)) {
      currentChunk += Number(asciiDigits);
      hasValidToken = true;
      continue;
    }

    if (ONES[token] !== undefined) {
      currentChunk += ONES[token];
      hasValidToken = true;
    } else if (TENS[token] !== undefined) {
      currentChunk += TENS[token];
      hasValidToken = true;
    } else if (HUNDREDS[token] !== undefined) {
      currentChunk += HUNDREDS[token];
      hasValidToken = true;
    } else if (MULTIPLIERS[token] !== undefined) {
      const mult = MULTIPLIERS[token];
      if (currentChunk === 0) currentChunk = 1;
      currentChunk *= mult;
      total += currentChunk;
      currentChunk = 0;
      hasValidToken = true;
    }
  }

  if (!hasValidToken) return null;

  total += currentChunk;

  const amountRials = unit === 'toman' ? total * 10 : total;

  return {
    amountRials,
    rawNumber: total,
    unit,
  };
}

// ── JSON Parser for LLM Outputs ──────────────────────────────────────────────
/**
 * Robustly extracts and parses JSON object from AI text response.
 * Handles markdown code fences and noisy preamble/postamble.
 *
 * @param {string} text
 * @returns {object|null}
 */
export function parseChequeScanJson(text) {
  if (!text || typeof text !== 'string') return null;

  const trimmed = text.trim();

  // 1. Direct parse attempt
  try {
    return JSON.parse(trimmed);
  } catch {}

  // 2. Extract from markdown code fences ```json ... ``` or ``` ... ```
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {}
  }

  // 3. Balanced curly brace extraction
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {}
  }

  return null;
}

// ── Main Domain Normalization Function ───────────────────────────────────────
/**
 * Normalizes raw output from Workers AI vision model into standardized ChequeForm fields.
 *
 * @param {object|string} rawInput - Parsed JSON object or raw string from LLM
 * @returns {object} Normalized response with fields, confidence, warnings, etc.
 */
export function normalizeChequeScan(rawInput) {
  const raw = typeof rawInput === 'string' ? parseChequeScanJson(rawInput) : rawInput;

  const warnings = [];
  const confidence = {
    amount: 'medium',
    dueDate: 'medium',
    sayadId: 'medium',
    chequeNumber: 'medium',
    bankName: 'medium',
    counterparty: 'medium',
  };

  if (!raw || typeof raw !== 'object' || raw.notACheque === true) {
    return {
      success: false,
      notACheque: true,
      fields: {
        amount: null,
        dueDate: null,
        issueDate: '',
        sayadId: null,
        chequeNumber: '',
        bankId: '',
        bankName: '',
        counterparty: '',
        notes: '',
      },
      confidence: {
        amount: 'low',
        dueDate: 'low',
        sayadId: 'low',
        chequeNumber: 'low',
        bankName: 'low',
        counterparty: 'low',
      },
      warnings: ['این تصویر چک نیست یا اطلاعات آن قابل خواندن نمی‌باشد.'],
    };
  }

  // Inherit LLM reported confidence if available
  if (raw.confidence && typeof raw.confidence === 'object') {
    for (const [k, v] of Object.entries(raw.confidence)) {
      if (['high', 'medium', 'low'].includes(v)) {
        confidence[k] = v;
      }
    }
  }

  // ── 1. Amount Normalization (Rials -> Tomans) ──────────────────────────────
  // Physical Iranian cheques always specify face value in Rials (ریال).
  // In RealRate, the cheque management feature (ChequeForm) expects amounts in Tomans (تومان).
  // Therefore: fields.amount = Math.round(amountRials / 10).
  let normalizedAmountTomans = null;
  let amountRials = null;

  if (raw.amount !== null && raw.amount !== undefined && String(raw.amount).trim() !== '') {
    const rawAmountClean = toAsciiDigits(String(raw.amount)).replace(/,/g, '').replace(/\s+/g, '');
    const parsedNum = Number(rawAmountClean);

    if (Number.isFinite(parsedNum) && parsedNum > 0) {
      amountRials = parsedNum;
      // Convert Rials to Tomans for RealRate's ChequeForm
      normalizedAmountTomans = Math.round(amountRials / 10);

      if (normalizedAmountTomans > CHEQUE_LIMITS.maxAmount) {
        normalizedAmountTomans = null;
        confidence.amount = 'low';
        warnings.push('مبلغ چک بیش از حد مجاز سامانه است.');
      }
    } else {
      confidence.amount = 'low';
    }
  } else {
    confidence.amount = 'low';
  }

  // Cross-verify amount with verbal amount (amountWords) if present
  if (raw.amountWords) {
    const verbalParsed = wordsToNumberPersian(raw.amountWords);
    if (verbalParsed && amountRials !== null) {
      if (verbalParsed.amountRials !== amountRials) {
        warnings.push('مبلغ عددی و حروفی یکی نیست');
        confidence.amount = 'low';
      } else {
        // High confidence when numbers match verbal text
        if (confidence.amount !== 'low') {
          confidence.amount = 'high';
        }
      }
    }
  }

  // ── 2. Sayad ID Normalization (Exactly 16 digits) ────────────────────────────
  let normalizedSayadId = null;
  if (raw.sayadId) {
    const sayadDigits = toAsciiDigits(String(raw.sayadId)).replace(/[\s-]+/g, '');
    if (/^\d{16}$/.test(sayadDigits)) {
      // A well-formed id is not a correctly read one: the model's own confidence stands
      normalizedSayadId = sayadDigits;
    } else {
      confidence.sayadId = 'low';
      if (sayadDigits.length > 0) {
        warnings.push('شناسه صیادی باید دقیقاً ۱۶ رقم باشد.');
      }
    }
  } else {
    confidence.sayadId = 'low';
  }

  // ── 3. Due Date Normalization (Shamsi -> ISO Gregorian) ─────────────────────
  let normalizedDueDate = null;
  if (raw.dueDate) {
    const dateConverted = parseAndConvertShamsiDate(String(raw.dueDate));
    if (dateConverted) {
      normalizedDueDate = dateConverted.isoDate;
    } else {
      confidence.dueDate = 'low';
      warnings.push('تاریخ سررسید نامعتبر است.');
    }
  } else {
    confidence.dueDate = 'low';
  }

  // ── 4. Cheque Number Normalization ──────────────────────────────────────────
  let normalizedChequeNumber = '';
  if (raw.chequeNumber) {
    const num = toAsciiDigits(String(raw.chequeNumber)).trim().replace(/[^\d/-]/g, '');
    if (num && num.length <= CHEQUE_LIMITS.chequeNumberLength) {
      normalizedChequeNumber = num;
    } else if (num.length > CHEQUE_LIMITS.chequeNumberLength) {
      normalizedChequeNumber = num.slice(0, CHEQUE_LIMITS.chequeNumberLength);
    }
  } else {
    confidence.chequeNumber = 'low';
  }

  // ── 5. Bank Resolution ──────────────────────────────────────────────────────
  let bankId = '';
  let bankName = String(raw.bankName || '').trim();

  if (bankName) {
    const matchedId = matchBankIdByName(bankName);
    if (matchedId) {
      bankId = matchedId;
      const canonicalBank = getBankById(matchedId);
      if (canonicalBank) {
        bankName = canonicalBank.name;
      }
    }
  } else {
    confidence.bankName = 'low';
  }

  // ── 6. Counterparty (Payee / Drawer) ─────────────────────────────────────────
  let counterparty = String(raw.payee || raw.drawer || raw.counterparty || '').trim();
  if (counterparty.length > CHEQUE_LIMITS.counterpartyLength) {
    counterparty = counterparty.slice(0, CHEQUE_LIMITS.counterpartyLength);
  }
  if (!counterparty) {
    confidence.counterparty = 'low';
  }

  // ── 7. Notes ────────────────────────────────────────────────────────────────
  let notes = String(raw.notes || '').trim();
  if (raw.branchName && !notes.includes(raw.branchName)) {
    notes = notes ? `${notes} (شعبه: ${raw.branchName})` : `شعبه: ${raw.branchName}`;
  }
  if (notes.length > CHEQUE_LIMITS.notesLength) {
    notes = notes.slice(0, CHEQUE_LIMITS.notesLength);
  }

  // If none of the critical cheque fields could be identified, flag as not a cheque
  const hasCrucialFields = normalizedAmountTomans !== null || normalizedSayadId !== null || normalizedDueDate !== null;
  if (!hasCrucialFields) {
    return {
      success: false,
      notACheque: true,
      fields: {
        amount: null,
        dueDate: null,
        issueDate: '',
        sayadId: null,
        chequeNumber: normalizedChequeNumber,
        bankId,
        bankName,
        counterparty,
        notes,
      },
      confidence,
      warnings: ['اطلاعات اصلی چک (مبلغ، شناسه صیادی یا سررسید) در تصویر شناسایی نشد.'],
    };
  }

  return {
    success: true,
    notACheque: false,
    fields: {
      amount: normalizedAmountTomans,
      dueDate: normalizedDueDate,
      issueDate: '',
      sayadId: normalizedSayadId,
      chequeNumber: normalizedChequeNumber,
      bankId,
      bankName,
      counterparty,
      notes,
    },
    confidence,
    warnings,
  };
}
