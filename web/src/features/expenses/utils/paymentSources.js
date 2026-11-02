/**
 * paymentSources.js — How the sources of an expense paid from several of them («چند منبع») read
 *
 * Each part (expenseDocument.js `payments`) is named by its source: the account (a bank credit
 * too), the loan whose money paid it, or the asset sold from a portfolio — shown in the expense
 * lists and written to the CSV files.
 */

import { t } from '../../../utils/i18n.js';
import { expensePayments, isMultiSourceExpense } from '../../../utils/expenseDocument.js';
import { resolveAssetDisplayName } from '../../../config/sourceRegistry.js';
import { accountLabel } from '../../accounts/constants/accountDisplay.js';

/**
 * The name of one part's source
 * @param {object} part `{ accountId?, loanId?, soldFrom? }`
 * @param {{ accountById?: Map, loanTitle?: (id: string) => string }} [ctx]
 */
export function paymentSourceLabel(part, { accountById = new Map(), loanTitle = () => t('وام') } = {}) {
  if (part?.soldFrom) {
    const asset = part.soldFrom.assetName || resolveAssetDisplayName(part.soldFrom.assetId) || part.soldFrom.assetId;
    return t('فروش {asset} از «{name}»', { asset, name: part.soldFrom.portfolioName || t('پورتفو') });
  }
  const loan = part?.loanId ? t('وام «{name}»', { name: loanTitle(part.loanId) }) : '';
  const account = part?.accountId ? accountLabel(accountById.get(part.accountId)) : '';
  return [loan, account].filter(Boolean).join(' — ') || t('نامشخص');
}

/**
 * The parts of an expense paid from several sources, each named (empty for one source)
 * @returns {Array<{ id: string, amount: number, label: string }>}
 */
export function paymentParts(expense, ctx) {
  if (!isMultiSourceExpense(expense)) return [];
  return expensePayments(expense).map((p) => ({ id: p.id, amount: Number(p.amount) || 0, label: paymentSourceLabel(p, ctx) }));
}
