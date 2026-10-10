/**
 * expenseCsv.js — The columns of the expense CSV files (everyday expenses and each project)
 *
 * What an expense holds, as recorded: its day, category, title, amount and the user's own share
 * («دنگ»), its currency, tags, what others paid back, the account it was paid from, what funded it
 * (a loan, or a currency held in a portfolio), where it was recorded from (a bank SMS) and the
 * note. Nothing computed from a rate (tomans, dollars, today's value): every rate is the price
 * history's by the expense's day, so the file holds only what was recorded.
 *
 * The same file reads back (parseExpenseCsvRow, ExpenseCsvImportButton): day, category, title,
 * amount and share, currency, tags, account and note. What came back from others and what funded
 * it (a loan, a portfolio) name records of their own, so they are not imported.
 */

import { isSharedExpense, expenseReceivable, normalizeTags } from '../../../utils/expenseDocument.js';
import { BASE_CURRENCY, CURRENCIES, currencyLabel } from '../../../utils/currencies.js';
import { formatShamsiDisplay, shamsiToGregorian } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { parseInputNumber } from '../../portfolio/utils/holdingHelpers.js';
import { toEnglishDigits } from '../../../shared/utils/formatters.js';
import { accountLabel } from '../../accounts/constants/accountDisplay.js';
import { getExpenseCategory } from '../constants/expenseCategories.js';

const BASE = ['تاریخ', 'عنوان', 'مبلغ', 'سهم من', 'ارز'];
const REST = ['برچسب‌ها', 'دریافت‌شده از دیگران', 'پرداخت از', 'تأمین از', 'ثبت از', 'یادداشت'];

/** @param {{ withCategory?: boolean }} [options] with a category column (empty: a project's expense without one) */
export function expenseCsvHeaders({ withCategory = false } = {}) {
  return withCategory ? [BASE[0], 'دسته‌بندی', ...BASE.slice(1), ...REST] : [...BASE, ...REST];
}

/**
 * One expense's row
 * @param {object} e
 * @param {{ withCategory?: boolean, accountById?: Map, loanById?: Map }} ctx
 */
export function expenseCsvRow(e, { withCategory = false, accountById = new Map(), loanById = new Map() } = {}) {
  const shared = isSharedExpense(e);
  const funding = e.paidFrom?.portfolioId
    ? `پورتفو: ${e.paidFrom.portfolioName || 'پورتفو'}`
    : e.loanId
      ? `وام: ${loanById.get(e.loanId)?.title || 'وام حذف‌شده'}`
      : '';
  const base = [
    formatShamsiDisplay(`${e.date}T00:00:00`),
    e.title,
    e.amount,
    shared ? e.myShare : e.amount,
    currencyLabel(e.currency),
  ];
  const rest = [
    (e.tags || []).join('، '),
    shared ? expenseReceivable(e).received : '',
    e.accountId ? accountLabel(accountById.get(e.accountId)) : '',
    funding,
    e.source === 'sms' ? 'پیامک بانک' : '',
    e.notes || '',
  ];
  return withCategory
    ? [base[0], e.category ? getExpenseCategory(e.category).label : '', ...base.slice(1), ...rest]
    : [...base, ...rest];
}

/** A day in the file: the Shamsi one it is written in (Persian digits too), or YYYY-MM-DD */
function dayOf(raw) {
  const value = toEnglishDigits(String(raw || '').trim());
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(value) ? shamsiToGregorian(value) : '';
}

/** A currency's name in the file → its code (tomans when empty or unknown) */
const currencyFromLabel = (label) => CURRENCIES.find((c) => c.label === label || c.code === label)?.code || BASE_CURRENCY;

/**
 * One row of an expense CSV (the columns expenseCsvHeaders writes) as an expense to save
 * @param {string[]} row
 * @param {Record<string, number>} headerIndex a header's column
 * @param {number} rowIndex
 * @param {{ categoryOf: (label: string) => string, accountOf: (label: string) => string }} lookups
 *   a category's key and an account's id by their name in the file ('' when unknown)
 * @returns {{ status: 'ok'|'invalid', name: string, data?: object }}
 */
export function parseExpenseCsvRow(row, headerIndex, rowIndex, { categoryOf, accountOf }) {
  const get = (header) => {
    const idx = headerIndex[header];
    return idx !== undefined && row[idx] !== undefined ? String(row[idx]).trim() : '';
  };
  const title = get('عنوان');
  const category = categoryOf(get('دسته‌بندی'));
  const amount = parseInputNumber(toEnglishDigits(get('مبلغ')));
  const date = dayOf(get('تاریخ'));
  const name = title || `ردیف ${rowIndex + 2}`;
  if ((!title && !category) || !(amount > 0) || !date) return { status: 'invalid', name };

  const currency = currencyFromLabel(get('ارز'));
  // A share below the amount: paid for others too («دنگ», tomans only)
  const share = parseInputNumber(toEnglishDigits(get('سهم من')));
  const myShare = currency === BASE_CURRENCY && share !== null && share >= 0 && share < amount ? share : null;
  return {
    status: 'ok',
    name,
    data: {
      title,
      category,
      amount,
      currency,
      date,
      myShare,
      tags: normalizeTags(get('برچسب‌ها').split(/[،,]/)),
      accountId: accountOf(get('پرداخت از')),
      notes: get('یادداشت'),
    },
  };
}
