// @vitest-environment happy-dom
/**
 * holdingsLedgerUi.test.jsx — one row per asset; tapping it opens everything recorded for it
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import HoldingsTable from '../../../web/src/features/portfolio/components/HoldingsTable.jsx';
import AssetLedgerDetails from '../../../web/src/features/portfolio/components/AssetLedgerDetails.jsx';
import { buildAssetLedgers } from '../../../web/src/features/portfolio/utils/assetLedger.js';

afterEach(cleanup);

const { assets } = buildAssetLedgers({
  priceMap: { usd: 100_000 },
  holdings: [{ id: 'h1', assetId: 'usd', amount: 100, buyPrice: 0, buyDate: '1405/01/01', notes: 'از قبل' }],
  transactions: [
    { id: 't1', assetId: 'usd', transactionType: 'buy', quantity: 100, unitPrice: 70_000, transactionDate: '1405/02/01' },
    { id: 't2', assetId: 'usd', transactionType: 'sell', quantity: 120, unitPrice: 90_000, transactionDate: '1405/03/01' },
  ],
});
const groups = [{ key: 'forex', name: 'ارز', items: assets, totalRealValue: assets[0].itemRealVal, hasCostedItems: true, totalPnl: 0, totalPnlPct: 0 }];

describe('holdings: one row per asset', () => {
  it('shows the total and opens the ledger with FIFO details', () => {
    const onBuy = vi.fn();
    const onSell = vi.fn();
    const onEditEntry = vi.fn();
    render(
      <HoldingsTable
        categoryGroups={groups}
        renderDetails={(asset) => <AssetLedgerDetails asset={asset} onBuy={onBuy} onSell={onSell} onEditEntry={onEditEntry} />}
      />
    );
    expect(screen.getByText(/۸۰/)).toBeTruthy(); // 200 in − 120 out
    expect(screen.queryByText('موجودی', { selector: 'strong' })).toBeNull();

    fireEvent.click(screen.getByText('۳ ثبت').closest('[role="button"]'));
    expect(screen.getByText('موجودی', { selector: 'strong' })).toBeTruthy(); // the unpriced manual record
    expect(screen.getByText('فروش', { selector: 'strong' })).toBeTruthy();
    expect(screen.getByText('تمام شد')).toBeTruthy(); // the manual record went first
    expect(screen.getByText(/مانده ۸۰/)).toBeTruthy();
    expect(screen.getAllByText(/بی‌قیمت/).length).toBeGreaterThan(0);
    // The sale took from 2 purchases (the details in its tooltip)
    const from = screen.getByText('از ۲ خرید');
    expect(from.getAttribute('title')).toMatch(/موجودی ۱۴۰۵\/۰۱\/۰۱: ۱۰۰ \(بی‌قیمت\)/);
    // Each entry's own P&L: the buy = 80 left × (100,000 − 70,000) + 20 sold × 20,000
    expect(screen.getByTitle(/باز: \+2,400,000|باز: \+۲/)).toBeTruthy();
    expect(document.querySelector('[title*="از قبل"]')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button').find((b) => b.tagName === 'BUTTON' && b.textContent.trim() === 'فروش'));
    expect(onSell).toHaveBeenCalledWith(expect.objectContaining({ assetId: 'usd' }));
    fireEvent.click(screen.getAllByTitle('ویرایش')[0]);
    expect(onEditEntry.mock.calls[0][0]).toMatchObject({ kind: 'manual', id: 'h1' });
  });

  it('a shared view shows no notes and no actions', () => {
    render(<AssetLedgerDetails asset={assets[0]} readOnly showNotes={false} />);
    expect(document.querySelector('[title*="از قبل"]')).toBeNull();
    expect(screen.queryAllByTitle('ویرایش')).toHaveLength(0);
  });
});

describe('a purchase\'s comparisons are shown under it', () => {
  it('paid with another asset, and compared with another', () => {
    const { assets: [coin] } = buildAssetLedgers({
      priceMap: { coin: 100_000_000, usd: 100_000 },
      holdings: [{
        id: 'c1', assetId: 'coin', amount: 1, buyPrice: 80_000_000, buyDate: '1405/01/01',
        referenceAssetId: 'usd', referenceQuantity: 900,
        compareAssetId: 'usd', comparePriceToman: 80_000,
      }],
    });
    render(<AssetLedgerDetails asset={coin} priceMap={{ coin: 100_000_000, usd: 100_000 }} />);
    expect(screen.getByText(/پرداخت با ۹۰۰/)).toBeTruthy();
    expect(screen.getByText(/نسبت به نگه داشتن آن/)).toBeTruthy();
    expect(screen.getByText(/می‌خریدید/)).toBeTruthy();
  });
});
