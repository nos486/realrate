// @vitest-environment happy-dom
/**
 * dollarView.test.jsx — Every record seen in dollars the same way: an amount on its day at that
 * day's rate, and what those dollars are worth today (domain/dollarValue.js); incomes, and a
 * portfolio asset's open position (bought at each purchase day's rate, valued today)
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { dollarValueOf, summarizeDollarValues } from '../../src/domain/dollarValue.js';
import { incomeDollarValue } from '../../../web/src/features/incomes/utils/incomeReport.js';
import { buildAssetLedgers, assetDollarPnl, sumDollarPnl } from '../../../web/src/features/portfolio/utils/assetLedger.js';
import { DollarValueLine, DollarPnl } from '../../../web/src/shared/ui/DollarValue.jsx';

afterEach(cleanup);
const usdAt = (day) => ({ '2024-04-03': 50_000, '2025-03-21': 80_000 })[day] ?? null;

describe('dollarValueOf', () => {
  it('the dollars then, their tomans today and the change', () => {
    expect(dollarValueOf(5_000_000, 50_000, 100_000)).toEqual({ usd: 100, paidToman: 5_000_000, todayToman: 10_000_000, changePct: 100 });
    expect(dollarValueOf(5_000_000, 50_000)).toMatchObject({ usd: 100, todayToman: null, changePct: null });
  });

  it('nothing without an amount or the day\'s rate', () => {
    expect(dollarValueOf(0, 50_000, 1)).toBeNull();
    expect(dollarValueOf(5_000_000, 0, 1)).toBeNull();
  });

  it('sums a list, counting the records left out', () => {
    const view = summarizeDollarValues([dollarValueOf(5_000_000, 50_000), dollarValueOf(8_000_000, 80_000), null], 100_000);
    expect(view).toMatchObject({ usd: 200, paidToman: 13_000_000, todayToman: 20_000_000, counted: 2, missing: 1 });
    expect(view.changePct).toBeCloseTo((7_000_000 / 13_000_000) * 100);
  });
});

describe('an income in dollars', () => {
  it('at the rate of the day it came in', () => {
    expect(incomeDollarValue({ amount: 8_000_000, incomeDate: '2025-03-21' }, 100_000, usdAt)).toMatchObject({ usd: 100, todayToman: 10_000_000 });
    expect(incomeDollarValue({ amount: 8_000_000, incomeDate: '2019-01-01' }, 100_000, usdAt)).toBeNull();
  });

  it('is shown under its amount', () => {
    render(<DollarValueLine value={dollarValueOf(8_000_000, 80_000, 100_000)} />);
    expect(screen.getByText(/۱۰۰ دلار/)).toBeTruthy();
    expect(screen.getByText(/\+۲۵٪/)).toBeTruthy();
  });
});

describe('a portfolio asset in dollars', () => {
  const ledger = () => buildAssetLedgers({
    priceMap: { gold_18k: 10_000_000 },
    holdings: [
      // 2 g for 4M each when the dollar was 50,000: $160
      { id: 'h1', assetId: 'gold_18k', amount: 2, buyPrice: 4_000_000, buyDate: '1403/01/15' },
      // 1 g for 8M when it was 80,000: $100
      { id: 'h2', assetId: 'gold_18k', amount: 1, buyPrice: 8_000_000, buyDate: '2025-03-21' },
      // An opening balance: no day, left out
      { id: 'h3', assetId: 'gold_18k', amount: 1, buyPrice: 3_000_000, buyDate: '' },
    ],
  });

  it('costs each purchase at its day\'s rate and values what is held today', () => {
    const [gold] = ledger().assets;
    const pnl = assetDollarPnl(gold, usdAt, 100_000);
    // 3 g × 10M = 30M = $300 today, against $260 paid
    expect(pnl.costUsd).toBeCloseTo(260);
    expect(pnl.valueUsd).toBeCloseTo(300);
    expect(pnl.pnlUsd).toBeCloseTo(40);
    expect(pnl.missingQty).toBeCloseTo(1);
  });

  it('follows sales: only the lots still held count', () => {
    const { assets: [gold] } = buildAssetLedgers({
      priceMap: { gold_18k: 10_000_000 },
      holdings: [{ id: 'h1', assetId: 'gold_18k', amount: 2, buyPrice: 4_000_000, buyDate: '1403/01/15' }],
      transactions: [{ id: 't1', assetId: 'gold_18k', transactionType: 'sell', quantity: 1, unitPrice: 9_000_000, transactionDate: '1404/01/01' }],
    });
    expect(assetDollarPnl(gold, usdAt, 100_000)).toMatchObject({ costUsd: 80, valueUsd: 100, pnlUsd: 20, missingQty: 0 });
  });

  it('nothing without today\'s rate or any dated lot; the total says when part is left out', () => {
    const [gold] = ledger().assets;
    expect(assetDollarPnl(gold, usdAt, 0)).toBeNull();
    expect(assetDollarPnl(gold, () => null, 100_000)).toBeNull();
    const total = sumDollarPnl([assetDollarPnl(gold, usdAt, 100_000), null]);
    expect(total).toMatchObject({ partial: true });
    expect(total.pnlUsd).toBeCloseTo(40);
    expect(sumDollarPnl([null])).toBeNull();
  });

  it('is shown as a profit or loss in dollars', () => {
    render(<DollarPnl pnl={{ pnlUsd: -40, pnlPct: -10, missingQty: 0 }} />);
    expect(screen.getByText(/−۴۰/).className).toBe('is-loss');
    expect(screen.getByText(/−۱۰٪/)).toBeTruthy();
  });
});
