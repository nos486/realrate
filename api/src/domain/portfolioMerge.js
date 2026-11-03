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
 * A record with each portfolio link (an expense's `paidFrom` / `investedIn`, an income's
 * `soldFrom`, the assets sold for the parts of a multi-source expense, a goal's allocations)
 * pointed where `resolve` says. Pure.
 * @param {string} kind one of PORTFOLIO_LINK_KINDS
 * @param {object} record the decrypted record
 * @param {(link: object) => string} resolve the portfolio id a link should have: '' or its own id leaves it
 * @param {(id: string) => string} [nameOf] the name shown on a link pointed at that portfolio
 * @returns {{ changed: boolean, record: object }}
 */
export function mapPortfolioLinks(kind, record, resolve, nameOf = () => '') {
  let changed = false;
  const relink = (link) => {
    const id = link && resolve(link);
    if (!id || id === link.portfolioId) return link;
    changed = true;
    const name = nameOf(id);
    return { ...link, portfolioId: id, ...(name ? { portfolioName: name } : {}) };
  };
  let next = record;
  for (const field of PORTFOLIO_LINK_FIELDS[kind] || []) {
    if (next?.[field]) next = { ...next, [field]: relink(next[field]) };
  }
  // An expense paid from several sources: the assets sold for its parts
  if (kind === 'expense' && Array.isArray(next?.payments)) {
    next = { ...next, payments: next.payments.map((p) => (p?.soldFrom ? { ...p, soldFrom: relink(p.soldFrom) } : p)) };
  }
  if (kind === 'goal' && Array.isArray(next?.allocations)) {
    next = { ...next, allocations: next.allocations.map((a) => relink(a)) };
  }
  return { changed, record: changed ? next : record };
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
  return mapPortfolioLinks(kind, record, (link) => (link.portfolioId === fromId ? into.id : ''), () => into.name || '');
}

/**
 * A record whose links name a portfolio that no longer exists (merged or deleted before the
 * records were pointed at the kept one), repaired: a link goes to the portfolio that holds its
 * entry (`txId` — entry ids survive a merge), else to the only portfolio left. A link to a
 * portfolio that exists is never touched. Pure.
 * @param {string} kind one of PORTFOLIO_LINK_KINDS
 * @param {object} record the decrypted record
 * @param {{ names: Map<string, string>, txParent?: Map<string, string> }} ctx `names`: the
 *   existing portfolios (id → name); `txParent`: portfolio entry id → the portfolio it is in
 * @returns {{ changed: boolean, record: object }}
 */
export function repairPortfolioRecord(kind, record, { names, txParent = new Map() }) {
  const sole = names.size === 1 ? [...names.keys()][0] : '';
  const resolve = (link) => {
    if (!link.portfolioId || names.has(link.portfolioId)) return '';
    return (link.txId && txParent.get(link.txId)) || sole;
  };
  return mapPortfolioLinks(kind, record, resolve, (id) => names.get(id) || '');
}

/** Whether a link names a portfolio that is not among `ids` (a repair is due) */
export function hasOrphanLink(kind, record, ids) {
  return mapPortfolioLinks(kind, record, (link) => (link.portfolioId && !ids.has(link.portfolioId) ? '__orphan__' : '')).changed;
}
