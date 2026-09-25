/**
 * chequeDocument.js — Cheques: validation, status rules, tracking history and summaries
 *
 * Pure functions shared by the API (plaintext storage) and the browser (account vault, where the
 * record is encrypted before it leaves the device), so both paths accept exactly the same data.
 *
 * A cheque is either received (دریافتی: someone pays us) or issued (صادره: we pay someone).
 * Its status moves along a small lifecycle and every change is kept in `history` with its date
 * and an optional note, which is the cheque's tracking log.
 */

export const CHEQUE_DIRECTIONS = [
  { value: 'received', label: 'دریافتی' },
  { value: 'issued', label: 'صادره' },
];

/**
 * `open`: money has not moved yet (counts towards totals and reminders).
 * `directions`: which kind of cheque the status applies to.
 */
export const CHEQUE_STATUSES = [
  { value: 'pending', label: 'در انتظار سررسید', open: true, directions: ['received', 'issued'] },
  { value: 'deposited', label: 'در جریان وصول', open: true, directions: ['received'] },
  { value: 'cleared', label: 'پاس شده', open: false, directions: ['received', 'issued'] },
  { value: 'bounced', label: 'برگشتی', open: false, directions: ['received', 'issued'] },
  { value: 'transferred', label: 'واگذار شده', open: false, directions: ['received'] },
  { value: 'cancelled', label: 'باطل / عودت', open: false, directions: ['received', 'issued'] },
];

export const CHEQUE_LIMITS = {
  counterpartyLength: 120,
  bankNameLength: 80,
  bankIdLength: 80,
  chequeNumberLength: 30,
  notesLength: 500,
  historyNoteLength: 200,
  historyEntries: 50,
  maxAmount: 1e15,
};

/** Days before the due date from which an open cheque is "upcoming" */
export const CHEQUE_REMINDER_DAYS = 7;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SAYAD_RE = /^\d{16}$/;
const CHEQUE_NUMBER_RE = /^[0-9/-]+$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const STATUS_BY_VALUE = new Map(CHEQUE_STATUSES.map((s) => [s.value, s]));
const DIRECTION_VALUES = new Set(CHEQUE_DIRECTIONS.map((d) => d.value));

/** Persian / Arabic-Indic digits → ASCII */
export function toAsciiDigits(value) {
  return String(value ?? '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

export function isValidIsoDate(value) {
  return ISO_DATE_RE.test(value) && !isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

export function getChequeStatus(value) {
  return STATUS_BY_VALUE.get(value) || STATUS_BY_VALUE.get('pending');
}

export function getChequeDirection(value) {
  return CHEQUE_DIRECTIONS.find((d) => d.value === value) || CHEQUE_DIRECTIONS[0];
}

/** Statuses a cheque of this direction can have */
export function statusesFor(direction) {
  return CHEQUE_STATUSES.filter((s) => s.directions.includes(direction));
}

export function isChequeOpen(cheque) {
  return Boolean(getChequeStatus(cheque?.status).open);
}

const text = (v) => String(v ?? '').trim();

function sanitizeHistory(history, fallbackStatus, fallbackDate) {
  const entries = (Array.isArray(history) ? history : [])
    .filter((h) => h && STATUS_BY_VALUE.has(h.status) && isValidIsoDate(String(h.date)))
    .map((h) => ({
      status: h.status,
      date: String(h.date),
      note: text(h.note).slice(0, CHEQUE_LIMITS.historyNoteLength),
    }))
    .slice(-CHEQUE_LIMITS.historyEntries);
  // Every cheque has at least its registration in the log
  if (entries.length === 0) entries.push({ status: fallbackStatus, date: fallbackDate, note: '' });
  return entries;
}

/**
 * Validate & normalize a cheque as sent by a client.
 * @param {object} body
 * @param {{ today?: string }} [options] today's ISO date (for the first history entry)
 * @returns {{ value?: object, error?: string }}
 */
export function validateChequeInput(body = {}, { today } = {}) {
  const direction = body.direction;
  if (!DIRECTION_VALUES.has(direction)) return { error: 'نوع چک (دریافتی یا صادره) نامعتبر است.' };

  const status = body.status === undefined || body.status === '' ? 'pending' : body.status;
  const statusDef = STATUS_BY_VALUE.get(status);
  if (!statusDef) return { error: 'وضعیت چک نامعتبر است.' };
  if (!statusDef.directions.includes(direction)) {
    return { error: `وضعیت «${statusDef.label}» برای چک ${getChequeDirection(direction).label} معتبر نیست.` };
  }

  const amount = Number(toAsciiDigits(body.amount).replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'مبلغ چک باید عددی بزرگتر از صفر باشد.' };
  if (amount > CHEQUE_LIMITS.maxAmount) return { error: 'مبلغ چک بیش از حد مجاز است.' };

  const dueDate = text(body.dueDate);
  if (!isValidIsoDate(dueDate)) return { error: 'تاریخ سررسید چک نامعتبر است.' };

  const issueDate = text(body.issueDate);
  if (issueDate && !isValidIsoDate(issueDate)) return { error: 'تاریخ صدور چک نامعتبر است.' };

  const counterparty = text(body.counterparty);
  if (!counterparty) {
    return { error: direction === 'received' ? 'نام صادرکننده چک الزامی است.' : 'نام گیرنده چک الزامی است.' };
  }
  if (counterparty.length > CHEQUE_LIMITS.counterpartyLength) {
    return { error: `نام طرف حساب نباید بیشتر از ${CHEQUE_LIMITS.counterpartyLength} کاراکتر باشد.` };
  }

  const bankId = text(body.bankId);
  const bankName = text(body.bankName);
  if (bankId.length > CHEQUE_LIMITS.bankIdLength || bankName.length > CHEQUE_LIMITS.bankNameLength) {
    return { error: 'نام بانک بیش از حد طولانی است.' };
  }

  const chequeNumber = toAsciiDigits(text(body.chequeNumber)).replace(/\s+/g, '');
  if (chequeNumber && (chequeNumber.length > CHEQUE_LIMITS.chequeNumberLength || !CHEQUE_NUMBER_RE.test(chequeNumber))) {
    return { error: 'شماره چک فقط می‌تواند شامل رقم باشد.' };
  }

  const sayadId = toAsciiDigits(text(body.sayadId)).replace(/[\s-]+/g, '');
  if (sayadId && !SAYAD_RE.test(sayadId)) return { error: 'شناسه صیادی باید ۱۶ رقم باشد.' };

  const notes = text(body.notes);
  if (notes.length > CHEQUE_LIMITS.notesLength) {
    return { error: `یادداشت نباید بیشتر از ${CHEQUE_LIMITS.notesLength} کاراکتر باشد.` };
  }

  const fallbackDate = isValidIsoDate(today) ? today : issueDate || dueDate;
  const history = sanitizeHistory(body.history, status, fallbackDate);

  return {
    value: {
      direction,
      status,
      amount,
      dueDate,
      issueDate,
      counterparty,
      bankId,
      bankName,
      chequeNumber,
      sayadId,
      notes,
      history,
    },
  };
}

/**
 * The cheque with a new status, logged in its history (a same-status entry only adds the note).
 * @returns {object} a new cheque object
 */
export function applyChequeStatus(cheque, status, date, note = '') {
  const history = [...(Array.isArray(cheque.history) ? cheque.history : [])];
  history.push({ status, date, note: text(note).slice(0, CHEQUE_LIMITS.historyNoteLength) });
  return { ...cheque, status, history: history.slice(-CHEQUE_LIMITS.historyEntries) };
}

/** Whole days from `today` to the due date (negative when overdue) */
export function daysUntilDue(cheque, today) {
  const due = new Date(`${cheque.dueDate}T00:00:00Z`).getTime();
  const now = new Date(`${today}T00:00:00Z`).getTime();
  return Math.round((due - now) / DAY_MS);
}

/** Due date first; ties broken by creation time */
export function compareChequesByDue(a, b) {
  return String(a.dueDate).localeCompare(String(b.dueDate)) ||
    String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
}

/**
 * Open cheques that need attention: overdue ones (due date passed but still open) and ones due
 * within CHEQUE_REMINDER_DAYS, split by direction.
 */
export function buildChequeReminders(cheques, today, withinDays = CHEQUE_REMINDER_DAYS) {
  const reminders = { overdue: [], upcoming: [] };
  for (const cheque of cheques || []) {
    if (!isChequeOpen(cheque)) continue;
    const days = daysUntilDue(cheque, today);
    if (!Number.isFinite(days)) continue;
    if (days < 0) reminders.overdue.push({ ...cheque, days });
    else if (days <= withinDays) reminders.upcoming.push({ ...cheque, days });
  }
  reminders.overdue.sort(compareChequesByDue);
  reminders.upcoming.sort(compareChequesByDue);
  return reminders;
}

/**
 * Totals for the summary cards.
 * @returns {{ receivable: {count,total}, payable: {count,total}, bounced: {count,total},
 *   next30: {receivable, payable}, nextDue: object|null }}
 */
export function summarizeCheques(cheques, today) {
  const summary = {
    receivable: { count: 0, total: 0 },
    payable: { count: 0, total: 0 },
    bounced: { count: 0, total: 0 },
    next30: { receivable: 0, payable: 0 },
    nextDue: null,
  };
  for (const cheque of cheques || []) {
    const amount = Number(cheque.amount) || 0;
    if (cheque.status === 'bounced') {
      summary.bounced.count += 1;
      summary.bounced.total += amount;
      continue;
    }
    if (!isChequeOpen(cheque)) continue;
    const bucket = cheque.direction === 'issued' ? summary.payable : summary.receivable;
    bucket.count += 1;
    bucket.total += amount;
    const days = daysUntilDue(cheque, today);
    if (days >= 0 && days <= 30) summary.next30[cheque.direction === 'issued' ? 'payable' : 'receivable'] += amount;
    if (days >= 0 && (!summary.nextDue || compareChequesByDue(cheque, summary.nextDue) < 0)) summary.nextDue = cheque;
  }
  return summary;
}
