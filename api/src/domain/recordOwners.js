/**
 * recordOwners.js — Which feature owns an expense or income it recorded by itself
 *
 * Money another feature pays out or takes in is recorded for it (web spendingRecords.js,
 * recordLinks.js): a loan's paid installment or extra payment, a subscription's due payment, a
 * cleared cheque's money. Such a record is that feature's: it is changed or removed only from its
 * own page (marking the installment unpaid, the cheque back to pending…), never edited or deleted
 * in the expenses or incomes — there it shows which page it belongs to.
 *
 * A record names its owner in `recordedBy` (a key of RECORD_OWNERS) — set when it was recorded,
 * or when a record entered by hand was taken as that payment. One recorded before the field
 * existed is known by its id (SPENDING_ID_PREFIX: an expense made for another feature's
 * spending) and what it names. A new owner is one entry here. Shared with the web app.
 */

/** The features that record expenses or incomes of their own: their name and page */
export const RECORD_OWNERS = {
  loan: { label: 'وام‌ها', path: '/loans' },
  subscription: { label: 'اشتراک‌ها', path: '/subscriptions' },
  cheque: { label: 'چک‌ها', path: '/cheques' },
};

/** The id prefix of an expense recorded for another feature's spending (spendingExpenseId) */
export const SPENDING_ID_PREFIX = 'exp_s';

/** Whether a value is an owner's key */
export const isRecordOwner = (value) => typeof value === 'string' && Object.hasOwn(RECORD_OWNERS, value);

/**
 * The feature that owns a record, or null for one the user owns
 * @param {object|null} record an expense or an income
 * @returns {string|null} a RECORD_OWNERS key
 */
export function recordOwnerOf(record) {
  if (!record) return null;
  if (isRecordOwner(record.recordedBy)) return record.recordedBy;
  // Recorded before `recordedBy`: an expense made for another feature, by what it names
  if (!String(record.id || '').startsWith(SPENDING_ID_PREFIX)) return null;
  if (record.subscriptionId) return 'subscription';
  if (record.chequeId) return 'cheque';
  return 'loan';
}

/** The owner's name and page of a record, or null */
export const recordOwnerInfo = (record) => {
  const owner = recordOwnerOf(record);
  return owner ? { key: owner, ...RECORD_OWNERS[owner] } : null;
};

/** The message when a record is changed outside its owner's page */
export function ownedRecordMessage(record, side = 'expense') {
  const info = recordOwnerInfo(record);
  const what = side === 'income' ? 'درآمد' : 'هزینه';
  return info ? `این ${what} را بخش «${info.label}» ثبت کرده؛ از همان صفحه تغییرش دهید.` : '';
}
