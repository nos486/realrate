/**
 * accountMerge.js — Merging two of the user's accounts into one («ادغام حساب‌ها»)
 *
 * A bank SMS can make an account the user already has under another name (the card was not on
 * the first one). Merging moves every record of the duplicate to the account kept — expenses
 * (and the reimbursements that reached it), incomes, cheques, subscriptions and transfers — and
 * folds the duplicate's bank, digits and currencies into the kept account. Its card and account
 * digits stay on the kept account as `aliases`, so later bank SMS of that card match it
 * (matchSmsAccount). A transfer between the two is no longer a transfer and is dropped.
 * Pure functions; the browser reads and writes the records (shared/vault/mergeAccounts.js).
 * Shared by the browser and the API, like the other domain modules.
 */

import { accountCurrencies, isCreditAccount, ACCOUNT_LIMITS } from './accountDocument.js';

/** Other cards or account numbers a kept account answers to (from the accounts merged into it) */
export const MAX_ACCOUNT_ALIASES = 10;

/** The record kinds that point at an account */
export const ACCOUNT_RECORD_KINDS = ['expense', 'income', 'cheque', 'subscription', 'transfer'];

/** Whether two accounts can be merged: two different accounts, neither a bank credit */
export function canMergeAccounts(a, b) {
  return Boolean(a && b && a.id !== b.id && !isCreditAccount(a) && !isCreditAccount(b));
}

/**
 * A record with every reference to `fromId` pointed at `intoId`
 * @param {string} kind one of ACCOUNT_RECORD_KINDS
 * @param {object} record
 * @returns {{ record: object, changed: boolean, drop: boolean }} `drop`: a transfer between the
 *   two accounts, which has nowhere to go any more
 */
export function repointRecord(kind, record, fromId, intoId) {
  const swap = (id) => (id === fromId ? intoId : id);
  if (kind === 'transfer') {
    const fromAccountId = swap(record.fromAccountId);
    const toAccountId = swap(record.toAccountId);
    const changed = fromAccountId !== record.fromAccountId || toAccountId !== record.toAccountId;
    return { record: changed ? { ...record, fromAccountId, toAccountId } : record, changed, drop: changed && fromAccountId === toAccountId };
  }
  let changed = false;
  const next = { ...record };
  if (record.accountId === fromId) {
    next.accountId = intoId;
    changed = true;
  }
  if (kind === 'expense' && Array.isArray(record.reimbursements) && record.reimbursements.some((r) => r.accountId === fromId)) {
    next.reimbursements = record.reimbursements.map((r) => (r.accountId === fromId ? { ...r, accountId: intoId } : r));
    changed = true;
  }
  return { record: changed ? next : record, changed, drop: false };
}

/** An account's card and account digits as an alias entry ('' fields left out) */
function aliasOf(account) {
  const entry = { bankId: account.bankId || '', cardLast4: account.cardLast4 || '', accountNumber: account.accountNumber || '' };
  return entry.cardLast4 || entry.accountNumber ? entry : null;
}

const sameAlias = (a, b) => a.bankId === b.bankId && a.cardLast4 === b.cardLast4 && a.accountNumber === b.accountNumber;

/**
 * The kept account after absorbing `merged`: what it lacks (bank, digits, balance, notes) comes
 * from the other, it holds both currency sets, and the other's digits become aliases
 * @param {object} keep
 * @param {object} merged
 * @returns {object} the kept account's new fields (to save over it)
 */
export function mergeAccountFields(keep, merged) {
  const currencies = [...new Set([...accountCurrencies(keep), ...accountCurrencies(merged)])];
  const bankId = keep.bankId || merged.bankId || '';
  const fields = {
    bankId,
    bankName: keep.bankId ? keep.bankName || '' : keep.bankName || merged.bankName || '',
    cardLast4: keep.cardLast4 || merged.cardLast4 || '',
    accountNumber: keep.accountNumber || merged.accountNumber || '',
    currencies,
    currency: currencies[0],
  };
  const aliases = [];
  for (const entry of [...(keep.aliases || []), ...(merged.aliases || []), aliasOf(merged)]) {
    if (!entry || aliases.some((a) => sameAlias(a, entry))) continue;
    // The kept account's own digits need no alias
    if (sameAlias(entry, { bankId, cardLast4: fields.cardLast4, accountNumber: fields.accountNumber })) continue;
    aliases.push(entry);
  }
  fields.aliases = aliases.slice(-MAX_ACCOUNT_ALIASES);
  // A balance the kept account does not keep comes with the records that move it
  if (!keep.balance && merged.balance) fields.balance = merged.balance;
  const notes = [keep.notes, merged.notes].map((n) => String(n || '').trim()).filter(Boolean);
  fields.notes = [...new Set(notes)].join(' — ').slice(0, ACCOUNT_LIMITS.notesLength);
  return fields;
}
