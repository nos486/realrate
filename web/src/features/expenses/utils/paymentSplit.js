/**
 * paymentSplit.js — The rows of «چند منبع» in the expense form, and the `payments` they save
 *
 * A big toman purchase paid from several sources (expenseDocument.js `payments`) is entered as
 * rows, each an amount and its source: an account (a bank credit too), a loan's money (and the
 * account it went through, if any), or an asset sold from a portfolio (a portfolioLink.js link).
 * A row's `source` is the account's id, `loan:<id>` or PORTFOLIO_SOURCE. These helpers turn the
 * stored parts into rows and back, and say what is still missing before it can be saved.
 */

import { t } from '../../../utils/i18n.js';
import { EXPENSE_LIMITS } from '../../../utils/expenseDocument.js';
import { isLinkComplete } from '../../../utils/portfolioLink.js';
import { resolveAssetUnit } from '../../../config/sourceRegistry.js';
import { parseInputNumber, formatNum } from '../../portfolio/utils/holdingHelpers.js';

/** A row's source when it is an asset sold from a portfolio */
export const PORTFOLIO_SOURCE = 'pf';
/** The prefix of a loan among a row's sources */
export const LOAN_PREFIX = 'loan:';
/** The most rows (the parts one expense may have) */
export const MAX_SPLIT_ROWS = EXPENSE_LIMITS.maxPayments;
/** Rounding slack, in tomans, between the parts and the expense's amount */
const SLACK = 0.5;

const newId = (prefix) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

/** A new row (its fields may be given) */
export function newSplitRow(patch = {}) {
  return { id: newId('pay'), amount: '', source: '', loanAccountId: '', link: null, ...patch };
}

/** The rows of the parts an expense was saved with (none: []) */
export function rowsFromPayments(payments) {
  if (!Array.isArray(payments)) return [];
  return payments.map((p) => {
    if (p.soldFrom) return newSplitRow({ id: p.id, amount: String(p.amount), source: PORTFOLIO_SOURCE, link: { ...p.soldFrom } });
    if (p.loanId) return newSplitRow({ id: p.id, amount: String(p.amount), source: `${LOAN_PREFIX}${p.loanId}`, loanAccountId: p.accountId || '' });
    return newSplitRow({ id: p.id, amount: String(p.amount), source: p.accountId || '' });
  });
}

/**
 * What still keeps the rows from being saved, '' when nothing
 * @param {object[]} rows
 * @param {number} total the expense's amount
 */
export function splitProblem(rows, total) {
  if (rows.length < 2) return t('دست‌کم دو منبع لازم است.');
  if (rows.some((r) => !(parseInputNumber(r.amount) > 0))) return t('مبلغ هر منبع را وارد کنید.');
  if (rows.some((r) => !r.source || (r.source === PORTFOLIO_SOURCE && !isLinkComplete(r.link)))) {
    return t('منبع هر ردیف را کامل انتخاب کنید.');
  }
  const sum = splitSum(rows);
  if (Math.abs(sum - (Number(total) || 0)) > SLACK) {
    return t('جمع منابع ({sum}) با مبلغ هزینه ({total}) برابر نیست.', { sum: formatNum(sum), total: formatNum(Number(total) || 0) });
  }
  return '';
}

/** What the rows add up to */
export const splitSum = (rows) => rows.reduce((sum, r) => sum + (parseInputNumber(r.amount) || 0), 0);

/**
 * The parts to save from complete rows (splitProblem: '')
 * @param {object[]} rows
 * @param {() => string} newTxId a new portfolio transaction's id (portfolioFunds.newLinkTxId)
 * @returns {object[]} expenseDocument.js `payments`
 */
export function paymentsFromRows(rows, newTxId) {
  return rows.map((r) => {
    const amount = parseInputNumber(r.amount) || 0;
    if (r.source === PORTFOLIO_SOURCE) {
      const { portfolioId, portfolioName, assetId, quantity, txId, unit } = r.link;
      return {
        id: r.id,
        amount,
        soldFrom: {
          portfolioId,
          portfolioName: portfolioName || '',
          assetId,
          quantity: Number(quantity),
          txId: txId || newTxId(),
          // Named only when the ledger is kept in another unit than the asset's usual one
          ...(unit && unit !== resolveAssetUnit(assetId) ? { unit } : {}),
        },
      };
    }
    if (r.source.startsWith(LOAN_PREFIX)) {
      return { id: r.id, amount, loanId: r.source.slice(LOAN_PREFIX.length), ...(r.loanAccountId ? { accountId: r.loanAccountId } : {}) };
    }
    return { id: r.id, amount, accountId: r.source };
  });
}
