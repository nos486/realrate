/**
 * useLoanPayAccounts.js — The accounts a loan payment can be paid from (LoanPayAccountField), and
 * the account the last payment used, remembered as the next one's default (this page load)
 */

import { useFeature } from '../../../shared/features/useFeature.js';
import { useAccounts } from '../../accounts/hooks/useAccounts.js';
import { accountsForCurrency } from '../../../utils/accountDocument.js';

/** The account the last loan payment was paid from */
let lastPayAccountId = '';

/** Remember the account a payment was recorded with, as the next one's default */
export function rememberPayAccount(accountId) {
  if (accountId) lastPayAccountId = accountId;
}

/**
 * The accounts a loan payment can be paid from, and the one to start with
 * @returns {{ accounts: object[], defaultId: string }} `accounts` is empty when none can be asked
 */
export function useLoanPayAccounts() {
  const enabled = useFeature('bank_accounts');
  const { accounts: all = [] } = useAccounts();
  const accounts = enabled ? accountsForCurrency(all.filter((a) => !a.archived)) : [];
  const defaultId = accounts.find((a) => a.id === lastPayAccountId)?.id || (accounts.length === 1 ? accounts[0].id : '');
  return { accounts, defaultId };
}
