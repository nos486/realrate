/**
 * accountCash.test.js — the default portfolio counts what the accounts hold: one read-only,
 * unpriced entry per account and currency, joined to that currency's ledger
 */
import { describe, it, expect } from 'vitest';
import { accountCashHoldings, cashPortfolioId, isAccountEntry } from '../../../web/src/features/portfolio/utils/accountCash.js';
import { buildAssetLedgers } from '../../../web/src/features/portfolio/utils/assetLedger.js';

const balance = { amounts: {}, startDate: '2026-10-01', startAt: '2026-10-01T00:00:00.000Z' };
const account = (id, extra = {}) => ({ id, name: `acc ${id}`, type: 'cash', currencies: ['IRT', 'USD'], balance, ...extra });
const byId = new Map([
  ['a1', { byCurrency: { IRT: 2_000_000, USD: 150 } }],
  ['a2', { byCurrency: { IRT: -500_000 } }],
  ['a3', { byCurrency: { USD: 40 } }],
  ['a4', { byCurrency: { USD: 10 } }],
]);
const accounts = [account('a1'), account('a2'), account('a3', { archived: true }), account('a4', { balance: null })];

describe('cashPortfolioId', () => {
  it('is the default portfolio, else the first', () => {
    expect(cashPortfolioId([{ id: 'p1' }, { id: 'p2', isDefault: 1 }])).toBe('p2');
    expect(cashPortfolioId([{ id: 'p1' }, { id: 'p2' }])).toBe('p1');
    expect(cashPortfolioId([])).toBeNull();
  });
});

describe('accountCashHoldings', () => {
  it('gives each currency an account holds above zero, leaving out archived and untracked accounts', () => {
    const list = accountCashHoldings(accounts, byId, '2026-10-31');
    expect(list.map((h) => [h.id, h.assetId, h.amount])).toEqual([
      ['account:a1:IRT', 'toman', 2_000_000],
      ['account:a1:USD', 'usd', 150],
    ]);
    expect(list.every((h) => isAccountEntry(h) && h.buyPrice === 0 && h.buyDate === '2026-10-31')).toBe(true);
    expect(list[0].accountName).toBe('acc a1');
  });

  it('joins the dollar ledger: adds to its value, not to its profit or loss, and sales take from the portfolio first', () => {
    const cash = accountCashHoldings(accounts, byId, '2026-10-31');
    const holdings = [
      { id: 'h1', assetId: 'usd', amount: 100, buyPrice: 50_000, buyDate: '2026-01-01' },
      ...cash,
    ];
    const transactions = [{ id: 't1', assetId: 'usd', transactionType: 'sell', quantity: 30, unitPrice: 80_000, transactionDate: '2026-10-31' }];
    const { assets } = buildAssetLedgers({ holdings, transactions, priceMap: { usd: 100_000, toman: 1 } });
    const usd = assets.find((a) => a.assetId === 'usd');
    expect(usd.amount).toBe(220);
    expect(usd.itemRealVal).toBe(22_000_000);
    expect(usd.pricedQty).toBe(70);
    expect(usd.itemPnl).toBe(70 * 50_000);
    expect(usd.realizedPnl).toBe(30 * 30_000);
    expect(usd.entries.find((e) => e.id === 'account:a1:USD').record.fromAccount).toBe(true);
    expect(assets.find((a) => a.assetId === 'toman').itemRealVal).toBe(2_000_000);
  });
});
