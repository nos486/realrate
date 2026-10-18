/**
 * accountBalance.js — The money an account holds today («موجودی حساب»), kept up to date by the
 * records instead of by hand
 *
 * The user states what an account holds at some moment (`account.balance`: the amount in each
 * currency the account holds, and when it was stated). From then on the records move it: an
 * expense paid from the account takes its amount out (the part reimbursed to it later puts that
 * back), an income into it adds, a transfer takes its amount out of the source and brings the
 * amount less the fee into the destination. Tracking is optional per account; a bank credit keeps
 * its own debt figures (creditAccount.js) and has none.
 *
 * Only what happened after the stated moment counts — a record is after it when its day is later
 * than the balance's day, or is the same day and was saved after the balance was (`createdAt`
 * against `startAt`), so what was already in the stated amount is never counted twice. Stating the
 * balance again simply starts over from the new amount. Shared by the browser and the API, like
 * the other domain modules.
 */

import { CURRENCY_CODES, BASE_CURRENCY, normalizeCurrency, currencyRateToday } from './currencies.js';
import { accountCurrencies } from './accountDocument.js';
import { t } from './i18n.js';
import { isValidIsoDate } from './isoDate.js';

/** The largest balance accepted, in one currency's units */
export const BALANCE_LIMIT = 1e13;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const round2 = (n) => Math.round(n * 100) / 100;

/** Whether an account keeps its balance (a stated one, on a non-credit account) */
export const tracksBalance = (account) => Boolean(account?.balance && account.type !== 'credit');

/**
 * Validate & normalize an account's stated balance
 * @param {object} [body] - { amounts: { IRT: 3250000, USD: 20 }, startDate, startAt }
 * @param {string[]} currencies - the currencies the account holds: others are dropped
 * @param {{ today: string, now: string }} stamp - the moment it is stated, when the body has none
 * @returns {{ value?: object|null, error?: string }} `null`: no balance is kept
 */
export function validateBalance(body, currencies, { today, now }) {
  if (!body || typeof body !== 'object') return { value: null };
  const amounts = {};
  for (const code of CURRENCY_CODES.filter((c) => currencies.includes(c))) {
    const raw = body.amounts?.[code];
    if (raw == null || raw === '') continue;
    const value = Number(String(raw).replace(/[,\s]/g, ''));
    if (!Number.isFinite(value) || Math.abs(value) > BALANCE_LIMIT) return { error: t('موجودی حساب نامعتبر است.') };
    amounts[code] = round2(value);
  }
  const startDate = isValidIsoDate(String(body.startDate || '')) ? body.startDate : today;
  const startAt = Number.isFinite(Date.parse(body.startAt)) ? new Date(body.startAt).toISOString() : now;
  return { value: { amounts, startDate, startAt } };
}

/** Whether a record on `date`, saved at `createdAt`, came after the stated moment of `balance` */
function countsAfter(balance, date, createdAt) {
  if (!DATE_RE.test(date || '')) return false;
  if (date !== balance.startDate) return date > balance.startDate;
  return String(createdAt || '') >= balance.startAt;
}

/**
 * What an account holds today, per currency
 * @param {object} account - an account with `balance`
 * @param {{ expenses?: object[], transfers?: object[], incomes?: object[] }} records - the records
 *   from the balance's day on (others are ignored)
 * @param {string} today - YYYY-MM-DD; later records are not counted
 * @returns {Record<string, number>} e.g. { IRT: 3100000 } — every held currency has an entry
 */
export function accountBalanceOf(account, { expenses = [], transfers = [], incomes = [] } = {}, today = '9999-12-31') {
  const { balance } = account;
  const held = { ...Object.fromEntries(accountCurrencies(account).map((c) => [c, 0])), ...balance.amounts };
  const add = (code, amount) => {
    const c = normalizeCurrency(code);
    held[c] = (held[c] || 0) + amount;
  };
  for (const e of expenses) {
    const amount = Number(e.amount) || 0;
    if (e.accountId === account.id && countsAfter(balance, e.date, e.createdAt) && e.date <= today) add(e.currency, -amount);
    for (const r of e.reimbursements || []) {
      if (r.accountId === account.id && countsAfter(balance, r.date, e.updatedAt || e.createdAt) && r.date <= today) add(e.currency, Number(r.amount) || 0);
    }
  }
  for (const i of incomes) {
    if (i.accountId === account.id && countsAfter(balance, i.incomeDate, i.createdAt) && i.incomeDate <= today) add(i.currency, Number(i.amount) || 0);
  }
  for (const tr of transfers) {
    if (!countsAfter(balance, tr.date, tr.createdAt) || tr.date > today) continue;
    if (tr.fromAccountId === account.id) add(BASE_CURRENCY, -(Number(tr.amount) || 0));
    if (tr.toAccountId === account.id) add(BASE_CURRENCY, (Number(tr.amount) || 0) - (Number(tr.fee) || 0));
  }
  return Object.fromEntries(Object.entries(held).map(([c, v]) => [c, round2(v)]));
}

/**
 * The balances of every account that keeps one, and their total in tomans at today's rates
 * @param {object[]} accounts
 * @param {object} records - see accountBalanceOf
 * @param {string} today - YYYY-MM-DD
 * @param {object} [rates] - the rates bag (currencies.js)
 * @returns {{ byId: Map<string, { byCurrency: Record<string, number>, toman: number }>, totalToman: number,
 *   byCurrency: Record<string, number>, unpriced: string[], count: number }} the totals leave out
 *   archived accounts; `unpriced`: currencies with no known rate (left out of `totalToman`)
 */
export function accountBalances(accounts, records, today, rates = {}) {
  const byId = new Map();
  const total = { byId, totalToman: 0, byCurrency: {}, unpriced: [], count: 0 };
  for (const account of accounts.filter(tracksBalance)) {
    const byCurrency = accountBalanceOf(account, records, today);
    let toman = 0;
    for (const [code, amount] of Object.entries(byCurrency)) {
      const rate = currencyRateToday(code, rates);
      if (rate > 0) toman += amount * rate;
      else if (amount !== 0 && !account.archived && !total.unpriced.includes(code)) total.unpriced.push(code);
    }
    byId.set(account.id, { byCurrency, toman: Math.round(toman) });
    if (account.archived) continue;
    total.count++;
    total.totalToman += Math.round(toman);
    for (const [code, amount] of Object.entries(byCurrency)) total.byCurrency[code] = round2((total.byCurrency[code] || 0) + amount);
  }
  return total;
}

/** The earliest day a stated balance starts from (the records to read), or '' without any */
export const earliestBalanceDate = (accounts) => accounts.filter(tracksBalance).map((a) => a.balance.startDate).sort()[0] || '';
