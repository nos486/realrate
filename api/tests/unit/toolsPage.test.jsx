// @vitest-environment happy-dom
/**
 * toolsPage.test.jsx — «ابزارها»: the tiles pick a tool (kept in the URL) and a tool works out its
 * answer as numbers are typed, with live rates from the price book
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const prices = { usd: 100_000, gold_18k: 5_000_000, full_coin: 60_000_000 };
vi.mock('../../../web/src/features/market/context/PricingContext.jsx', () => ({
  usePricing: () => ({ getAssetPrice: (id) => prices[id] || 0, priceBook: null, usdToman: 100_000, goldUsd: 0, globalSettings: {} }),
}));

import ToolsPage, { TOOLS } from '../../../web/src/features/tools/ToolsPage.jsx';

afterEach(cleanup);
const renderAt = (url) => render(<MemoryRouter initialEntries={[url]}><ToolsPage /></MemoryRouter>);

describe('ToolsPage', () => {
  it('lists every tool as a tile and opens the one in the URL', async () => {
    renderAt('/tools?t=gold');
    expect(screen.getAllByRole('tab')).toHaveLength(TOOLS.length);
    expect(screen.getByRole('tab', { selected: true }).textContent).toContain('قیمت طلا');
    await screen.findByText('مبلغ قابل پرداخت');
  });

  it('works out a loan\'s installment while typing', async () => {
    renderAt('/tools');
    const amount = await screen.findByLabelText(/مبلغ وام/);
    fireEvent.change(amount, { target: { value: '100000000' } });
    await waitFor(() => expect(screen.getByText('قسط ماهانه')).toBeTruthy());
  });

  it('converts through the live rates', async () => {
    renderAt('/tools?t=convert');
    await screen.findByText('نرخ هر دلار');
    expect(screen.getByText('نرخ هر دلار').closest('div').textContent).toContain('تومان');
  });
});
