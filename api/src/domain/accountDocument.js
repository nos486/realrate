/**
 * accountDocument.js — The user's money accounts: bank accounts, cash, e-wallets, ...
 *
 * An account is an end-to-end encrypted vault record ("bank_account"). Features point at one by
 * its id: an expense's `accountId` says where the money came from. Later the bank-SMS intake
 * will match a message to an account by its bank and card number's last four digits.
 * Shared by the browser and the API, like the other domain modules.
 */

export const ACCOUNT_TYPES = [
  { value: 'bank', label: 'حساب بانکی' },
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
  // A bank only for a bank account: a standard bank id or a custom bank's
  const bankId = type === 'bank' && BANK_ID_RE.test(text(body.bankId)) ? text(body.bankId) : '';
  const bankName = type === 'bank' ? text(body.bankName).slice(0, 80) : '';

  const cardLast4 = asciiDigits(body.cardLast4);
  if (cardLast4 && !/^\d{4}$/.test(cardLast4)) return { error: 'چهار رقم آخر کارت باید دقیقاً ۴ رقم باشد.' };

  const currency = body.currency === 'USD' ? 'USD' : 'IRT';
  const notes = text(body.notes);
  if (notes.length > ACCOUNT_LIMITS.notesLength) return { error: `توضیحات نباید بیشتر از ${ACCOUNT_LIMITS.notesLength} کاراکتر باشد.` };

  return {
    value: {
      name,
      type,
      bankId,
      bankName,
      cardLast4: type === 'bank' ? cardLast4 : '',
      currency,
      notes,
      archived: Boolean(body.archived),
    },
  };
}

/** Active accounts first, then by name */
export function compareAccounts(a, b) {
  return Number(Boolean(a.archived)) - Number(Boolean(b.archived)) || String(a.name).localeCompare(String(b.name), 'fa');
}
