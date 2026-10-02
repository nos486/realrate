/**
 * vaultTransfers.js — Money moved between the user's own accounts, stored only as encrypted
 * vault records ("transfer"; see utils/transferDocument.js). Never an expense or an income.
 */

import { validateTransfer, compareTransfers } from '../../utils/transferDocument.js';
import { listVaultRecords, deleteVaultRecord } from './vaultApi.js';
import { putRecord } from './vaultRecordMeta.js';
import { encryptVaultRecord, decryptVaultRecord } from './vaultStore.js';

const KIND = 'transfer';

class TransferValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Transfers, newest first
 * @param {{ from?: string, to?: string }} [filters] inclusive YYYY-MM-DD range
 */
export async function getTransfers(filters = {}) {
  const res = await listVaultRecords(KIND, undefined, filters);
  const records = res?.records || [];
  const plains = await Promise.all(records.map((r) => decryptVaultRecord(r.payload)));
  const transfers = plains.filter((t, i) => {
    if (t?.id) return true;
    console.warn('Skipped a transfer that could not be decrypted:', records[i].id);
    return false;
  });
  transfers.sort(compareTransfers);
  return { success: true, transfers };
}

/** Create a transfer, or update it when `existing` (its stored copy) is given */
export async function saveTransfer(input, existing = null) {
  const { value, error } = validateTransfer(existing ? { ...existing, ...input } : input);
  if (error) throw new TransferValidationError(error);
  const now = new Date().toISOString();
  const transfer = existing
    ? { ...existing, ...value, updatedAt: now }
    : { id: `trf_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`, ...value, createdAt: now, updatedAt: now };
  // An edit may drop the fee, the notes or the messages
  if (existing) for (const key of ['fee', 'smsKeys']) if (!(key in value)) delete transfer[key];
  await putRecord(KIND, transfer.id, await encryptVaultRecord(transfer), transfer);
  return { success: true, transfer };
}

export async function deleteTransfer(transferId) {
  await deleteVaultRecord(KIND, transferId);
  return { success: true };
}
