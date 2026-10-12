/**
 * AccountsContext.jsx — One shared accounts list for every screen that shows or picks an account
 * (the accounts page, the expense, cheque, income and subscription forms, the SMS inbox)
 *
 * The list is encrypted, so each caller of useAccounts() used to download and decrypt it again.
 */

import React from 'react';
import { useAccountsState } from '../hooks/useAccounts.js';
import { AccountsContext } from './accountsContextValue.js';

export function AccountsProvider({ children }) {
  const state = useAccountsState(true);
  return <AccountsContext.Provider value={state}>{children}</AccountsContext.Provider>;
}
