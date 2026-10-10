/**
 * currencies.js — The currencies money is recorded in (accounts, expenses, subscriptions), and
 * how an amount in one becomes tomans
 *
 * One table: a new currency is one row here — its code, its Persian name, its price book id (its
 * toman rate, today and on any past day from the daily price history) and its decimals. Everything
 * else (forms, totals, account cards, reports) reads this table; nothing branches on a code
 * except the dollar, which is also the app's reference currency (the «≈ X دلار» view).
 *
 * Rates: what a currency costs in tomans. The functions take the rates bag the screens build
 * (web features/market/useFxRates.js): `usdToman` / `usdAt(isoDate)` for the dollar (as before),
 * and `rateToday(code)` / `rateAt(code, isoDate)` for every other foreign currency.
 *
 * Shared with the web (web/src/utils/currencies.js is a symlink): no Worker bindings.
 */

/** The base currency: amounts are totalled in tomans */
export const BASE_CURRENCY = 'IRT';

/**
 * @typedef {{ code: string, label: string, adjective: string, symbol: string, priceId: string|null, decimals: number }} Currency
 * `adjective`: «یورویی» (an account's, a total's); `priceId`: its toman rate in the price book
 * (null for the toman itself)
 */
/** @type {Currency[]} the app's order (pickers, totals) */
export const CURRENCIES = [
  { code: 'IRT', label: 'تومان', adjective: 'تومانی', symbol: 'تومان', priceId: null, decimals: 0 },
  { code: 'USD', label: 'دلار', adjective: 'دلاری', symbol: '$', priceId: 'usd', decimals: 2 },
  { code: 'EUR', label: 'یورو', adjective: 'یورویی', symbol: '€', priceId: 'eur', decimals: 2 },
  { code: 'TRY', label: 'لیر', adjective: 'لیری', symbol: '₺', priceId: 'try', decimals: 2 },
  { code: 'AED', label: 'درهم', adjective: 'درهمی', symbol: 'د.إ', priceId: 'aed', decimals: 2 },
];

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

/** Every currency code, in the app's order */
export const CURRENCY_CODES = CURRENCIES.map((c) => c.code);

/** A currency's row (the toman for an unknown code) */
export const currencyOf = (code) => BY_CODE.get(code) || BY_CODE.get(BASE_CURRENCY);

/** A known code, else the toman (validation of stored records) */
export const normalizeCurrency = (code) => (BY_CODE.has(code) ? code : BASE_CURRENCY);

/** Whether amounts in it need a rate to be tomans */
export const isForeignCurrency = (code) => normalizeCurrency(code) !== BASE_CURRENCY;

/** Its name: «یورو» */
export const currencyLabel = (code) => currencyOf(code).label;

/** Its adjective: «یورویی» */
export const currencyAdjective = (code) => currencyOf(code).adjective;

/** Whether its amounts take decimals (every foreign currency) */
export const allowsDecimals = (code) => currencyOf(code).decimals > 0;

/**
 * The foreign currencies other than the dollar a list of records is in — the ones whose rates a
 * screen must load besides the dollar's (useFxRates)
 * @param {Array<{ currency?: string }>} records
 * @returns {string[]}
 */
export function otherCurrenciesOf(records = []) {
  const codes = new Set();
  for (const r of records) {
    const code = normalizeCurrency(r?.currency);
    if (code !== BASE_CURRENCY && code !== 'USD') codes.add(code);
  }
  return CURRENCY_CODES.filter((c) => codes.has(c));
}

/**
 * A currency's toman rate on a day, from the price history; 0 when unknown
 * @param {string} code
 * @param {string} isoDate YYYY-MM-DD
 * @param {{ usdAt?: Function, rateAt?: Function }} [rates]
 */
export function currencyRateOn(code, isoDate, rates = {}) {
  const c = normalizeCurrency(code);
  if (c === BASE_CURRENCY) return 1;
  if (!isoDate) return 0;
  const value = c === 'USD'
    ? (typeof rates.usdAt === 'function' ? rates.usdAt(isoDate) : 0)
    : (typeof rates.rateAt === 'function' ? rates.rateAt(c, isoDate) : 0);
  return Number(value) > 0 ? Number(value) : 0;
}

/**
 * A currency's toman rate today; 0 when unknown
 * @param {string} code
 * @param {{ usdToman?: number, rateToday?: Function }} [rates]
 */
export function currencyRateToday(code, rates = {}) {
  const c = normalizeCurrency(code);
  if (c === BASE_CURRENCY) return 1;
  const value = c === 'USD' ? rates.usdToman : (typeof rates.rateToday === 'function' ? rates.rateToday(c) : 0);
  return Number(value) > 0 ? Number(value) : 0;
}

/** An amount in its currency's digits: «۲۵٫۵» / «۱۵۰٬۰۰۰» (Persian digits) */
export function formatCurrencyNumber(value, code) {
  const n = Number(value) || 0;
  const { decimals } = currencyOf(code);
  return decimals > 0 ? n.toLocaleString('fa-IR', { maximumFractionDigits: decimals }) : Math.round(n).toLocaleString('fa-IR');
}

/** An amount with its currency's name: «۲۵ یورو» / «۱۵۰٬۰۰۰ تومان» */
export const formatMoney = (value, code) => `${formatCurrencyNumber(value, code)} ${currencyLabel(code)}`;

/**
 * Amounts per currency, as recorded, in the app's order, without the empty ones
 * @param {Record<string, number>} byCurrency
 * @returns {Array<{ code: string, amount: number }>}
 */
export function currencyAmounts(byCurrency = {}) {
  return CURRENCY_CODES.filter((c) => Number(byCurrency[c]) > 0).map((code) => ({ code, amount: Number(byCurrency[code]) }));
}

/** Amounts per currency in words: «۲۵۰ یورو · ۱٬۲۰۰ لیر» */
export const formatCurrencyAmounts = (byCurrency, separator = ' · ') =>
  currencyAmounts(byCurrency).map(({ code, amount }) => formatMoney(amount, code)).join(separator);
