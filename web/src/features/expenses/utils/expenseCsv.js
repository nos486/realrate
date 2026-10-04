/**
 * expenseCsv.js — The columns of the expense CSV files (everyday expenses and each project)
 *
 * Everything an expense holds: what was paid and the user's own share («دنگ»), what others paid
 * back and still owe, the currency and rate (for a toman expense: what it was in dollars at the
 * day's rate and what that costs today), the account it was paid from, what funded it (a loan,
 * or a portfolio's dollars), where it was recorded from (a bank SMS) and the note.
 */

import { isSharedExpense, expenseReceivable, expenseInToman, expenseDollarValue, expenseDayRate } from '../../../utils/expenseDocument.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { accountLabel } from '../../accounts/constants/accountDisplay.js';
import { getExpenseCategory } from '../constants/expenseCategories.js';

const BASE = ['تاریخ', 'عنوان', 'مبلغ پرداختی', 'سهم من', 'ارز', 'نرخ دلار', 'معادل تومان (سهم من)'];
const REST = ['برچسب‌ها', 'معادل دلار (نرخ روز هزینه)', 'به نرخ امروز (تومان)', 'دریافت‌شده از دیگران', 'مانده طلب از دیگران', 'پرداخت از', 'تأمین از', 'ثبت از', 'یادداشت'];

/** @param {{ withCategory?: boolean }} [options] everyday expenses have a category column */
export function expenseCsvHeaders({ withCategory = false } = {}) {
  return withCategory ? [BASE[0], 'دسته‌بندی', ...BASE.slice(1), ...REST] : [...BASE, ...REST];
}

/**
 * One expense's row
 * @param {object} e
 * @param {{ withCategory?: boolean, usdToman?: number, usdAt?: Function, accountById?: Map, loanById?: Map }} ctx
 *   usdAt: the dollar's rate on a date (price history), for the «نرخ دلار» column
 */
export function expenseCsvRow(e, { withCategory = false, usdToman = 0, usdAt = null, accountById = new Map(), loanById = new Map() } = {}) {
  const shared = isSharedExpense(e);
  const { received, remaining } = expenseReceivable(e);
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
    e.currency === 'USD' ? 'دلار' : 'تومان',
    expenseDayRate(e, usdAt) || '',
    Math.round(expenseInToman(e, usdToman, usdAt) || 0),
  ];
  const dollars = e.currency === 'USD' ? null : expenseDollarValue(e, usdToman, usdAt);
  const rest = [
    (e.tags || []).join('، '),
    dollars ? Math.round(dollars.usd * 100) / 100 : '',
    dollars && dollars.todayToman !== null ? Math.round(dollars.todayToman) : '',
    shared ? received : '',
    shared ? remaining : '',
    e.accountId ? accountLabel(accountById.get(e.accountId)) : '',
    funding,
    e.source === 'sms' ? 'پیامک بانک' : '',
    e.notes || '',
  ];
  return withCategory
    ? [base[0], getExpenseCategory(e.category).label, ...base.slice(1), ...rest]
    : [...base, ...rest];
}
