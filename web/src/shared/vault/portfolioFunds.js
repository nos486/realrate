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
 * Only portfolios under the account vault are offered (their key is at hand once it is open).
 */

import { getPortfolios } from '../../features/portfolio/api/portfolioApi.js';
import { getSparklines } from '../../features/market/api/marketApi.js';
import { calculateComputedHoldings } from '../../features/transactions/utils/calculationEngine.js';
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
      const { positions } = calculateComputedHoldings(transactions, {}, { manualLots: holdings });
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
 * The dollar rate (tomans) on a day, from the price history; null when unknown
 * @param {string} isoDate YYYY-MM-DD
 */
export async function rateOnDay(assetId, isoDate) {
  const target = Date.parse(`${isoDate}T23:59:59`);
  if (!Number.isFinite(target)) return null;
  const age = Date.now() - target;
  const range = age <= 25 * 86_400_000 ? '30d' : '1y';
  try {
    const res = await getSparklines([assetId], range, { silent: true });
    const series = res?.sparklines?.[assetId];
    if (!series?.points?.length) return null;
    const size = (Number(res.bucketSec) || 0) * 1000;
    const start = Date.parse(series.since);
    if (!size || target < start) return null;
    const index = Math.min(series.points.length - 1, Math.floor((target - Math.floor(start / size) * size) / size));
    return series.points[index] > 0 ? Math.round(series.points[index]) : null;
  } catch {
    return null;
  }
}

async function portfolioById(portfolioId) {
  const portfolio = (await accountPortfolios()).find((p) => p.id === portfolioId);
  if (!portfolio) throw new Error('پورتفوی پرداخت پیدا نشد (یا با رمزنگاری حساب باز نمی‌شود).');
  const key = await getPortfolioKey(portfolio);
  if (!key) throw new Error('پورتفوی پرداخت قفل است.');
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
