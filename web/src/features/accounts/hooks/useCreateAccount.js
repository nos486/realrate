/**
 * useCreateAccount.js — Make an account from inside an entry form
 *
 * Every income and expense is tied to an account, so a form that finds none to pick offers to
 * make one on the spot (AccountForm). The new account is kept here at once, so the form can pick
 * it before the accounts list has read it again; the other lists are told through the vault epoch.
 */

import { useState, useCallback } from 'react';
import { saveAccount } from '../../../shared/vault/vaultAccounts.js';
import { bumpVaultEpoch } from '../../../shared/vault/vaultStore.js';

/** `accounts` plus the `made` ones the list has not read yet */
export function withMadeAccounts(accounts, made) {
  return [...(accounts || []), ...made.filter((m) => !(accounts || []).some((a) => a.id === m.id))];
}

export function useCreateAccount() {
  const [made, setMade] = useState([]);
  const [creating, setCreating] = useState(false);
  /** Save a new account; errors are re-thrown for the open AccountForm */
  const create = useCallback(async (input) => {
    const { account } = await saveAccount(input);
    setMade((list) => [...list, account]);
    bumpVaultEpoch();
    return account;
  }, []);
  return { made, create, creating, setCreating };
}
