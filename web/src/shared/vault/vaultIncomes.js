/**
 * vaultIncomes.js — Incomes of an end-to-end encrypted account
 *
 * Same functions and response shapes as the incomes REST API (features/incomes/api/incomeApi.js),
 * with each income stored as one encrypted vault record. Validation mirrors the server's
 * parseIncomeInput so both paths accept exactly the same data.
 *
 * An income that is a sale from a portfolio (`soldFrom`, utils/portfolioLink.js) also writes,
 * moves or deletes its «sell» transaction there (portfolioFunds.js): the transaction first.
 * Its category may link it to a record (utils/categoryLinks.js): a deposit that pays a bank
 * credit's debt («تسویه بدهی اعتباری») names the credit (`creditAccountId`: a payment into it,
 * utils/creditAccount.js), a cheque cashed («وصول چک») the received cheque (`chequeId`). What
 * linking does to that record is recordLinks.js's, run after every save and delete.
 */

import { isCategoryValue } from '../../utils/categoryDocument.js';
import { categoryLinkFields } from '../../utils/categoryLinks.js';
import { validatePortfolioLink, sameLink } from '../../utils/portfolioLink.js';
import { listVaultRecords, deleteVaultRecord } from './vaultApi.js';
import { putRecord, backfillRecordDates, repairRecordDates } from './vaultRecordMeta.js';
import { encryptVaultRecord, decryptVaultRecord } from './vaultStore.js';
import { syncRecordLinks, releaseRecordLinks } from './recordLinks.js';

const KIND = 'income';
const TITLE_MAX_LENGTH = 120;
const NOTES_MAX_LENGTH = 500;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  const category = isCategoryValue('income', body.category) ? body.category : 'other';
  // Recorded from a bank SMS: the transaction's key (bankSms.js), so it is not recorded twice
  const smsKey = String(body.smsKey ?? '').trim().slice(0, 120);
  // The record its category links it to (categoryLinks.js): «تسویه بدهی اعتباری» the credit
  // whose debt this deposit pays, «وصول چک» the received cheque
  const links = categoryLinkFields('income', category, body);

  if (!title) throw new IncomeValidationError('عنوان درآمد الزامی است.');
  if (title.length > TITLE_MAX_LENGTH) throw new IncomeValidationError(`عنوان درآمد نباید بیشتر از ${TITLE_MAX_LENGTH} کاراکتر باشد.`);
  if (!Number.isFinite(amount) || amount <= 0) throw new IncomeValidationError('مبلغ درآمد باید عددی بزرگتر از صفر باشد.');
  if (!ISO_DATE_RE.test(incomeDate) || isNaN(new Date(incomeDate).getTime())) {
    throw new IncomeValidationError('تاریخ دریافت درآمد نامعتبر است.');
  }
  if (notes.length > NOTES_MAX_LENGTH) throw new IncomeValidationError(`یادداشت نباید بیشتر از ${NOTES_MAX_LENGTH} کاراکتر باشد.`);
  // Sold from a portfolio: its «sell» entry (always returned, so an edit can remove it)
  const sold = validatePortfolioLink(body.soldFrom);
  if (sold.error) throw new IncomeValidationError(sold.error);

  return {
    title, category, amount, incomeDate, notes, soldFrom: sold.link,
    ...(smsKey ? { smsKey } : {}),
    // Always returned, so an edit to another category drops them
    creditAccountId: links.creditAccountId || '',
    chequeId: links.chequeId || '',
  };
}

function newIncomeId() {
  return `inc_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

let incomes = new Map();

const funds = () => import('./portfolioFunds.js');

/**
 * Store an income, with its portfolio sale written first (moved, or removed when it no longer has
 * one), then the record its category links it to (recordLinks.js)
 * @param {object} income
 * @param {object|null} previous its stored copy before (null: new)
 */
async function save(income, previous = null) {
  const before = previous?.soldFrom || null;
  const after = income.soldFrom || null;
  if (after) {
    const f = await funds();
    if (before && !sameLink(before, after)) await f.deleteLinkedTransaction(before);
    await f.saveLinkedTransaction(after, { type: 'sell', toman: Number(income.amount) || 0, date: income.incomeDate, owner: { incomeId: income.id } });
  }
  try {
    await putRecord(KIND, income.id, await encryptVaultRecord(income), income);
  } catch (err) {
    if (after && !sameLink(before, after)) await (await funds()).deleteLinkedTransaction(after).catch(() => {});
    throw err;
  }
  if (before && !after) await (await funds()).deleteLinkedTransaction(before).catch(() => {});
  incomes.set(income.id, income);
  await syncRecordLinks('income', income, previous);
  return income;
}

export function clearVaultIncomesCache() {
  incomes = new Map();
}

/**
 * Incomes by their date, newest first — only what the filters select is fetched and decrypted.
 * @param {{ from?: string, to?: string, order?: 'asc'|'desc', limit?: number, offset?: number }} [filters]
 *   `from`/`to` inclusive YYYY-MM-DD; with `limit`, one page plus the `total` matching
 */
export async function getIncomes(filters = {}) {
  await repairRecordDates(KIND, decryptVaultRecord);
  const res = await listVaultRecords(KIND, undefined, filters);
  const list = [];
  const decrypted = [];
  // Decrypted together (WebCrypto works in parallel), then read in order
  const records = res?.records || [];
  const plains = await Promise.all(records.map((r) => decryptVaultRecord(r.payload)));
  for (const [i, record] of records.entries()) {
    const income = plains[i];
    if (income?.id) {
      incomes.set(record.id, income);
      list.push(income);
      decrypted.push({ record, plain: income });
    } else console.warn('Skipped an income that could not be decrypted:', record.id);
  }
  backfillRecordDates(KIND, decrypted);
  return { success: true, count: list.length, incomes: list, total: res?.total ?? list.length };
}

/** One income (from what was already read, or looked up) */
async function findIncome(incomeId) {
  if (!incomes.has(incomeId)) await getIncomes();
  return incomes.get(incomeId);
}

export async function createIncome(incomeData) {
  const now = new Date().toISOString();
  const income = { id: newIncomeId(), ...parseIncomeInput(incomeData), createdAt: now, updatedAt: now };
  return { success: true, income: await save(income) };
}

export async function updateIncome(incomeId, incomeData) {
  const existing = await findIncome(incomeId);
  if (!existing) throw new IncomeValidationError('درآمد مورد نظر یافت نشد.', 404);
  const income = { ...existing, ...parseIncomeInput(incomeData), updatedAt: new Date().toISOString() };
  return { success: true, income: await save(income, existing) };
}

export async function deleteIncome(incomeId) {
  const existing = (await findIncome(incomeId).catch(() => null)) || null;
  await deleteVaultRecord(KIND, incomeId);
  incomes.delete(incomeId);
  // Its sale leaves the portfolio too
  if (existing?.soldFrom) await (await funds()).deleteLinkedTransaction(existing.soldFrom).catch(() => {});
  await releaseRecordLinks('income', existing);
  return { success: true };
}
