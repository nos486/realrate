/**
 * vaultAccounts.js — The user's money accounts, stored only as encrypted vault records
 * ("bank_account"; see utils/accountDocument.js)
 */

import { validateAccount, compareAccounts } from '../../utils/accountDocument.js';
import { listVaultRecords, deleteVaultRecord } from './vaultApi.js';
import { putRecord } from './vaultRecordMeta.js';
import { encryptVaultRecord, decryptVaultRecord } from './vaultStore.js';

const KIND = 'bank_account';

class AccountValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function getAccounts() {
  const res = await listVaultRecords(KIND);
  const accounts = [];
  for (const record of res?.records || []) {
    const account = await decryptVaultRecord(record.payload);
    if (account?.id) accounts.push(account);
    else console.warn('Skipped an account that could not be decrypted:', record.id);
  }
  accounts.sort(compareAccounts);
  return { success: true, accounts };
}

/** Create an account, or update it when `existing` (its stored copy) is given */
export async function saveAccount(input, existing = null) {
  const { value, error } = validateAccount(existing ? { ...existing, ...input } : input);
  if (error) throw new AccountValidationError(error);
  const now = new Date().toISOString();
  const account = existing
    ? { ...existing, ...value, updatedAt: now }
    : { id: `acc_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`, ...value, createdAt: now, updatedAt: now };
  await putRecord(KIND, account.id, await encryptVaultRecord(account), account);
  return { success: true, account };
}

/** Delete an account; expenses that point to it keep the id and show as «حساب حذف‌شده» */
export async function deleteAccount(accountId) {
  await deleteVaultRecord(KIND, accountId);
  return { success: true };
}
