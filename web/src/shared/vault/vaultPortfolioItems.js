/**
 * vaultPortfolioItems.js — Holdings and transactions of a portfolio under the account vault
 *
 * Same standard as every other encrypted record: each holding / transaction is one vault record
 * whose whole content (asset, amounts, prices, notes) is ciphertext, with only its primary date
 * (buy date / transaction date) and its portfolio (parent_id) in plaintext. Items are encrypted
 * with the portfolio's own key — not the account key — so a share link carrying that key can
 * still open exactly this portfolio.
 *
 * Rows a portfolio still has in the older tables (plaintext, or encrypted in place) are moved
 * into the vault the first time the portfolio is opened; each move deletes the old row in the
 * same server batch, so an item is never lost or duplicated.
 */

import { e2eeEncrypt, e2eeDecrypt, decryptHoldingFromApi, isHoldingE2eeEncrypted } from '../../lib/e2ee.js';
import { resolveAssetDisplayName, resolveAssetUnit, resolveCategory } from '../../config/sourceRegistry.js';
import { getPortfolio, deletePortfolioHolding } from '../../features/portfolio/api/portfolioApi.js';
import { getTransactions, deleteTransaction as deleteTransactionRest } from '../../features/transactions/api/transactionApi.js';
import { listVaultRecords, deleteVaultRecord } from './vaultApi.js';
import { putRecord, backfillRecordDates, repairRecordDates } from './vaultRecordMeta.js';

const SILENT = { silent: true };
const E2EE_PREFIX = 'enc:e2ee:v1:';
const PLACEHOLDER_NAME = '[گاوصندوق E2EE]';

const newId = (prefix) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
const num = (v) => Number(v) || 0;

/** The stored content of a holding (everything is encrypted) */
function holdingRecord(portfolioId, h, now = new Date().toISOString()) {
  return {
    id: h.id || newId('h'),
    portfolioId,
    assetId: String(h.assetId || ''),
    // Only a name of its own (e.g. a custom asset): catalog names are resolved when shown
    assetName:
      h.assetName && h.assetName !== PLACEHOLDER_NAME && h.assetName !== resolveAssetDisplayName(h.assetId)
        ? String(h.assetName)
        : '',
    amount: num(h.amount),
    buyPrice: num(h.buyPrice),
    currentPrice: num(h.currentPrice),
    buyDate: String(h.buyDate || ''),
    notes: String(h.notes || ''),
    referenceAssetId: String(h.referenceAssetId || ''),
    referenceQuantity: num(h.referenceQuantity),
    createdAt: h.createdAt || now,
    updatedAt: now,
  };
}

/** Fields added only for display (or by the older storage), never stored */
const TRANSACTION_DERIVED_FIELDS = new Set([
  'isEncrypted', 'isLocked', 'rawEncrypted', 'encryptedPayload', 'encrypted_payload', 'userId',
  'assetName', 'assetType', 'category', 'unit',
]);

/**
 * The stored content of a transaction (everything is encrypted). The whole original content is
 * kept — older transactions name some fields differently (e.g. `amount` for the quantity) and the
 * screens read either name — only display-only fields are dropped.
 */
function transactionRecord(portfolioId, t, now = new Date().toISOString()) {
  const content = Object.fromEntries(Object.entries(t).filter(([k, v]) => !TRANSACTION_DERIVED_FIELDS.has(k) && v !== undefined));
  return {
    ...content,
    id: t.id || newId('tx'),
    portfolioId,
    createdAt: t.createdAt || now,
    updatedAt: now,
  };
}

/** Display fields the server used to add to holding rows (now it cannot see the asset) */
function withHoldingDisplay(h) {
  const category = resolveCategory(h.assetId);
  return {
    ...h,
    assetName: h.assetName || resolveAssetDisplayName(h.assetId),
    assetType: category,
    category,
    unit: resolveAssetUnit(h.assetId),
    isE2eeEncrypted: true,
  };
}

const asTransaction = (t) => ({ ...t, isEncrypted: true });

async function storeHolding(portfolioId, key, record, options = {}) {
  await putRecord('holding', record.id, await e2eeEncrypt(key, record), record, { parentId: portfolioId, ...options });
  return record;
}

async function storeTransaction(portfolioId, key, record, options = {}) {
  await putRecord('transaction', record.id, await e2eeEncrypt(key, record), record, { parentId: portfolioId, ...options });
  return record;
}

/**
 * Decrypt a portfolio's vault records of one kind (records this key cannot open are skipped).
 * `filters` (from / to / order / limit / offset) select them on the server by their date.
 * @returns {Promise<{ items: object[], total: number }>}
 */
async function decryptRecords(kind, portfolioId, key, filters = {}) {
  const res = await listVaultRecords(kind, SILENT, { ...filters, parent: portfolioId });
  const items = [];
  const decrypted = [];
  for (const record of res?.records || []) {
    const value = await e2eeDecrypt(key, record.payload);
    if (value && typeof value === 'object') {
      items.push({ ...value, id: record.id, portfolioId });
      decrypted.push({ record, plain: value });
    } else console.warn(`Skipped a ${kind} that could not be decrypted:`, record.id);
  }
  backfillRecordDates(kind, decrypted);
  return { items, total: res?.total ?? items.length };
}

/**
 * Move a portfolio's rows still in the older tables into the vault.
 * @returns {Promise<{ holdings: object[], transactions: object[], failed: string[] }>} the moved
 *   items (shown even when a move failed; it is retried next time) and what could not be moved
 */
export async function movePortfolioItemsToVault(portfolio, key, { onItem } = {}) {
  const [holdings, transactions] = [await moveHoldings(portfolio, key, onItem), await moveTransactions(portfolio, key, onItem)];
  return { holdings: holdings.items, transactions: transactions.items, failed: [...holdings.failed, ...transactions.failed] };
}

async function moveHoldings(portfolio, key, onItem) {
  const hRes = await getPortfolio(portfolio.id);
  const moved = { items: [], failed: [] };
  for (const row of hRes?.holdings || []) {
    const encrypted = isHoldingE2eeEncrypted(row);
    const plain = encrypted ? await decryptHoldingFromApi(key, row) : row;
    if (encrypted && plain?.isE2eeEncrypted !== true) {
      moved.failed.push(`دارایی ${row.id}`); // another key: leave the row untouched
      continue;
    }
    const record = holdingRecord(portfolio.id, plain);
    try {
      await storeHolding(portfolio.id, key, record, { replacePlain: true, ...SILENT });
    } catch {
      moved.failed.push(`دارایی «${record.assetName || record.assetId}»`);
    }
    moved.items.push(record);
    onItem?.();
  }
  return moved;
}

async function moveTransactions(portfolio, key, onItem) {
  const tRes = await getTransactions(portfolio.id);
  const moved = { items: [], failed: [] };
  for (const row of tRes?.transactions || []) {
    const raw = row.encryptedPayload || row.encrypted_payload || '';
    let payload = null;
    if (typeof raw === 'string' && raw.startsWith(E2EE_PREFIX)) payload = await e2eeDecrypt(key, raw);
    else if (typeof raw === 'string') {
      try { payload = JSON.parse(raw); } catch { payload = { notes: raw }; }
    } else if (raw && typeof raw === 'object') payload = raw;
    if (!payload || typeof payload !== 'object') {
      moved.failed.push(`تراکنش ${row.id}`);
      continue;
    }
    const record = transactionRecord(portfolio.id, { ...payload, id: row.id, createdAt: row.createdAt });
    try {
      await storeTransaction(portfolio.id, key, record, { replacePlain: true, ...SILENT });
    } catch {
      moved.failed.push(`تراکنش ${record.transactionDate || record.id}`);
    }
    moved.items.push(record);
    onItem?.();
  }
  return moved;
}

// ── Holdings ────────────────────────────────────────────────────────────────

/** Every holding of the portfolio, decrypted (older rows are moved into the vault first) */
export async function listPortfolioHoldings(portfolio, key) {
  const moved = await moveHoldings(portfolio, key);
  const { items: stored } = await decryptRecords('holding', portfolio.id, key);
  const byId = new Map(stored.map((h) => [h.id, h]));
  for (const h of moved.items) if (!byId.has(h.id)) byId.set(h.id, h);
  return [...byId.values()]
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .map(withHoldingDisplay);
}

/** Create or update a holding */
export async function savePortfolioHolding(portfolio, key, data) {
  const record = holdingRecord(portfolio.id, data);
  await storeHolding(portfolio.id, key, record);
  return { success: true, holding: withHoldingDisplay(record) };
}

/** Delete a holding (one not moved into the vault yet is deleted from the older table) */
export async function deletePortfolioHoldingRecord(id) {
  try {
    await deleteVaultRecord('holding', id);
  } catch (err) {
    if (err?.status !== 404) throw err;
    await deletePortfolioHolding(id);
  }
  return { success: true };
}

// ── Transactions ────────────────────────────────────────────────────────────

/**
 * Moving a portfolio's older transaction rows, per portfolio: shared by concurrent queries, and
 * kept once the table is empty (nothing new can land there)
 */
const transactionMoves = new Map();

function moveTransactionsOnce(portfolio, key) {
  if (!transactionMoves.has(portfolio.id)) {
    const run = moveTransactions(portfolio, key);
    transactionMoves.set(portfolio.id, run);
    run.then(
      (moved) => { if (moved.failed.length) transactionMoves.delete(portfolio.id); },
      () => transactionMoves.delete(portfolio.id)
    );
    return run;
  }
  // Rows already shown by the query that moved them
  return transactionMoves.get(portfolio.id).then(() => ({ items: [], failed: [] }));
}

/**
 * The portfolio's transactions, decrypted: every one, or those `filters` select by date on the
 * server ({ from, to, order, limit, offset }; older rows are moved into the vault first).
 * @returns {Promise<{ transactions: object[], total: number }>}
 */
export async function queryPortfolioTransactions(portfolio, key, filters = {}) {
  const moved = await moveTransactionsOnce(portfolio, key);
  await repairRecordDates('transaction', (payload) => e2eeDecrypt(key, payload), portfolio.id);
  const { items: stored, total } = await decryptRecords('transaction', portfolio.id, key, filters);
  const filtered = Boolean(filters.from || filters.to || filters.limit);
  const byId = new Map(stored.map((t) => [t.id, t]));
  // A row whose move failed is still shown (it is retried next time) — only in the full list
  if (!filtered) for (const t of moved.items) if (!byId.has(t.id)) byId.set(t.id, t);
  const list = [...byId.values()];
  if (!filtered) list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return { transactions: list.map(asTransaction), total: filtered ? total : list.length };
}

/** Every transaction of the portfolio (or those from a date on), decrypted */
export async function listPortfolioTransactions(portfolio, key, filters = {}) {
  return (await queryPortfolioTransactions(portfolio, key, filters)).transactions;
}

/** Create (id empty) or update a transaction */
export async function savePortfolioTransaction(portfolio, key, id, data) {
  const record = transactionRecord(portfolio.id, { ...data, id: id || undefined });
  await storeTransaction(portfolio.id, key, record);
  return { success: true, transaction: asTransaction(record) };
}

export async function deletePortfolioTransactionRecord(portfolioId, id) {
  try {
    await deleteVaultRecord('transaction', id);
  } catch (err) {
    if (err?.status !== 404) throw err;
    await deleteTransactionRest(portfolioId, id);
  }
  return { success: true };
}

// ── Shared portfolio (viewer holding the link key) ───────────────────────────

/** Decrypt the vault records a share-link response carries */
export async function decryptSharedItems(key, { vaultHoldings = [], vaultTransactions = [] }) {
  const open = async (records) => {
    const out = [];
    for (const r of records) {
      const value = await e2eeDecrypt(key, r.payload);
      if (value && typeof value === 'object') out.push({ ...value, id: r.id });
    }
    return out;
  };
  return {
    holdings: (await open(vaultHoldings)).map(withHoldingDisplay),
    transactions: (await open(vaultTransactions)).map(asTransaction),
  };
}
