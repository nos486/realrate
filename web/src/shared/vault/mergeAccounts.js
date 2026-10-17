/**
 * mergeAccounts.js — «ادغام حساب‌ها»: every record of one account moved to another
 *
 * Runs in the browser (the records are end-to-end encrypted): each kind that points at an
 * account — expenses and their reimbursements, incomes, cheques, subscriptions, transfers — is
 * read, the references to the merged account are pointed at the kept one (utils/accountMerge.js)
 * and only the records that changed are stored again, VAULT_BATCH_MAX at a time. The kept
 * account is saved last and the merged one deleted after it, so an interrupted merge is simply
 * run again. Records another feature recorded keep their owner; only their account changes.
 */

import { ACCOUNT_RECORD_KINDS, canMergeAccounts, mergeAccountFields, repointRecord } from '../../utils/accountMerge.js';
import { listVaultRecords, putVaultRecords, deleteVaultRecords, VAULT_BATCH_MAX } from './vaultApi.js';
import { recordDateOf } from './vaultRecordMeta.js';
import { encryptVaultRecord, decryptVaultRecords } from './vaultStore.js';
import { saveAccount, deleteAccount } from './vaultAccounts.js';
import { t } from '../../utils/i18n.js';

/** A kind of a feature the account does not have has nothing to move */
async function listAll(kind) {
  try {
    return (await listVaultRecords(kind, { silent: true }))?.records || [];
  } catch (err) {
    if (err?.status === 404 || err?.status === 403) return [];
    throw err;
  }
}

/**
 * Move the records of `merged` to `keep` and delete `merged`
 * @param {object} keep the account that stays
 * @param {object} merged the duplicate that goes
 * @returns {Promise<{ account: object, moved: number, dropped: number }>} the saved kept account,
 *   how many records were pointed at it, and how many transfers between the two were removed
 */
export async function mergeAccounts(keep, merged) {
  if (!canMergeAccounts(keep, merged)) throw new Error(t('این دو حساب قابل ادغام نیستند.'));
  let moved = 0;
  let dropped = 0;
  for (const kind of ACCOUNT_RECORD_KINDS) {
    const records = await listAll(kind);
    const plains = await decryptVaultRecords(records.map((r) => r.payload));
    const changed = [];
    const removed = [];
    records.forEach((record, i) => {
      if (!plains[i]?.id) return;
      const result = repointRecord(kind, plains[i], merged.id, keep.id);
      if (!result.changed) return;
      if (result.drop) removed.push(record.id);
      else changed.push({ record, plain: result.record });
    });
    for (let from = 0; from < changed.length; from += VAULT_BATCH_MAX) {
      const chunk = changed.slice(from, from + VAULT_BATCH_MAX);
      await putVaultRecords(kind, await Promise.all(chunk.map(async ({ record, plain }) => ({
        id: record.id,
        payload: await encryptVaultRecord(plain),
        recordDate: record.recordDate || recordDateOf(kind, plain),
        parentId: record.parentId || '',
      }))));
    }
    if (removed.length > 0) await deleteVaultRecords(kind, removed);
    moved += changed.length;
    dropped += removed.length;
  }
  const { account } = await saveAccount(mergeAccountFields(keep, merged), keep);
  await deleteAccount(merged.id);
  return { account, moved, dropped };
}
