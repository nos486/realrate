/**
 * portfolioLink.js — An expense or income that is also a portfolio entry
 *
 * Money put into an asset (an expense in «سرمایه‌گذاری») or taken out of one (an income in «فروش
 * دارایی») is recorded once, where the money moved, and its portfolio gets the matching entry:
 *
 *   { portfolioId, portfolioName, assetId, quantity, txId }
 *
 * - expense.investedIn: a «buy» transaction `txId` of `quantity` at the expense's tomans / quantity
 * - income.soldFrom: a «sell» transaction `txId` of `quantity` at the income's tomans / quantity
 * The transaction is written by the browser (web/src/shared/vault/portfolioFunds.js), carries the
 * record's id (expenseId / incomeId) and no title — a shared portfolio link must not reveal the
 * user's expenses or incomes — and is changed or removed with the record. Shared by the browser
 * and the API, like the other domain modules.
 */

const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const MAX_ASSET_ID = 160;
const MAX_NAME = 80;
const text = (v) => String(v ?? '').trim();

/**
 * Validate a link, or none
 * @param {object|null|undefined} raw
 * @returns {{ link?: object|null, error?: string }}
 */
export function validatePortfolioLink(raw) {
  if (!raw) return { link: null };
  const portfolioId = text(raw.portfolioId);
  const txId = text(raw.txId);
  const assetId = text(raw.assetId);
  if (!ID_RE.test(portfolioId) || !ID_RE.test(txId)) return { error: 'پورتفوی انتخاب‌شده نامعتبر است.' };
  // eslint-disable-next-line no-control-regex
  if (!assetId || assetId.length > MAX_ASSET_ID || /[\u0000-\u001f]/.test(assetId)) return { error: 'دارایی انتخاب‌شده نامعتبر است.' };
  const quantity = Number(raw.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1e15) return { error: 'مقدار دارایی باید بیشتر از صفر باشد.' };
  return {
    link: {
      portfolioId,
      portfolioName: text(raw.portfolioName).slice(0, MAX_NAME),
      assetId,
      quantity,
      txId,
    },
  };
}

/** Whether two links are the same portfolio entry (the same transaction in the same portfolio) */
export function sameLink(a, b) {
  return Boolean(a && b && a.portfolioId === b.portfolioId && a.txId === b.txId);
}

/** Whether a link being chosen in a form is complete enough to save */
export function isLinkComplete(link) {
  return Boolean(link?.portfolioId && link.assetId && Number(link.quantity) > 0);
}
