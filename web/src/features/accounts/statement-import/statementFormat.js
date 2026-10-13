/**
 * statementFormat.js — How the import shows numbers, days and the account's other side
 */

import { STATEMENT_BANKS } from '../../../utils/bankStatementTemplates.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** ASCII digits in a text → Persian digits */
export const faDigits = (text) => String(text ?? '').replace(/\d/g, (d) => PERSIAN_DIGITS[d]);

/** A toman amount with thousands separators */
export const faAmount = (value) => Math.round(Number(value) || 0).toLocaleString('fa-IR');

/** A Gregorian day (YYYY-MM-DD) as a Shamsi one */
export const shamsiDay = (iso) => (iso ? formatShamsiDisplay(`${iso}T00:00:00`) : '');

/** The category lists a decision picks from, by the side of the money */
export const sideOf = (direction) => (direction === 'debit' ? 'expense' : 'income');

/** What a group is, if the user says nothing: the suggestion, or «سایر» */
export function groupDecision(group, answers) {
  if (answers[group.key]) return answers[group.key];
  const s = group.suggestion;
  const action = group.direction === 'debit' ? 'expense' : 'income';
  return {
    // A guessed transfer needs its account first: until picked, it is the plain record
    action: s.action === 'transfer' && !s.accountId ? action : s.action,
    category: s.category || 'other',
    title: s.title && !/ (?:به|از)$/.test(s.title) ? s.title : '',
    accountId: s.accountId || '',
  };
}

/** The banks an account can import from: its own bank's statement format, or any when it has no bank */
export function statementBanksFor(account) {
  if (!account || account.type !== 'bank') return [];
  return account.bankId ? STATEMENT_BANKS.filter((b) => b.bankId === account.bankId) : STATEMENT_BANKS;
}
