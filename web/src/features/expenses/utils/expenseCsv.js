/**
 * expenseCsv.js — The columns of the expense CSV files (everyday expenses and each project)
 *
 * What an expense holds, as recorded: its day, category, title, amount and the user's own share
 * («دنگ»), its currency, tags, what others paid back, the account it was paid from, what funded it
 * (a loan, or a currency held in a portfolio), where it was recorded from (a bank SMS) and the
 * note. Nothing computed from a rate (tomans, dollars, today's value): every rate is the price
 * history's by the expense's day, so the file holds only what was recorded.
 */

import { isSharedExpense, expenseReceivable } from '../../../utils/expenseDocument.js';
import { currencyLabel } from '../../../utils/currencies.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
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
