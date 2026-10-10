/**
 * recordRates.js — A currency's toman rate on a record's day, read from the daily price history
 * when a record is saved and something it writes needs a price (utils/currencies.js)
 *
 * Records never store a rate (see docs/ARCHITECTURE.md, «قیمت روز رکورد»): an expense or an
 * income in euros is tomans at the euro's rate on its day, read from the history whenever it is
 * shown. Only a portfolio transaction a record writes carries a price — that is how a portfolio
 * ledger works (calculationEngine.js) — and it is taken from the same history here: a foreign
 * expense paid from a portfolio («spend» at the currency's rate), one bought into a portfolio
 * («buy» at its tomans) and a foreign income sold from one («sell» at its tomans).
 */

import { priceOnDay } from '../../features/market/dailyHistory.js';
import { BASE_CURRENCY, currencyLabel, currencyOf, normalizeCurrency } from '../../utils/currencies.js';

class RateUnknownError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

/**
 * Tomans per unit of `currency` on `isoDate` (1 for tomans): that day's close in its price
 * history, the last one before a quiet day
 * @throws {RateUnknownError} when the history has no rate for that day
 */
export async function tomanRateOn(currency, isoDate) {
  const code = normalizeCurrency(currency);
  if (code === BASE_CURRENCY) return 1;
  const rate = await priceOnDay(currencyOf(code).priceId, isoDate);
  if (!(rate > 0)) throw new RateUnknownError(`نرخ ${currencyLabel(code)} این روز در تاریخچه‌ی قیمت نیست.`);
  return rate;
}
