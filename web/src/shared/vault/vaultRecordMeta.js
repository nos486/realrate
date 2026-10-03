/**
 * vaultRecordMeta.js — The plaintext metadata stored beside each encrypted vault record
 *
 * Standard for every encrypted record: the whole content is ciphertext except one primary date
 * (record_date, so the server can filter by date range and sort) and, for items of a portfolio,
 * the portfolio id (parent_id).
 */

import { putVaultRecord, listVaultRecords } from './vaultApi.js';
import { jalaliToGregorian } from '../../utils/loanCalculator.js';
import { toEnglishDigits } from '../utils/formatters.js';
import { isDemoReadOnly } from '../../features/demo/index.js';
import { reminderOf, REMINDER_KINDS } from '../../utils/reminders.js';
import { shouldIncludeChequeDirection } from '../alerts/emailAlertsApi.js';

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
  expense_group: (g) => g?.createdAt,
  expense: (e) => e?.date,
  bank_account: (a) => a?.createdAt,
  transfer: (t) => t?.date,
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

/**
 * What this browser last stored as each record's reminder ("kind|id" → JSON), so opening the app
 * re-stores only the records whose reminder changed (every store bumps the record's updated_at,
 * which every other device then syncs). Cleared on logout (clearReminderSignatures).
 */
const REMINDER_SIGS_KEY = 'realrate_reminder_sigs';

/** Read fresh each time: another tab may have stored some since */
function loadReminderSigs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(REMINDER_SIGS_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

const reminderSig = (rem) => JSON.stringify(rem ?? null);

function rememberReminder(kind, id, rem) {
  const sigs = loadReminderSigs();
  sigs[`${kind}|${id}`] = reminderSig(rem);
  try {
    localStorage.setItem(REMINDER_SIGS_KEY, JSON.stringify(sigs));
  } catch {
    // Storage full or blocked: the next open stores it again
  }
}

/** Reminders being stored right now ("kind|id") */
const remindersInFlight = new Set();

/** Forget what was stored (logout: the next account starts from nothing) */
export function clearReminderSignatures() {
  try {
    localStorage.removeItem(REMINDER_SIGS_KEY);
  } catch {
    // Blocked storage: nothing was kept either
  }
}

/** Store an already-encrypted record with its plaintext metadata and minimal reminder index */
export async function putRecord(kind, id, payload, plain, { parentId = '', reminder, ...options } = {}) {
  const rem = reminder !== undefined
    ? reminder
    : (REMINDER_KINDS.includes(kind) ? reminderOf(kind, plain, { includeDirection: shouldIncludeChequeDirection() }) : undefined);
  const result = await putVaultRecord(kind, id, payload, {
    recordDate: recordDateOf(kind, plain),
    parentId,
    reminder: rem,
    ...options,
  });
  if (rem !== undefined) rememberReminder(kind, id, rem);
  return result;
}

/**
 * After loans, cheques and fixed incomes are listed and decrypted, store the reminders that are
 * missing or changed since this browser last stored them. A record whose reminder is unchanged
 * is left alone, so opening the app does not re-store every record.
 * @param {string} kind
 * @param {Array<{ record: object, plain: object }>} items
 */
export function backfillReminders(kind, items) {
  if (isDemoReadOnly() || !REMINDER_KINDS.includes(kind)) return;
  const sigs = loadReminderSigs();
  const includeDirection = shouldIncludeChequeDirection();
  const stale = [];
  for (const { record, plain } of items) {
    if (!plain || typeof plain !== 'object') continue;
    const key = `${kind}|${record.id}`;
    // Several screens may list the same kind at once: one store per record
    if (remindersInFlight.has(key)) continue;
    const rem = reminderOf(kind, plain, { includeDirection });
    if (sigs[key] !== reminderSig(rem)) {
      remindersInFlight.add(key);
      stale.push({ key, record, plain, rem });
    }
  }
  if (!stale.length) return;
  (async () => {
    for (const { key, record, plain, rem } of stale) {
      try {
        await putVaultRecord(kind, record.id, record.payload, {
          recordDate: record.recordDate || recordDateOf(kind, plain),
          parentId: record.parentId || '',
          reminder: rem,
          silent: true,
        });
        rememberReminder(kind, record.id, rem);
      } catch {
        // Retried the next time the app opens
      } finally {
        remindersInFlight.delete(key);
      }
    }
  })();
}

/**
 * Records whose stored date is missing or wrong (encrypted before the metadata existed, or saved
 * with a Shamsi date read as Gregorian) get it fixed the next time they are read: the same
 * ciphertext is stored again with the right date (nothing is re-encrypted). Runs in the background.
 * @param {string} kind
 * @param {Array<{ record: object, plain: object }>} items records as listed + their decrypted content
 */
export function backfillRecordDates(kind, items) {
  if (isDemoReadOnly()) return;
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

/** Repairs done (or running) in this tab: kind|parent → promise, shared by concurrent queries */
const repairs = new Map();

/**
 * Before a date-range query: records saved before their date was stored (or with a Shamsi date
 * read as Gregorian) would fall outside every range, so they are found once per kind (and
 * portfolio) in this tab and stored again with the right date — same ciphertext.
 * @param {string} kind
 * @param {(payload: string) => Promise<object|null>} decrypt
 * @param {string} [parent] portfolio id, for portfolio items
 */
export function repairRecordDates(kind, decrypt, parent = '') {
  if (isDemoReadOnly()) return Promise.resolve();
  const tag = `${kind}|${parent}`;
  if (!repairs.has(tag)) {
    const run = (async () => {
      const res = await listVaultRecords(kind, { silent: true }, { undated: true, parent });
      for (const record of res?.records || []) {
        const plain = await decrypt(record.payload);
        const recordDate = plain && typeof plain === 'object' ? recordDateOf(kind, plain) : '';
        // A record with no date of its own stays undated (it still shows under «all»)
        if (!recordDate || recordDate === record.recordDate) continue;
        await putVaultRecord(kind, record.id, record.payload, { recordDate, parentId: record.parentId || '', silent: true });
      }
    })();
    // A failed run is tried again by the next query
    run.catch(() => repairs.delete(tag));
    repairs.set(tag, run);
  }
  return repairs.get(tag);
}
