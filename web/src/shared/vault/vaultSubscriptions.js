/**
 * vaultSubscriptions.js — The user's subscriptions, each one end-to-end encrypted vault record
 * ("subscription"; utils/subscriptionDocument.js validates them). Storing one also stores its
 * plaintext reminder row (the next renewal, vaultRecordMeta.js → reminders.js), which the daily
 * email digest reads; nothing else about it leaves the device.
 */

import { validateSubscription } from '../../utils/subscriptionDocument.js';
import { listVaultRecords, deleteVaultRecord } from './vaultApi.js';
import { putRecord, backfillReminders } from './vaultRecordMeta.js';
import { encryptVaultRecord, decryptVaultRecord } from './vaultStore.js';

const KIND = 'subscription';

class SubscriptionValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function parse(body) {
  const { value, error } = validateSubscription(body);
  if (error) throw new SubscriptionValidationError(error);
  return value;
}

const newId = () => `sub_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

/** Every subscription, decrypted (their reminders are stored again when out of date) */
export async function getSubscriptions() {
  const res = await listVaultRecords(KIND);
  const records = res?.records || [];
  const plains = await Promise.all(records.map((r) => decryptVaultRecord(r.payload)));
  const decrypted = [];
  const list = [];
  for (const [i, record] of records.entries()) {
    const sub = plains[i];
    if (sub?.id) {
      list.push(sub);
      decrypted.push({ record, plain: sub });
    } else console.warn('Skipped a subscription that could not be decrypted:', record.id);
  }
  // A subscription that renews by itself moves its next renewal on: its reminder is kept current
  backfillReminders(KIND, decrypted);
  return { success: true, subscriptions: list };
}

/** Create a subscription, or update it when `existing` (its stored copy) is given */
export async function saveSubscription(input, existing = null) {
  const now = new Date().toISOString();
  const sub = existing
    ? { ...existing, ...parse({ ...existing, ...input }), updatedAt: now }
    : { id: newId(), ...parse(input), createdAt: now, updatedAt: now };
  await putRecord(KIND, sub.id, await encryptVaultRecord(sub), sub);
  return { success: true, subscription: sub };
}

export async function deleteSubscription(id) {
  await deleteVaultRecord(KIND, id);
  return { success: true };
}
