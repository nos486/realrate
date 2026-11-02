/**
 * mergePortfolios.js — «ادغام پورتفوها»: every entry of one portfolio moved to another
 *
 * Runs in the browser (the entries are end-to-end encrypted, each portfolio with its own key):
 *   1. the merged portfolio's holdings and transactions are decrypted with its key and stored
 *      again under the kept portfolio, encrypted with the kept one's key — same ids and dates,
 *      VAULT_BATCH_MAX at a time;
 *   2. expenses, incomes and goals pointing at the merged portfolio are pointed at the kept one
 *      (utils/portfolioMerge.js); only the records that changed are stored again;
 *   3. the kept portfolio becomes the default when the merged one was;
 *   4. the merged portfolio is deleted (with its own layout and risk profile).
 * Nothing is deleted before everything is moved, so an interrupted merge is simply run again.
 */

import { e2eeEncrypt, e2eeDecryptMany } from '../../lib/e2ee.js';
import {
  PORTFOLIO_ENTRY_KINDS,
  PORTFOLIO_LINK_KINDS,
  canMergePortfolios,
  moveEntry,
  repointPortfolioRecord,
} from '../../utils/portfolioMerge.js';
import { listVaultRecords, putVaultRecords, VAULT_BATCH_MAX } from './vaultApi.js';
import { recordDateOf } from './vaultRecordMeta.js';
import { encryptVaultRecord, decryptVaultRecords, getPortfolioKey } from './vaultStore.js';
import { updatePortfolio, deletePortfolio } from '../../features/portfolio/api/portfolioApi.js';
import { t } from '../../utils/i18n.js';

const SILENT = { silent: true };

/** A kind of a feature the account does not have has nothing to move */
async function listAll(kind, filters = {}) {
  try {
    return (await listVaultRecords(kind, SILENT, filters))?.records || [];
  } catch (err) {
    if (err?.status === 404 || err?.status === 403) return [];
    throw err;
  }
}

/** Store records of one kind, VAULT_BATCH_MAX per request */
async function storeAll(kind, items) {
  for (let from = 0; from < items.length; from += VAULT_BATCH_MAX) {
    await putVaultRecords(kind, items.slice(from, from + VAULT_BATCH_MAX), SILENT);
  }
}

/**
 * Move every entry of `merged` to `keep` and delete `merged`
 * @param {object} keep the portfolio that stays
 * @param {object} merged the portfolio merged into it (deleted)
 * @param {{ onProgress?: (step: 'entries'|'links'|'delete') => void }} [options]
 * @returns {Promise<{ moved: number, relinked: number }>} entries moved, and records elsewhere
 *   pointed at the kept portfolio
 */
export async function mergePortfolios(keep, merged, { onProgress = () => {} } = {}) {
  if (!canMergePortfolios(keep, merged)) throw new Error(t('این دو پورتفو قابل ادغام نیستند.'));
  const [fromKey, intoKey] = await Promise.all([getPortfolioKey(merged), getPortfolioKey(keep)]);
  if (!fromKey || !intoKey) throw new Error(t('پورتفو قفل است، ابتدا آن را باز کنید.'));

  onProgress('entries');
  let moved = 0;
  for (const kind of PORTFOLIO_ENTRY_KINDS) {
    const records = await listAll(kind, { parent: merged.id });
    const plains = await e2eeDecryptMany(fromKey, records.map((r) => r.payload));
    // An entry that cannot be opened would be lost with the portfolio: stop before anything changes
    if (plains.some((p) => !p || typeof p !== 'object')) {
      throw new Error(t('بعضی از ردیف‌های این پورتفو باز نشد؛ ادغام انجام نشد.'));
    }
    const items = await Promise.all(records.map(async (record, i) => {
      const plain = moveEntry({ ...plains[i], id: record.id }, keep.id);
      return {
        id: record.id,
        payload: await e2eeEncrypt(intoKey, plain),
        recordDate: record.recordDate || recordDateOf(kind, plain),
        parentId: keep.id,
      };
    }));
    await storeAll(kind, items);
    moved += items.length;
  }

  onProgress('links');
  let relinked = 0;
  for (const kind of PORTFOLIO_LINK_KINDS) {
    const records = await listAll(kind);
    const plains = await decryptVaultRecords(records.map((r) => r.payload));
    const changed = [];
    records.forEach((record, i) => {
      if (!plains[i] || typeof plains[i] !== 'object') return;
      const result = repointPortfolioRecord(kind, plains[i], merged.id, keep);
      if (result.changed) changed.push({ record, plain: result.record });
    });
    await storeAll(kind, await Promise.all(changed.map(async ({ record, plain }) => ({
      id: record.id,
      payload: await encryptVaultRecord(plain),
      recordDate: record.recordDate || recordDateOf(kind, plain),
      parentId: record.parentId || '',
    }))));
    relinked += changed.length;
  }

  onProgress('delete');
  // The account's cash and the home cards follow the default portfolio
  if (merged.isDefault && !keep.isDefault) await updatePortfolio({ id: keep.id, isDefault: true }, SILENT);
  const res = await deletePortfolio(merged.id);
  if (res && res.success === false) throw new Error(res.message || t('حذف پورتفوی ادغام‌شده ممکن نشد.'));
  return { moved, relinked };
}
