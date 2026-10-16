/**
 * vaultGoals.js — The user's savings goals, each one an end-to-end encrypted vault record ("goal";
 * utils/goalDocument.js validates them). The deposits live inside the goal's record, so the
 * server sees only its kind, its id and the day it was created.
 */

import { validateGoal } from '../../utils/goalDocument.js';
import { listVaultRecords, deleteVaultRecord } from './vaultApi.js';
import { putRecord } from './vaultRecordMeta.js';
import { encryptVaultRecord, decryptVaultRecords } from './vaultStore.js';

const KIND = 'goal';

class GoalValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function parse(body) {
  const { value, error } = validateGoal(body);
  if (error) throw new GoalValidationError(error);
  return value;
}

const newId = () => `goal_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

/** A new deposit's id */
export const newDepositId = () => `dep_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

/** Every goal, decrypted */
export async function getGoals() {
  const res = await listVaultRecords(KIND);
  const records = res?.records || [];
  const plains = await decryptVaultRecords(records.map((r) => r.payload));
  const goals = [];
  for (const [i, record] of records.entries()) {
    const goal = plains[i];
    if (goal?.id) goals.push(goal);
    else console.warn('Skipped a goal that could not be decrypted:', record.id);
  }
  return { success: true, goals };
}

/** Create a goal, or update it when `existing` (its stored copy) is given */
export async function saveGoal(input, existing = null) {
  const now = new Date().toISOString();
  const goal = existing
    ? { ...existing, ...parse({ ...existing, ...input }), updatedAt: now }
    : { id: newId(), ...parse(input), createdAt: now, updatedAt: now };
  await putRecord(KIND, goal.id, await encryptVaultRecord(goal), goal);
  return { success: true, goal };
}

export async function deleteGoal(id) {
  await deleteVaultRecord(KIND, id);
  return { success: true };
}
