/**
 * fullBackup.js — «پشتیبان کامل»: everything the account holds, in one file, restored as it was
 *
 * The per-section CSV files are for reading in Excel; this file is for keeping and restoring:
 * every encrypted record of every kind (loans with their paid installments and extra payments,
 * incomes and fixed incomes, cheques, expense sections and expenses with their shares and
 * payments, accounts, transfers between them, categories) and every portfolio with all of its
 * entries (purchases, sales, payments of expenses, its custom categories and targets), plus the
 * user's custom banks and home page.
 *
 *   { format: 'realrate-backup', version: 1, exportedAt,
 *     records: [{ kind, id, parentId, recordDate, data }],
 *     portfolios: [{ id, name, isDefault, records: [{ kind, id, recordDate, data }] }],
 *     customBanks: [{ id, name }], homeLayout }
 *
 * The data is decrypted in the file. With a password the whole file is encrypted (AES-GCM, key
 * from PBKDF2 like the vault): { format: 'realrate-backup-encrypted', version: 1, salt, data }.
 *
 * Restoring keeps each record's id: a record already there is replaced, others are added —
 * nothing else is deleted. A portfolio not in the account is created (a new id; its entries and
 * the expenses paid from it follow), a custom bank not in the account is created by its name
 * (records pointing at it follow). Kinds of a feature the account does not have are skipped.
 */

import { e2eeEncrypt, e2eeDecrypt, deriveE2eeKey, generateE2eeSalt } from '../../lib/e2ee.js';
import { listVaultRecords, putVaultRecord } from './vaultApi.js';
import { recordDateOf } from './vaultRecordMeta.js';
import { encryptVaultRecord, decryptVaultRecord, getPortfolioKey, isAccountVaultPortfolio, createPortfolioKey } from './vaultStore.js';
import { getPortfolios, createPortfolio } from '../../features/portfolio/api/portfolioApi.js';
import { listCustomBanks, createCustomBank } from '../banks/bankApi.js';
import { getHomeLayout, saveHomeLayout } from '../../features/home/homeApi.js';

export const BACKUP_FORMAT = 'realrate-backup';
export const ENCRYPTED_BACKUP_FORMAT = 'realrate-backup-encrypted';
export const BACKUP_VERSION = 1;

/** Kinds encrypted with the account key (in the order they are restored) */
export const ACCOUNT_KINDS = [
  'category_settings', 'bank_account', 'loan', 'income', 'recurring_income', 'cheque',
  'expense_group', 'expense', 'transfer',
];
/** Kinds of a portfolio, encrypted with its own key */
export const PORTFOLIO_KINDS = ['holding', 'transaction', 'portfolio_layout'];

const SILENT = { silent: true };

/** Every page of a kind (the server may page large lists) */
async function listAll(kind, filters = {}) {
  try {
    return (await listVaultRecords(kind, SILENT, filters))?.records || [];
  } catch (err) {
    // A kind of a feature the account does not have
    if (err?.status === 404 || err?.status === 403) return [];
    throw err;
  }
}

async function decryptEach(records, decrypt) {
  const plains = await Promise.all(records.map((r) => decrypt(r.payload).catch(() => null)));
  return records.map((r, i) => ({ record: r, data: plains[i] })).filter((x) => x.data && typeof x.data === 'object');
}

/**
 * Build the backup of the whole account (the vault must be open)
 * @param {{ onProgress?: (label: string) => void }} [options]
 */
export async function buildFullBackup({ onProgress = () => {} } = {}) {
  const records = [];
  for (const kind of ACCOUNT_KINDS) {
    onProgress(kind);
    for (const { record, data } of await decryptEach(await listAll(kind), decryptVaultRecord)) {
      records.push({ kind, id: record.id, parentId: record.parentId || '', recordDate: record.recordDate || '', data });
    }
  }

  const res = await getPortfolios();
  const portfolios = [];
  for (const portfolio of (Array.isArray(res) ? res : res?.portfolios || []).filter(isAccountVaultPortfolio)) {
    onProgress(`portfolio:${portfolio.name}`);
    const key = await getPortfolioKey(portfolio);
    if (!key) continue;
    const items = [];
    for (const kind of PORTFOLIO_KINDS) {
      for (const { record, data } of await decryptEach(await listAll(kind, { parent: portfolio.id }), (p) => e2eeDecrypt(key, p))) {
        items.push({ kind, id: record.id, recordDate: record.recordDate || '', data });
      }
    }
    portfolios.push({ id: portfolio.id, name: portfolio.name || 'پورتفو', isDefault: Boolean(portfolio.isDefault), records: items });
  }

  const customBanks = ((await listCustomBanks().catch(() => null))?.banks || []).map((b) => ({ id: b.id, name: b.name }));
  const homeLayout = (await getHomeLayout().catch(() => null))?.layout || null;

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    records,
    portfolios,
    customBanks,
    homeLayout,
  };
}

/** What a backup holds, for the confirmation before restoring */
export function summarizeBackup(backup) {
  const counts = {};
  for (const r of backup.records || []) counts[r.kind] = (counts[r.kind] || 0) + 1;
  for (const p of backup.portfolios || []) for (const r of p.records || []) counts[r.kind] = (counts[r.kind] || 0) + 1;
  return { counts, portfolios: (backup.portfolios || []).length, exportedAt: backup.exportedAt || '' };
}

/** The file's text: plain JSON, or encrypted with `password` */
export async function serializeBackup(backup, password = '') {
  if (!password) return JSON.stringify(backup);
  const salt = generateE2eeSalt();
  const key = await deriveE2eeKey(password, salt);
  return JSON.stringify({ format: ENCRYPTED_BACKUP_FORMAT, version: BACKUP_VERSION, salt, data: await e2eeEncrypt(key, backup) });
}

export class BackupError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

/**
 * Read a backup file's text
 * @throws {BackupError} code NEEDS_PASSWORD (encrypted, no password), WRONG_PASSWORD, INVALID
 */
export async function parseBackup(text, password = '') {
  let parsed;
  try {
    parsed = JSON.parse(String(text || '').replace(/^﻿/, ''));
  } catch {
    throw new BackupError('این فایل پشتیبان RealRate نیست.', 'INVALID');
  }
  if (parsed?.format === ENCRYPTED_BACKUP_FORMAT) {
    if (!password) throw new BackupError('این فایل رمز دارد؛ رمز آن را وارد کنید.', 'NEEDS_PASSWORD');
    const key = await deriveE2eeKey(password, parsed.salt);
    const inner = await e2eeDecrypt(key, parsed.data).catch(() => null);
    if (!inner || typeof inner !== 'object') throw new BackupError('رمز فایل درست نیست.', 'WRONG_PASSWORD');
    parsed = inner;
  }
  if (parsed?.format !== BACKUP_FORMAT || !Array.isArray(parsed.records)) {
    throw new BackupError('این فایل پشتیبان RealRate نیست.', 'INVALID');
  }
  if (Number(parsed.version) > BACKUP_VERSION) {
    throw new BackupError('این فایل با نسخه‌ی جدیدتری از RealRate ساخته شده است؛ اپ را به‌روز کنید.', 'INVALID');
  }
  return parsed;
}

/**
 * Point the records at the ids they have in this account (portfolios and custom banks created
 * on restore get new ids). Pure.
 */
export function remapRecord(kind, data, { portfolioIds = new Map(), bankIds = new Map() } = {}) {
  let next = data;
  const swapBank = (obj) => (obj && bankIds.has(obj.bankId) ? { ...obj, bankId: bankIds.get(obj.bankId) } : obj);
  if (kind === 'loan' && next?.loan) next = { ...next, loan: swapBank(next.loan) };
  else if (kind === 'bank_account' || kind === 'cheque') next = swapBank(next);
  if (kind === 'expense' && next?.paidFrom?.portfolioId && portfolioIds.has(next.paidFrom.portfolioId)) {
    next = { ...next, paidFrom: { ...next.paidFrom, portfolioId: portfolioIds.get(next.paidFrom.portfolioId) } };
  }
  return next;
}

/**
 * Restore a backup into the open vault
 * @param {object} backup parseBackup's result
 * @param {{ onProgress?: (done: number, total: number) => void }} [options]
 * @returns {Promise<{ restored: number, skipped: number, createdPortfolios: number }>}
 */
export async function restoreFullBackup(backup, { onProgress = () => {} } = {}) {
  const total = backup.records.length + (backup.portfolios || []).reduce((n, p) => n + (p.records || []).length, 0);
  let done = 0;
  let restored = 0;
  let skipped = 0;
  const step = () => onProgress(++done, total);

  // Custom banks, by name
  const bankIds = new Map();
  const existingBanks = (await listCustomBanks().catch(() => null))?.banks || [];
  for (const bank of backup.customBanks || []) {
    const same = existingBanks.find((b) => b.id === bank.id || b.name === bank.name);
    if (same) {
      if (same.id !== bank.id) bankIds.set(bank.id, same.id);
      continue;
    }
    const created = (await createCustomBank(bank.name).catch(() => null))?.bank;
    if (created?.id) bankIds.set(bank.id, created.id);
  }

  // Portfolios: the same id, or a new one
  const portfolioIds = new Map();
  const res = await getPortfolios();
  const existing = (Array.isArray(res) ? res : res?.portfolios || []).filter(isAccountVaultPortfolio);
  const targets = [];
  for (const p of backup.portfolios || []) {
    let portfolio = existing.find((e) => e.id === p.id);
    if (!portfolio) {
      const created = await createPortfolio({ name: p.name, e2eeWrappedKey: (await createPortfolioKey()).wrapped });
      portfolio = created?.portfolio;
      if (!portfolio) {
        skipped += (p.records || []).length;
        done += (p.records || []).length;
        continue;
      }
      portfolioIds.set(p.id, portfolio.id);
    }
    targets.push({ portfolio, records: p.records || [] });
  }

  for (const { portfolio, records } of targets) {
    const key = await getPortfolioKey(portfolio);
    for (const r of records) {
      try {
        if (!key) throw new Error('locked');
        const payload = await e2eeEncrypt(key, r.data);
        await putVaultRecord(r.kind, r.id, payload, { recordDate: recordDateOf(r.kind, r.data) || r.recordDate || '', parentId: portfolio.id, silent: true });
        restored += 1;
      } catch {
        skipped += 1;
      }
      step();
    }
  }

  // Account records, sections before the expenses in them
  const order = new Map(ACCOUNT_KINDS.map((k, i) => [k, i]));
  const records = [...backup.records].sort((a, b) => (order.get(a.kind) ?? 99) - (order.get(b.kind) ?? 99));
  for (const r of records) {
    try {
      if (!order.has(r.kind)) throw new Error('unknown kind');
      const data = remapRecord(r.kind, r.data, { portfolioIds, bankIds });
      const payload = await encryptVaultRecord(data);
      await putVaultRecord(r.kind, r.id, payload, { recordDate: recordDateOf(r.kind, data) || r.recordDate || '', parentId: r.parentId || '', silent: true });
      restored += 1;
    } catch {
      skipped += 1;
    }
    step();
  }

  if (backup.homeLayout) await saveHomeLayout(backup.homeLayout).catch(() => {});
  return { restored, skipped, createdPortfolios: portfolioIds.size };
}
