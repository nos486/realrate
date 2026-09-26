/**
 * vaultRecordMeta.js — The plaintext metadata stored beside each encrypted vault record
 *
 * Standard for every encrypted record: the whole content is ciphertext except one primary date
 * (record_date, so the server can filter by date range and sort) and, for items of a portfolio,
 * the portfolio id (parent_id).
 */

import { putVaultRecord } from './vaultApi.js';

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}/;

/** The primary date of each record kind */
const PRIMARY_DATE = {
  income: (r) => r?.incomeDate,
  cheque: (r) => r?.dueDate,
  loan: (doc) => doc?.loan?.startDate,
  recurring_income: (r) => r?.startDate,
  holding: (h) => h?.buyDate,
  transaction: (t) => t?.transactionDate,
};

/** YYYY-MM-DD of a record's primary date, or '' when it has none */
export function recordDateOf(kind, plain) {
  const value = String(PRIMARY_DATE[kind]?.(plain) ?? '').trim();
  return ISO_DAY_RE.test(value) ? value.slice(0, 10) : '';
}

/** Store an already-encrypted record with its plaintext metadata */
export function putRecord(kind, id, payload, plain, { parentId = '', ...options } = {}) {
  return putVaultRecord(kind, id, payload, { recordDate: recordDateOf(kind, plain), parentId, ...options });
}

/**
 * Records encrypted before the metadata existed get it the next time they are read: the same
 * ciphertext is stored again with its date (nothing is re-encrypted). Runs in the background.
 * @param {string} kind
 * @param {Array<{ record: object, plain: object }>} items records as listed + their decrypted content
 */
export function backfillRecordDates(kind, items) {
  const missing = items.filter(({ record, plain }) => !record.recordDate && recordDateOf(kind, plain));
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
