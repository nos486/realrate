/**
 * portfolioMerge.js — Merging two of the user's portfolios into one («ادغام پورتفوها»)
 *
 * Every entry of the merged portfolio (its manual records and its transactions, with their ids
 * and dates) moves to the portfolio kept, and every record elsewhere that points at the merged
 * portfolio — an expense paid from it or invested in it, an income sold from it, a goal's assets
 * set aside in it — is pointed at the kept one. Nothing is summed or rewritten: the kept
 * portfolio reads one ledger per asset (assetLedger.js), so the same asset of both portfolios
 * becomes one row with its whole history. The merged portfolio's own layout and risk profile are
 * left behind and deleted with it.
 * Pure functions; the browser reads and writes the records (shared/vault/mergePortfolios.js).
 * Shared by the browser and the API, like the other domain modules.
 */

/** The kinds of a portfolio's own entries that move with a merge */
export const PORTFOLIO_ENTRY_KINDS = ['holding', 'transaction'];

/** Fields of account records that point at a portfolio: `{ portfolioId, portfolioName, ... }` */
export const PORTFOLIO_LINK_FIELDS = { expense: ['paidFrom', 'investedIn'], income: ['soldFrom'] };

/** The account record kinds that may point at a portfolio */
export const PORTFOLIO_LINK_KINDS = [...Object.keys(PORTFOLIO_LINK_FIELDS), 'goal'];

/** Whether two portfolios can be merged: two different portfolios */
export function canMergePortfolios(a, b) {
  return Boolean(a?.id && b?.id && a.id !== b.id);
}

/**
 * A portfolio entry (holding or transaction) as it is stored in the portfolio `intoId`
 * @param {object} entry the decrypted entry
 * @param {string} intoId
 * @returns {object}
 */
export function moveEntry(entry, intoId) {
  return { ...entry, portfolioId: intoId };
}

/**
 * A record with every reference to the portfolio `fromId` pointed at `into`
 * @param {string} kind one of PORTFOLIO_LINK_KINDS
 * @param {object} record the decrypted record
 * @param {string} fromId the merged portfolio
 * @param {{ id: string, name?: string }} into the kept portfolio (its name is shown on the links)
 * @returns {{ changed: boolean, record: object }}
 */
export function repointPortfolioRecord(kind, record, fromId, into) {
  let next = record;
  let changed = false;
  for (const field of PORTFOLIO_LINK_FIELDS[kind] || []) {
    const link = next?.[field];
    if (link && link.portfolioId === fromId) {
      next = { ...next, [field]: { ...link, portfolioId: into.id, ...(into.name ? { portfolioName: into.name } : {}) } };
      changed = true;
    }
  }
  if (kind === 'goal' && Array.isArray(next?.allocations) && next.allocations.some((a) => a?.portfolioId === fromId)) {
    next = { ...next, allocations: next.allocations.map((a) => (a?.portfolioId === fromId ? { ...a, portfolioId: into.id } : a)) };
    changed = true;
  }
  return { changed, record: next };
}
