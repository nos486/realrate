/**
 * vaultRecurringIncomes.js — Fixed (recurring) income rules of an end-to-end encrypted account
 *
 * Same functions and response shapes as the REST API (features/incomes/api/recurringIncomeApi.js),
 * each rule stored as one encrypted vault record and validated by the shared
 * utils/recurringIncome.js, like the server does.
 */

import { validateRecurringIncome } from '../../utils/recurringIncome.js';
import { listVaultRecords, deleteVaultRecord } from './vaultApi.js';
import { putRecord, backfillRecordDates } from './vaultRecordMeta.js';
import { encryptVaultRecord, decryptVaultRecord } from './vaultStore.js';

const KIND = 'recurring_income';

class RecurringValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function parse(body) {
  const { value, error } = validateRecurringIncome(body);
  if (error) throw new RecurringValidationError(error);
  return value;
}

let rules = new Map();

async function save(rule) {
  await putRecord(KIND, rule.id, await encryptVaultRecord(rule), rule);
  rules.set(rule.id, rule);
  return rule;
}

export function clearVaultRecurringIncomesCache() {
  rules = new Map();
}

export async function getRecurringIncomes() {
  const res = await listVaultRecords(KIND);
  const next = new Map();
  const decrypted = [];
  for (const record of res?.records || []) {
    const rule = await decryptVaultRecord(record.payload);
    if (rule?.id) {
      next.set(record.id, rule);
      decrypted.push({ record, plain: rule });
    } else console.warn('Skipped a fixed income that could not be decrypted:', record.id);
  }
  rules = next;
  backfillRecordDates(KIND, decrypted);
  const list = [...rules.values()].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  return { success: true, count: list.length, rules: list };
}

export async function createRecurringIncome(data) {
  const now = new Date().toISOString();
  const rule = { id: `rinc_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`, ...parse(data), createdAt: now, updatedAt: now };
  return { success: true, rule: await save(rule) };
}

export async function updateRecurringIncome(ruleId, data) {
  if (!rules.has(ruleId)) await getRecurringIncomes();
  const existing = rules.get(ruleId);
  if (!existing) throw new RecurringValidationError('درآمد ثابت مورد نظر یافت نشد.', 404);
  const rule = { ...existing, ...parse(data), updatedAt: new Date().toISOString() };
  return { success: true, rule: await save(rule) };
}

export async function deleteRecurringIncome(ruleId) {
  await deleteVaultRecord(KIND, ruleId);
  rules.delete(ruleId);
  return { success: true };
}
