/**
 * portfolioFunds.js — Paying an expense with an asset held in a portfolio (dollars, for now)
 *
 * A dollar expense paid from a portfolio («پرداخت از» → a portfolio's dollars) is two linked
 * encrypted records:
 *   - the expense, with `paidFrom: { portfolioId, portfolioName, assetId, txId }`
 *   - a «spend» transaction in that portfolio (id `txId`, `expenseId`): the dollars leave the
 *     asset's ledger at the expense's rate, realizing P&L like a sale (calculationEngine.js)
 * The transaction is written first and the expense second (vaultExpenses.saveExpense); a failed
 * expense write removes the transaction again. Editing the expense rewrites the transaction (or
 * moves it to another portfolio), deleting it deletes the transaction. The transaction carries no
 * expense title: a shared portfolio link must not reveal the user's expenses.
 *
 * The same way, an expense in «سرمایه‌گذاری» can be a purchase in a portfolio (`investedIn`: a
 * «buy» transaction) and an income in «فروش دارایی» a sale (`soldFrom`: a «sell» transaction) —
 * utils/portfolioLink.js; saveLinkedTransaction / deleteLinkedTransaction.
 *
 * Only portfolios under the account vault are offered (their key is at hand once it is open).
 */

import { getPortfolios } from '../../features/portfolio/api/portfolioApi.js';
import { priceOnDay } from '../../features/market/priceOnDay.js';
import { calculateComputedHoldings } from '../../features/transactions/utils/calculationEngine.js';
import { buildAssetLedgers } from '../../features/portfolio/utils/assetLedger.js';
import { getKnownPriceIds } from '../../features/market/knownPriceIds.js';
import { resolveAssetUnit } from '../../config/sourceRegistry.js';
import { gregorianToShamsi } from '../../features/portfolio/components/ShamsiDatePicker.jsx';
import { toPriceId } from '../../utils/priceIds.js';
import { getPortfolioKey, isAccountVaultPortfolio } from './vaultStore.js';
import {
  listPortfolioHoldings,
  listPortfolioTransactions,
  savePortfolioTransaction,
  deletePortfolioTransactionRecord,
} from './vaultPortfolioItems.js';

/** The asset a currency is paid with */
export const CURRENCY_ASSET = { USD: 'usd' };

export const newSpendTxId = () => `txs_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

async function accountPortfolios() {
  const res = await getPortfolios();
  const list = Array.isArray(res) ? res : res?.portfolios || [];
  return list.filter(isAccountVaultPortfolio);
}

/** The portfolios a record can be linked to: { id, name } */
export async function listLinkablePortfolios() {
  return (await accountPortfolios()).map((p) => ({ id: p.id, name: p.name || 'پورتفو', isDefault: Boolean(p.isDefault) }));
}

/**
 * What every portfolio holds now (its whole ledger: manual holdings and transactions)
 * @returns {Promise<Array<{ portfolioId: string, portfolioName: string,
 *   positions: Array<{ assetId: string, assetName: string, unit: string, amount: number }> }>>}
 */
export async function listPortfolioPositions() {
  const portfolios = await accountPortfolios();
  const all = await Promise.all(portfolios.map(async (portfolio) => {
    try {
      const key = await getPortfolioKey(portfolio);
      if (!key) return null;
      const [holdings, transactions] = await Promise.all([
        listPortfolioHoldings(portfolio, key),
        listPortfolioTransactions(portfolio, key),
      ]);
      // One position per asset and unit, under the price book's ids — the same ledgers the
      // portfolio shows (a sale is then written into the ledger it is taken from)
      const { assets } = buildAssetLedgers({ holdings, transactions, priceMap: getKnownPriceIds() || {} });
      return {
        portfolioId: portfolio.id,
        portfolioName: portfolio.name || 'پورتفو',
        positions: assets.map((a) => ({ assetId: a.assetId, assetName: a.assetName, unit: a.unit, amount: a.amount })),
      };
    } catch (err) {
      console.warn('Reading a portfolio for its positions failed:', err);
      return null;
    }
  }));
  return all.filter(Boolean);
}

/**
 * How much of `assetId` each portfolio holds (its whole ledger: manual holdings and transactions)
 * @returns {Promise<Array<{ portfolioId: string, portfolioName: string, amount: number, averageCost: number }>>}
 */
export async function listAssetFunds(assetId) {
  const id = toPriceId(assetId);
  const portfolios = await accountPortfolios();
  const funds = await Promise.all(portfolios.map(async (portfolio) => {
    try {
      const key = await getPortfolioKey(portfolio);
      if (!key) return null;
      const [holdings, transactions] = await Promise.all([
        listPortfolioHoldings(portfolio, key),
        listPortfolioTransactions(portfolio, key),
      ]);
      // The ledger counts the manual holdings too
      const { positions } = calculateComputedHoldings(transactions, getKnownPriceIds() || {}, { manualLots: holdings });
      const position = positions.get(id);
      return { portfolioId: portfolio.id, portfolioName: portfolio.name || 'پورتفو', amount: position?.amount || 0, averageCost: position?.averageCost || 0 };
    } catch (err) {
      console.warn('Reading a portfolio for funds failed:', err);
      return null;
    }
  }));
  return funds.filter(Boolean);
}

/**
 * The dollar rate (tomans) on a day, from the daily price history; null when unknown
 * @param {string} isoDate YYYY-MM-DD
 */
export async function rateOnDay(assetId, isoDate) {
  const rate = await priceOnDay(assetId, isoDate);
  return rate > 0 ? Math.round(rate) : null;
}

async function portfolioById(portfolioId) {
  const portfolio = (await accountPortfolios()).find((p) => p.id === portfolioId);
  if (!portfolio) throw new Error('پورتفوی انتخاب‌شده پیدا نشد (یا با رمزنگاری حساب باز نمی‌شود).');
  const key = await getPortfolioKey(portfolio);
  if (!key) throw new Error('پورتفوی انتخاب‌شده قفل است.');
  return { portfolio, key };
}

/** Write the spend transaction of an expense paid from a portfolio */
export async function saveSpendTransaction(expense) {
  const { paidFrom } = expense;
  const { portfolio, key } = await portfolioById(paidFrom.portfolioId);
  await savePortfolioTransaction(portfolio, key, paidFrom.txId, {
    assetId: toPriceId(paidFrom.assetId),
    transactionType: 'spend',
    quantity: Number(expense.amount) || 0,
    unitPrice: Number(expense.usdRate) || 0,
    transactionDate: gregorianToShamsi(`${expense.date}T00:00:00`),
    notes: 'پرداخت هزینه',
    expenseId: expense.id,
  });
}

/** Remove the spend transaction an expense had (gone already is fine) */
export async function deleteSpendTransaction(paidFrom) {
  if (!paidFrom?.txId || !paidFrom?.portfolioId) return;
  try {
    await deletePortfolioTransactionRecord(paidFrom.portfolioId, paidFrom.txId);
  } catch (err) {
    if (err?.status !== 404) throw err;
  }
}

export const newLinkTxId = () => `txl_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

/** Notes the linked transactions carry (never the record's title: share links show them) */
export const LINK_NOTES = { buy: 'خرید — ثبت‌شده در هزینه‌ها', sell: 'فروش — ثبت‌شده در درآمدها' };

/**
 * Write the portfolio entry of a linked expense or income (utils/portfolioLink.js)
 * @param {object} link { portfolioId, assetId, quantity, txId }
 * @param {{ type: 'buy'|'sell', toman: number, date: string, owner: object }} entry
 *   toman: what the whole quantity cost or brought; date: YYYY-MM-DD; owner: { expenseId } or { incomeId }
 */
export async function saveLinkedTransaction(link, { type, toman, date, owner }) {
  const { portfolio, key } = await portfolioById(link.portfolioId);
  const quantity = Number(link.quantity) || 0;
  const assetId = toPriceId(link.assetId, getKnownPriceIds());
  // A ledger kept in another unit than the asset's usual one (gold in mesghals) is named by it
  const unit = link.unit && link.unit !== resolveAssetUnit(assetId) ? { unit: link.unit } : {};
  await savePortfolioTransaction(portfolio, key, link.txId, {
    assetId,
    ...unit,
    transactionType: type,
    quantity,
    unitPrice: quantity > 0 && toman > 0 ? toman / quantity : 0,
    transactionDate: gregorianToShamsi(`${date}T00:00:00`),
    notes: LINK_NOTES[type] || '',
    ...owner,
  });
}

/** Remove a linked record's portfolio entry (gone already is fine) */
export const deleteLinkedTransaction = deleteSpendTransaction;
