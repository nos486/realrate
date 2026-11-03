/**
 * repairPortfolioLinks.js — Records pointing at a portfolio that no longer exists, pointed at the right one
 *
 * An expense, income or goal linked to a portfolio (paid from it, invested in it, sold from it,
 * assets set aside in it) keeps that portfolio's id. When a portfolio was merged into another (or
 * deleted) before its links were moved, they would name a portfolio that is gone: editing or
 * deleting the record then fails and the lists show the old name. This finds such links and
 * points each at the portfolio that holds its entry (entry ids survive a merge), else at the
 * only portfolio left (domain/portfolioMerge.js repairPortfolioRecord).
 *
 * Run by the portfolio page whenever the set of portfolios differs from the last time it was
 * checked on this device, so a normal visit reads nothing but the portfolio list.
 */

import { PORTFOLIO_LINK_KINDS, hasOrphanLink, repairPortfolioRecord } from '../../utils/portfolioMerge.js';
import { listAll, storeAll } from './mergePortfolios.js';
import { recordDateOf } from './vaultRecordMeta.js';
import { isDemoReadOnly } from '../../features/demo/index.js';
import { encryptVaultRecord, decryptVaultRecords, isAccountVaultPortfolio } from './vaultStore.js';

const CHECKED_KEY = 'realrate_portfolio_links_checked';

const signatureOf = (portfolios) => portfolios.map((p) => p.id).sort().join(',');

function readChecked() {
  try {
    return localStorage.getItem(CHECKED_KEY);
  } catch {
    return null;
  }
}

function writeChecked(signature) {
  try {
    localStorage.setItem(CHECKED_KEY, signature);
  } catch {
    // Checked again next visit
  }
}

/**
 * Repair the portfolio links of the account's records when the portfolios changed since the last check
 * @param {object[]} portfolios the user's portfolios (getPortfolios); the vault must be open
 * @returns {Promise<number>} records pointed at another portfolio
 */
export async function repairPortfolioLinks(portfolios) {
  const mine = portfolios.filter(isAccountVaultPortfolio);
  const signature = signatureOf(mine);
  if (!mine.length || isDemoReadOnly() || readChecked() === signature) return 0;

  const names = new Map(mine.map((p) => [p.id, p.name || '']));
  const ids = new Set(names.keys());

  // Only records with a link to a portfolio that is gone need anything
  const orphans = [];
  for (const kind of PORTFOLIO_LINK_KINDS) {
    const records = await listAll(kind);
    const plains = await decryptVaultRecords(records.map((r) => r.payload));
    records.forEach((record, i) => {
      if (plains[i] && hasOrphanLink(kind, plains[i], ids)) orphans.push({ kind, record, plain: plains[i] });
    });
  }

  let repaired = 0;
  if (orphans.length > 0) {
    // Which portfolio holds each entry: the records' own parent ids, nothing is decrypted
    const txParent = new Map((await listAll('transaction')).map((r) => [r.id, r.parentId]));
    for (const kind of PORTFOLIO_LINK_KINDS) {
      const changed = [];
      for (const o of orphans.filter((x) => x.kind === kind)) {
        const result = repairPortfolioRecord(kind, o.plain, { names, txParent });
        if (result.changed) changed.push({ record: o.record, plain: result.record });
      }
      await storeAll(kind, await Promise.all(changed.map(async ({ record, plain }) => ({
        id: record.id,
        payload: await encryptVaultRecord(plain),
        recordDate: record.recordDate || recordDateOf(kind, plain),
        parentId: record.parentId || '',
      }))));
      repaired += changed.length;
    }
  }
  writeChecked(signature);
  return repaired;
}
