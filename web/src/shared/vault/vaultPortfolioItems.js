/**
 * vaultPortfolioItems.js — Holdings and transactions of a portfolio under the account vault
 *
 * Same standard as every other encrypted record: each holding / transaction is one vault record
 * whose whole content (asset, amounts, prices, notes) is ciphertext, with only its primary date
 * (buy date / transaction date) and its portfolio (parent_id) in plaintext. Items are encrypted
 * with the portfolio's own key — not the account key — so a share link carrying that key can
 * still open exactly this portfolio.
 */

import { e2eeEncrypt, e2eeDecrypt, e2eeDecryptMany } from '../../lib/e2ee.js';
import { resolveAssetDisplayName, resolveAssetUnit, resolveCategory } from '../../config/sourceRegistry.js';
import { listVaultRecords, deleteVaultRecord } from './vaultApi.js';
import { putRecord, backfillRecordDates, repairRecordDates } from './vaultRecordMeta.js';
import { migrateRecordPriceIds, withPriceIdVersion } from '../../utils/priceIds.js';
import { getKnownPriceIds } from '../../features/market/knownPriceIds.js';
import { isDemoReadOnly } from '../../features/demo/index.js';
import { getPortfolioKey, isAccountVaultPortfolio } from './vaultStore.js';

const SILENT = { silent: true };
const PLACEHOLDER_NAME = '[گاوصندوق E2EE]'; // i18n-ignore

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
    // Bought with a loan («تأمین از», utils/loanFunding.js), or '' for the user's own money
    loanId: /^[A-Za-z0-9_-]{1,64}$/.test(String(h.loanId || '')) ? String(h.loanId) : '',
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

// Everything stored carries price book ids, stamped with their version (priceIds.js)
async function storeHolding(portfolioId, key, holding, options = {}) {
  const record = withPriceIdVersion(holding, getKnownPriceIds());
  await putRecord('holding', record.id, await e2eeEncrypt(key, record), record, { parentId: portfolioId, ...options });
  return record;
}

async function storeTransaction(portfolioId, key, transaction, options = {}) {
  const record = withPriceIdVersion(transaction, getKnownPriceIds());
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
  const migrated = [];
  const knownIds = getKnownPriceIds();
  // Decrypted together (WebCrypto works in parallel), then read in order
  const records = res?.records || [];
  const plains = await e2eeDecryptMany(key, records.map((r) => r.payload));
  for (const [i, record] of records.entries()) {
    const stored = plains[i];
    if (stored && typeof stored === 'object') {
      // Asset ids saved in an older form become the price book's id
      const { changed, record: value } = migrateRecordPriceIds(stored, knownIds);
      if (changed) migrated.push({ ...value, id: record.id, portfolioId });
      items.push({ ...value, id: record.id, portfolioId });
      decrypted.push({ record, plain: value });
    } else console.warn(`Skipped a ${kind} that could not be decrypted:`, record.id);
  }
  if (!isDemoReadOnly()) {
    backfillRecordDates(kind, decrypted);
    storeMigrated(kind, portfolioId, key, migrated);
  }
  return { items, total: res?.total ?? items.length };
}

/** Save records whose ids were migrated (in the background; a failure is retried on the next read) */
function storeMigrated(kind, portfolioId, key, records) {
  if (records.length === 0) return;
  const store = kind === 'holding' ? storeHolding : storeTransaction;
  (async () => {
    for (const record of records) {
      try {
        await store(portfolioId, key, record, SILENT);
      } catch {
        // Migrated again next time
      }
    }
  })();
}

// ── Holdings ────────────────────────────────────────────────────────────────

/** Every holding of the portfolio, decrypted */
export async function listPortfolioHoldings(portfolio, key) {
  const { items } = await decryptRecords('holding', portfolio.id, key);
  return items
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .map(withHoldingDisplay);
}

/**
 * The holdings of every portfolio under the account vault, decrypted (reports across
 * portfolios, e.g. what a loan bought)
 * @param {object[]} portfolios the user's portfolios (getPortfolios)
 */
export async function listAccountHoldings(portfolios = []) {
  const lists = await Promise.all(portfolios.filter(isAccountVaultPortfolio).map(async (portfolio) => {
    const key = await getPortfolioKey(portfolio);
    return key ? (await decryptRecords('holding', portfolio.id, key)).items.map(withHoldingDisplay) : [];
  }));
  return lists.flat();
}

/** Create or update a holding */
export async function savePortfolioHolding(portfolio, key, data) {
  const record = holdingRecord(portfolio.id, data);
  await storeHolding(portfolio.id, key, record);
  return { success: true, holding: withHoldingDisplay(record) };
}

/** Delete a holding */
export async function deletePortfolioHoldingRecord(id) {
  await deleteVaultRecord('holding', id);
  return { success: true };
}

// ── Transactions ────────────────────────────────────────────────────────────

/**
 * The portfolio's transactions, decrypted: every one, or those `filters` select by date on the
 * server ({ from, to, order, limit, offset }).
 * @returns {Promise<{ transactions: object[], total: number }>}
 */
export async function queryPortfolioTransactions(portfolio, key, filters = {}) {
  await repairRecordDates('transaction', (payload) => e2eeDecrypt(key, payload), portfolio.id);
  const { items: list, total } = await decryptRecords('transaction', portfolio.id, key, filters);
  const filtered = Boolean(filters.from || filters.to || filters.limit);
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

/** Delete a transaction (`portfolioId`: the portfolio it belongs to) */
export async function deletePortfolioTransactionRecord(portfolioId, id) {
  await deleteVaultRecord('transaction', id);
  return { success: true };
}

// ── Shared portfolio (viewer holding the link key) ───────────────────────────

/** Decrypt the vault records a share-link response carries */
export async function decryptSharedItems(key, { vaultHoldings = [], vaultTransactions = [], vaultLayout = [] }) {
  const open = async (records) => {
    const out = [];
    for (const r of records) {
      const value = await e2eeDecrypt(key, r.payload);
      if (value && typeof value === 'object') out.push({ ...value, id: r.id });
    }
    return out;
  };

  let layout = null;
  if (Array.isArray(vaultLayout) && vaultLayout.length > 0) {
    try {
      const dec = await e2eeDecrypt(key, vaultLayout[0].payload);
      if (dec && typeof dec === 'object') layout = dec;
    } catch {
      // Ignore layout decryption failure
    }
  }

  return {
    holdings: (await open(vaultHoldings)).map(withHoldingDisplay),
    transactions: (await open(vaultTransactions)).map(asTransaction),
    layout,
  };
}
