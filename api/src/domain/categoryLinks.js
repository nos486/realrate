/**
 * categoryLinks.js — Which records an income or an expense is linked to: by its category, and by
 * how it was paid
 *
 * One table for every such link, so a form, the encrypted store and the reports read the same
 * rule: an expense in «سرمایه‌گذاری» names the asset it bought, one in «پرداخت قسط» the loan
 * installment it paid, one in «اینترنت و اشتراک‌ها» the subscription; an income in «فروش دارایی»
 * names the asset sold, one in «تسویه بدهی اعتباری» the credit it paid.
 * A cheque is not a category but a way of paying (PAYMENT_LINKS): an expense of any category may
 * be paid with an issued cheque, an income received with a received one (`chequeId`).
 *
 * Each link: `category` (a built-in category key), `target` (what kind of record it names) and
 * `field` (where the record keeps it). A record keeps only the link its category declares — an
 * edit to another category drops it (linkFieldsFor). The id links' values are checked here
 * (validateLinkValue); the portfolio ones by portfolioLink.js. What linking does to the target
 * (a cheque marked cleared, an installment marked paid, a subscription moved on) is the
 * encrypted store's (web/src/shared/vault/recordLinks.js), so every path that saves a record —
 * a form, a bank SMS, the cheques page — keeps both sides in step.
 * Shared by the browser and the API, like the other domain modules.
 */

/** The record sides that link by category */
export const LINK_SIDES = ['expense', 'income'];

/** What a category links to: the picker each target shows is the form's (CategoryLinkField) */
export const CATEGORY_LINKS = {
  expense: [
    { category: 'investment', target: 'portfolio', field: 'investedIn' },
    { category: 'installments', target: 'loan_installment', field: 'loanInstallment' },
    { category: 'subscriptions', target: 'subscription', field: 'subscriptionId' },
  ],
  income: [
    { category: 'asset_sale', target: 'portfolio', field: 'soldFrom' },
    { category: 'credit_settlement', target: 'credit_account', field: 'creditAccountId' },
  ],
};

/** How a record was paid or received, whatever its category: with a cheque */
export const PAYMENT_LINKS = {
  expense: [{ method: 'cheque', target: 'cheque', field: 'chequeId' }],
  income: [{ method: 'cheque', target: 'cheque', field: 'chequeId' }],
};

/** Every link of a side — by category and by payment — for what linking does (recordLinks.js) */
export function recordLinksOf(side) {
  return [...(CATEGORY_LINKS[side] || []), ...(PAYMENT_LINKS[side] || [])];
}

/**
 * The payment links a record carries, checked, as `{ [field]: value }` (any category)
 * @param {'expense'|'income'} side
 * @param {object} body the record as sent
 */
export function paymentLinkFields(side, body = {}) {
  const out = {};
  for (const link of PAYMENT_LINKS[side] || []) {
    const value = validateLinkValue(link.target, body?.[link.field]);
    if (value) out[link.field] = value;
  }
  return out;
}

/** The cheque direction each side pays or receives through */
export const CHEQUE_DIRECTION_OF = { expense: 'issued', income: 'received' };

/** The targets whose value is a plain record id */
const ID_TARGETS = new Set(['subscription', 'cheque', 'credit_account']);
const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

/**
 * The link a category declares for a side, or null
 * @param {'expense'|'income'} side
 * @param {string} category
 * @returns {{ category: string, target: string, field: string }|null}
 */
export function categoryLinkOf(side, category) {
  return (CATEGORY_LINKS[side] || []).find((l) => l.category === category) || null;
}

/** Every link field of a side, by category and by payment (e.g. to drop the ones a record no longer has) */
export function linkFieldsOf(side) {
  return recordLinksOf(side).map((l) => l.field);
}

/**
 * A link's value checked: an id for an id target, `{ loanId, installmentId }` for a loan
 * installment; '' / null when missing or malformed. (Portfolio links: portfolioLink.js.)
 * @param {string} target
 * @param {unknown} raw
 */
export function validateLinkValue(target, raw) {
  if (ID_TARGETS.has(target)) {
    const id = String(raw ?? '').trim();
    return ID_RE.test(id) ? id : '';
  }
  if (target === 'loan_installment') {
    const loanId = String(raw?.loanId ?? '').trim();
    const installmentId = String(raw?.installmentId ?? '').trim();
    return ID_RE.test(loanId) && ID_RE.test(installmentId) ? { loanId, installmentId } : null;
  }
  return null;
}

/**
 * The id-style link a record of this category carries, as `{ [field]: value }` — empty when the
 * category declares none, or the value is missing (portfolio links are validated apart)
 * @param {'expense'|'income'} side
 * @param {string} category
 * @param {object} body the record as sent
 */
export function categoryLinkFields(side, category, body = {}) {
  const link = categoryLinkOf(side, category);
  if (!link || link.target === 'portfolio') return {};
  const value = validateLinkValue(link.target, body?.[link.field]);
  return value ? { [link.field]: value } : {};
}

/** Whether two link values name the same record */
export function sameLinkValue(a, b) {
  if (!a || !b) return !a && !b;
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  return a.loanId === b.loanId && a.installmentId === b.installmentId;
}
