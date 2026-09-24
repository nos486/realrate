/**
 * vaultIncomes.js — Incomes of an end-to-end encrypted account
 *
 * Same functions and response shapes as the incomes REST API (features/incomes/api/incomeApi.js),
 * with each income stored as one encrypted vault record. Validation mirrors the server's
 * parseIncomeInput so both paths accept exactly the same data.
 */

import { INCOME_CATEGORIES } from '../../features/incomes/constants/incomeCategories.js';
import { listVaultRecords, putVaultRecord, deleteVaultRecord } from './vaultApi.js';
import { encryptVaultRecord, decryptVaultRecord } from './vaultStore.js';

const KIND = 'income';
const TITLE_MAX_LENGTH = 120;
const NOTES_MAX_LENGTH = 500;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CATEGORY_KEYS = new Set(INCOME_CATEGORIES.map((c) => c.value));

class IncomeValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Same rules as the server's parseIncomeInput */
export function parseIncomeInput(body = {}) {
  const title = String(body.title ?? '').trim();
  const amount = Number(body.amount);
  const incomeDate = String(body.incomeDate ?? body.income_date ?? '').trim();
  const notes = String(body.notes ?? '').trim();
  const category = CATEGORY_KEYS.has(body.category) ? body.category : 'other';

  if (!title) throw new IncomeValidationError('عنوان درآمد الزامی است.');
  if (title.length > TITLE_MAX_LENGTH) throw new IncomeValidationError(`عنوان درآمد نباید بیشتر از ${TITLE_MAX_LENGTH} کاراکتر باشد.`);
  if (!Number.isFinite(amount) || amount <= 0) throw new IncomeValidationError('مبلغ درآمد باید عددی بزرگتر از صفر باشد.');
  if (!ISO_DATE_RE.test(incomeDate) || isNaN(new Date(incomeDate).getTime())) {
    throw new IncomeValidationError('تاریخ دریافت درآمد نامعتبر است.');
  }
  if (notes.length > NOTES_MAX_LENGTH) throw new IncomeValidationError(`یادداشت نباید بیشتر از ${NOTES_MAX_LENGTH} کاراکتر باشد.`);

  return { title, category, amount, incomeDate, notes };
}

function newIncomeId() {
  return `inc_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

let incomes = new Map();

async function save(income) {
  await putVaultRecord(KIND, income.id, await encryptVaultRecord(income));
  incomes.set(income.id, income);
  return income;
}

export function clearVaultIncomesCache() {
  incomes = new Map();
}

export async function getIncomes() {
  const res = await listVaultRecords(KIND);
  const next = new Map();
  for (const record of res?.records || []) {
    const income = await decryptVaultRecord(record.payload);
    if (income?.id) next.set(record.id, income);
    else console.warn('Skipped an income that could not be decrypted:', record.id);
  }
  incomes = next;
  const list = [...incomes.values()].sort(
    (a, b) =>
      String(b.incomeDate).localeCompare(String(a.incomeDate)) ||
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  );
  return { success: true, count: list.length, incomes: list };
}

export async function createIncome(incomeData) {
  const now = new Date().toISOString();
  const income = { id: newIncomeId(), ...parseIncomeInput(incomeData), createdAt: now, updatedAt: now };
  return { success: true, income: await save(income) };
}

export async function updateIncome(incomeId, incomeData) {
  if (!incomes.has(incomeId)) await getIncomes();
  const existing = incomes.get(incomeId);
  if (!existing) throw new IncomeValidationError('درآمد مورد نظر یافت نشد.', 404);
  const income = { ...existing, ...parseIncomeInput(incomeData), updatedAt: new Date().toISOString() };
  return { success: true, income: await save(income) };
}

export async function deleteIncome(incomeId) {
  await deleteVaultRecord(KIND, incomeId);
  incomes.delete(incomeId);
  return { success: true };
}
