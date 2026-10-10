/**
 * accountDocument.js — The user's money accounts: bank accounts, cash, e-wallets, ...
 *
 * An account is an end-to-end encrypted vault record ("bank_account"). Features point at one by
 * its id: an expense's `accountId` says where the money came from. A bank SMS is matched to an
 * account by its bank and the last four digits of its account number or card (bankSms.js).
 * A bank credit line is an account too (type 'credit', with its terms in `credit`): spending
 * from it is an expense paid from it, paying it back a transfer into it (creditAccount.js).
 * An account holds one or more currencies (`currencies`, currencies.js: e.g. a Wise account in
 * tomans, dollars and euros); `currency` stays the first of them for older clients. Forms offer only the accounts
 * that hold a record's currency (accountsForCurrency). A credit line is in tomans.
 * Shared by the browser and the API, like the other domain modules.
 */

import { validateCreditTerms } from './creditAccount.js';
import { CURRENCY_CODES } from './currencies.js';

export const ACCOUNT_TYPES = [
  { value: 'bank', label: 'حساب بانکی' },
  { value: 'credit', label: 'اعتبار بانکی' },
  { value: 'cash', label: 'نقد' },
  { value: 'wallet', label: 'کیف پول الکترونیک' },
  { value: 'other', label: 'سایر' },
];

export const ACCOUNT_LIMITS = {
  nameLength: 60,
  notesLength: 300,
};

const TYPE_VALUES = new Set(ACCOUNT_TYPES.map((t) => t.value));
const BANK_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const text = (v) => String(v ?? '').trim();
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const asciiDigits = (v) => text(v)
  .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
  .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));

/** Types that belong to a bank (a bank, a card, an account number) */
const BANK_TYPES = new Set(['bank', 'credit']);

const CURRENCY_VALUES = CURRENCY_CODES;

/**
 * The currencies an account holds, in the app's order (an older record has only `currency`)
 * @returns {string[]} e.g. ['IRT'], ['IRT', 'USD']
 */
export function accountCurrencies(account) {
  const listed = Array.isArray(account?.currencies) ? account.currencies : [account?.currency || 'IRT'];
  const held = CURRENCY_VALUES.filter((c) => listed.includes(c));
  return held.length > 0 ? held : ['IRT'];
}

/** Whether an account holds a currency */
export const accountHolds = (account, currency) => accountCurrencies(account).includes(currency || 'IRT');

/**
 * The accounts a record in `currency` can be paid from or into — those that hold it. The one a
 * record already names (`keepId`) stays listed, so editing an older record never drops it.
 */
export function accountsForCurrency(accounts = [], currency = 'IRT', keepId = '') {
  return accounts.filter((a) => accountHolds(a, currency) || (keepId && a.id === keepId));
}

/** Whether an account is a credit line */
export const isCreditAccount = (account) => account?.type === 'credit' && Boolean(account.credit);

export function accountTypeLabel(type) {
  return ACCOUNT_TYPES.find((t) => t.value === type)?.label || 'سایر';
}

/**
 * Validate & normalize an account
 * @returns {{ value?: object, error?: string }}
 */
export function validateAccount(body = {}) {
  const name = text(body.name);
  if (!name) return { error: 'نام حساب الزامی است.' };
  if (name.length > ACCOUNT_LIMITS.nameLength) return { error: `نام حساب نباید بیشتر از ${ACCOUNT_LIMITS.nameLength} کاراکتر باشد.` };

  const type = TYPE_VALUES.has(body.type) ? body.type : 'bank';
  // A bank only for a bank account or a bank credit: a standard bank id or a custom bank's
  const hasBank = BANK_TYPES.has(type);
  const bankId = hasBank && BANK_ID_RE.test(text(body.bankId)) ? text(body.bankId) : '';
  const bankName = hasBank ? text(body.bankName).slice(0, 80) : '';

  const cardLast4 = asciiDigits(body.cardLast4);
  if (cardLast4 && !/^\d{4}$/.test(cardLast4)) return { error: 'چهار رقم آخر کارت باید دقیقاً ۴ رقم باشد.' };
  // The account number (digits; separators dropped), as the bank's SMS shows it
  const accountNumber = asciiDigits(body.accountNumber).replace(/[\s.-]/g, '');
  if (accountNumber && !/^\d{4,26}$/.test(accountNumber)) return { error: 'شماره حساب فقط شامل ارقام (۴ تا ۲۶ رقم) است.' };

  // A credit is in tomans, with its terms; any other account holds the currencies it lists (at
  // least one — an older body's single `currency` counts as its list)
  const listed = Array.isArray(body.currencies) ? body.currencies : [body.currency || 'IRT'];
  const currencies = type === 'credit' ? ['IRT'] : CURRENCY_VALUES.filter((c) => listed.includes(c));
  if (currencies.length === 0) return { error: 'دست‌کم یک ارز برای حساب انتخاب کنید.' };
  let credit = null;
  if (type === 'credit') {
    const terms = validateCreditTerms(body.credit, new Date().toISOString().slice(0, 10));
    if (terms.error) return { error: terms.error };
    credit = terms.value;
  }
  const notes = text(body.notes);
  if (notes.length > ACCOUNT_LIMITS.notesLength) return { error: `توضیحات نباید بیشتر از ${ACCOUNT_LIMITS.notesLength} کاراکتر باشد.` };

  return {
    value: {
      name,
      type,
      bankId,
      bankName,
      cardLast4: hasBank ? cardLast4 : '',
      accountNumber: hasBank ? accountNumber : '',
      currency: currencies[0],
      currencies,
      ...(credit ? { credit } : {}),
      notes,
      archived: Boolean(body.archived),
    },
  };
}

/** Active accounts first, then by name */
export function compareAccounts(a, b) {
  return Number(Boolean(a.archived)) - Number(Boolean(b.archived)) || String(a.name).localeCompare(String(b.name), 'fa');
}
