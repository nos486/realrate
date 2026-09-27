/**
 * vaultPortfolioLayout.js — Encrypted custom category layout under the account vault
 *
 * Each portfolio can have an optional encrypted 'portfolio_layout' record in vault_records.
 * parent_id is the portfolioId, and payload is encrypted with the portfolio's own key.
 */

import { e2eeEncrypt, e2eeDecrypt } from '../../lib/e2ee.js';
import { listVaultRecords, deleteVaultRecord } from './vaultApi.js';
import { putRecord } from './vaultRecordMeta.js';
import { normalizePortfolioLayout } from '../../features/portfolio/portfolioLayoutModel.js';

const SILENT = { silent: true };
const newId = (prefix) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

/**
 * Load and decrypt custom portfolio category layout
 * @param {string} portfolioId
 * @param {CryptoKey} key - Portfolio vault key
 * @returns {Promise<{ layout: object|null, recordId: string|null }>}
 */
export async function loadPortfolioLayout(portfolioId, key) {
  if (!portfolioId || !key) return { layout: null, recordId: null };

  try {
    const res = await listVaultRecords('portfolio_layout', SILENT, { parent: portfolioId });
    const records = res?.records || [];
    if (records.length === 0) return { layout: null, recordId: null };

    // Use the first/latest record
    const record = records[0];
    const decrypted = await e2eeDecrypt(key, record.payload);
    if (!decrypted || typeof decrypted !== 'object') {
      return { layout: null, recordId: record.id };
    }

    const layout = normalizePortfolioLayout(decrypted);
    return { layout, recordId: record.id };
  } catch (err) {
    console.warn('Failed to load portfolio layout from vault:', err);
    return { layout: null, recordId: null };
  }
}

/**
 * Save custom portfolio category layout (encrypted with portfolio key)
 * @param {string} portfolioId
 * @param {CryptoKey} key - Portfolio vault key
 * @param {object} layout
 * @param {string|null} [existingRecordId]
 * @returns {Promise<{ success: boolean, layout: object, recordId: string }>}
 */
export async function savePortfolioLayoutRecord(portfolioId, key, layout, existingRecordId = null) {
  if (!portfolioId || !key) throw new Error('شناسه پورتفو و کلید رمزنگاری الزامی است.');

  const cleanLayout = normalizePortfolioLayout(layout);
  if (!cleanLayout) throw new Error('چیدمان دسته‌بندی نامعتبر است.');

  const recordId = existingRecordId || newId('layout');
  const cipher = await e2eeEncrypt(key, cleanLayout);

  await putRecord('portfolio_layout', recordId, cipher, cleanLayout, { parentId: portfolioId, ...SILENT });
  return { success: true, layout: cleanLayout, recordId };
}

/**
 * Delete custom portfolio category layout (reset to default)
 * @param {string} recordId
 * @returns {Promise<{ success: boolean }>}
 */
export async function deletePortfolioLayoutRecord(recordId) {
  if (!recordId) return { success: true };
  try {
    await deleteVaultRecord('portfolio_layout', recordId, SILENT);
  } catch (err) {
    if (err?.status !== 404) throw err;
  }
  return { success: true };
}
