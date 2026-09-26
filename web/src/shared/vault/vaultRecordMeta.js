/**
 * vaultRecordMeta.js — The plaintext metadata stored beside each encrypted vault record
 *
 * Standard for every encrypted record: the whole content is ciphertext except one primary date
 * (record_date, so the server can filter by date range and sort) and, for items of a portfolio,
 * the portfolio id (parent_id).
 */

import { putVaultRecord } from './vaultApi.js';
import { jalaliToGregorian } from '../../utils/loanCalculator.js';
import { toEnglishDigits } from '../utils/formatters.js';

const DAY_RE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/;
const pad = (n) => String(n).padStart(2, '0');

/** The primary date of each record kind */
const PRIMARY_DATE = {
  income: (r) => r?.incomeDate,
  cheque: (r) => r?.dueDate,
  loan: (doc) => doc?.loan?.startDate,
  recurring_income: (r) => r?.startDate,
  holding: (h) => h?.buyDate,
  transaction: (t) => t?.transactionDate || t?.date,
};

/**
 * A stored date as Gregorian YYYY-MM-DD ('' when it is not a date). Some records keep a Shamsi
 * date (e.g. transactions: «1405/07/04» or «1404-02-01»); a year before 1700 is read as Shamsi, so
 * every record_date is on the same calendar and range queries compare like with like.
 */
export function toIsoDay(value) {
  const match = toEnglishDigits(String(value ?? '').trim()).match(DAY_RE);
  if (!match) return '';
  let [year, month, day] = match.slice(1).map(Number);
  if (year < 1700) {
    if (month < 1 || month > 12 || day < 1 || day > 31) return '';
    ({ year, month, day } = jalaliToGregorian(year, month, day));
  }
  const iso = `${year}-${pad(month)}-${pad(day)}`;
  const check = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(check.getTime()) && check.getUTCDate() === day ? iso : '';
}

/** Gregorian YYYY-MM-DD of a record's primary date, or '' when it has none */
export function recordDateOf(kind, plain) {
  return toIsoDay(PRIMARY_DATE[kind]?.(plain));
}

/** Store an already-encrypted record with its plaintext metadata */
export function putRecord(kind, id, payload, plain, { parentId = '', ...options } = {}) {
  return putVaultRecord(kind, id, payload, { recordDate: recordDateOf(kind, plain), parentId, ...options });
}

/**
 * Records whose stored date is missing or wrong (encrypted before the metadata existed, or saved
 * with a Shamsi date read as Gregorian) get it fixed the next time they are read: the same
 * ciphertext is stored again with the right date (nothing is re-encrypted). Runs in the background.
 * @param {string} kind
 * @param {Array<{ record: object, plain: object }>} items records as listed + their decrypted content
 */
export function backfillRecordDates(kind, items) {
  const missing = items.filter(({ record, plain }) => recordDateOf(kind, plain) !== (record.recordDate || ''));
  if (missing.length === 0) return;
  (async () => {
    for (const { record, plain } of missing) {
      try {
        await putVaultRecord(kind, record.id, record.payload, {
          recordDate: recordDateOf(kind, plain),
          parentId: record.parentId || '',
          silent: true,
        });
      } catch {
        // Tried again on the next read
      }
    }
  })();
}
