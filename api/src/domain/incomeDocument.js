/**
 * incomeDocument.js — An income: its validation, and what it is worth in tomans and in dollars
 *
 * An income is an end-to-end encrypted vault record (web/src/shared/vault/vaultIncomes.js), so it
 * is validated in the browser — here, shared, like the other documents. It is in tomans or a
 * foreign currency (currencies.js: dollar, euro, lira, dirham), and never stores a rate: its
 * currency's toman rate is read from the daily price history by its day (the rates bag:
 * `usdAt` / `rateAt`, web features/market/useFxRates.js), today's when that day is unknown.
 *
 * It names the account it came into (`accountId`), as an expense names the one that paid it.
 * Its category may link it to a record (categoryLinks.js): «تسویه بدهی اعتباری» the bank credit
 * whose debt it pays (`creditAccountId`). Received with a cheque, of any category, it names the
 * cheque (`chequeId`, a payment link). A sale from a portfolio names its «sell» entry
 * (`soldFrom`, portfolioLink.js). A bank credit, a cheque, a bank SMS (`smsKey`) and a row of an
 * imported bank statement (`source: 'import'`, `bankId`, `importKey`: bankStatement.js) are in
 * tomans, so those links are kept on a toman income only.
 */

import { isCategoryValue } from './categoryDocument.js';
import { categoryLinkFields, paymentLinkFields } from './categoryLinks.js';
import { validatePortfolioLink } from './portfolioLink.js';
import { isRecordOwner } from './recordOwners.js';
import { dollarValueOf } from './dollarValue.js';
import { BASE_CURRENCY, normalizeCurrency, currencyRateOn, currencyRateToday } from './currencies.js';
import { t } from './i18n.js';

export const INCOME_LIMITS = {
  titleLength: 120,
  notesLength: 500,
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const text = (v) => String(v ?? '').trim();

/**
 * Validate & normalize an income
 * @returns {{ value?: object, error?: string }}
 */
export function validateIncome(body = {}) {
  const title = text(body.title);
  const amount = Number(body.amount);
  const incomeDate = text(body.incomeDate ?? body.income_date);
  const notes = text(body.notes);
  const currency = normalizeCurrency(body.currency);
  const category = isCategoryValue('income', body.category) ? body.category : 'other';

  if (!title) return { error: t('عنوان درآمد الزامی است.') };
  if (title.length > INCOME_LIMITS.titleLength) return { error: t('عنوان درآمد نباید بیشتر از {titleLength} کاراکتر باشد.', { titleLength: INCOME_LIMITS.titleLength }) };
  if (!Number.isFinite(amount) || amount <= 0) return { error: t('مبلغ درآمد باید عددی بزرگتر از صفر باشد.') };
  if (!ISO_DATE_RE.test(incomeDate) || Number.isNaN(new Date(incomeDate).getTime())) return { error: t('تاریخ دریافت درآمد نامعتبر است.') };
  if (notes.length > INCOME_LIMITS.notesLength) return { error: t('یادداشت نباید بیشتر از {notesLength} کاراکتر باشد.', { notesLength: INCOME_LIMITS.notesLength }) };

  // Sold from a portfolio: its «sell» entry (always returned, so an edit can remove it)
  const sold = validatePortfolioLink(body.soldFrom);
  if (sold.error) return { error: sold.error };

  // A bank credit, a cheque and a bank SMS are in tomans: their links stay on a toman income only
  const toman = currency === BASE_CURRENCY;
  const links = toman ? { ...categoryLinkFields('income', category, body), ...paymentLinkFields('income', body) } : {};
  // Recorded from a bank SMS: the transaction's key (bankSms.js), so it is not recorded twice
  const smsKey = toman ? text(body.smsKey).slice(0, 120) : '';
  // Read from an exported bank statement: the row's key, so a file imported twice records nothing twice
  const importKey = toman && body.source === 'import' ? text(body.importKey).slice(0, 120) : '';

  // The account it came into (an accountDocument.js account); older incomes have none
  const accountId = ID_RE.test(text(body.accountId)) ? text(body.accountId) : '';

  return {
    value: {
      title, category, amount, currency, incomeDate, notes, soldFrom: sold.link, accountId,
      ...(smsKey ? { smsKey } : {}),
      ...(importKey ? { source: 'import', importKey, bankId: text(body.bankId).slice(0, 64) } : {}),
      // Always returned, so an edit to another category (or currency) drops them
      creditAccountId: links.creditAccountId || '',
      chequeId: links.chequeId || '',
      // Recorded by another feature (a cleared cheque): changed only from its page (recordOwners.js)
      ...(isRecordOwner(body.recordedBy) ? { recordedBy: body.recordedBy } : {}),
    },
  };
}

/**
 * Its currency's toman rate on its day, from the price history (1 for tomans; 0 when unknown)
 * @param {object} income
 * @param {object} [rates] the rates bag (currencies.js)
 */
export function incomeCurrencyRate(income, rates = {}) {
  return currencyRateOn(income?.currency, income?.incomeDate, rates);
}

/**
 * An income in tomans: as recorded, or a foreign amount at its day's rate, else today's
 * @returns {number|null} null for a foreign income with no rate at all
 */
export function incomeInToman(income, rates = {}) {
  const amount = Number(income?.amount) || 0;
  const currency = normalizeCurrency(income?.currency);
  if (currency === BASE_CURRENCY) return amount;
  const rate = incomeCurrencyRate(income, rates) || currencyRateToday(currency, rates);
  return rate > 0 ? amount * rate : null;
}

/**
 * An income in dollars at the dollar's rate on the day it came in, and what those dollars are
 * worth today (dollarValue.js): a dollar income as it is; another one through its tomans that day
 * @param {object} income
 * @param {object} [rates] the rates bag (currencies.js)
 * @returns {object|null} null while that day's rates are unknown
 */
export function incomeDollarValue(income, rates = {}) {
  const usdToman = Number(rates.usdToman) || 0;
  const amount = Number(income?.amount) || 0;
  const usdRate = currencyRateOn('USD', income?.incomeDate, rates);
  if (normalizeCurrency(income?.currency) === 'USD') {
    if (usdRate > 0) return dollarValueOf(amount * usdRate, usdRate, usdToman);
    return amount > 0 ? { usd: amount, paidToman: null, todayToman: usdToman > 0 ? amount * usdToman : null, changePct: null } : null;
  }
  return dollarValueOf(amount * incomeCurrencyRate(income, rates), usdRate, usdToman);
}

/**
 * Incomes' sums per currency as recorded (`byCurrency`), and everything in tomans (`totalToman`;
 * `unpriced`: foreign amounts left out because no rate is known)
 * @returns {{ totalToman: number, byCurrency: Record<string, number>, unpriced: Record<string, number> }}
 */
export function summarizeIncomes(incomes = [], rates = {}) {
  const summary = { totalToman: 0, byCurrency: {}, unpriced: {} };
  for (const income of incomes) {
    const currency = normalizeCurrency(income.currency);
    const amount = Number(income.amount) || 0;
    summary.byCurrency[currency] = (summary.byCurrency[currency] || 0) + amount;
    const toman = incomeInToman(income, rates);
    if (toman === null) summary.unpriced[currency] = (summary.unpriced[currency] || 0) + amount;
    else summary.totalToman += toman;
  }
  return summary;
}
