// @vitest-environment happy-dom
/**
 * netWorthSection.test.jsx — The reports page's net worth: every portfolio, loan (with its
 * schedule) and cheque read and decrypted in the browser, valued at each month's end, shown in
 * tomans and dollars against the dollar's own rise
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, waitFor } from '@testing-library/react';

const store = vi.hoisted(() => ({ portfolios: [], loans: [], cheques: [] }));

vi.mock('../../../web/src/shared/vault/portfolioFunds.js', () => ({
  listPortfolioRecords: async () => store.portfolios,
}));
vi.mock('../../../web/src/features/loans/api/loanApi.js', () => ({
  getLoans: async () => ({ success: true, loans: store.loans.map(({ id }) => ({ id })) }),
  getLoanDetail: async (id) => ({ success: true, loan: store.loans.find((l) => l.id === id) }),
}));
vi.mock('../../../web/src/features/cheques/api/chequeApi.js', () => ({
  getCheques: async () => ({ success: true, cheques: store.cheques }),
}));
vi.mock('../../../web/src/features/market/index.js', () => ({
  usePricing: () => ({ priceMap: { usd: 100_000 }, itemMap: null }),
}));
// The dollar: 50 000 until 1404's end, 100 000 after
vi.mock('../../../web/src/features/market/dailyHistory.js', () => ({
  useDailyHistory: () => ({ priceAt: (id, day) => (id === 'usd' ? (day < '2026-03-21' ? 50_000 : 100_000) : null), loading: false }),
  useUsdAt: () => (day) => (day < '2026-03-21' ? 50_000 : 100_000),
}));
vi.mock('../../../web/src/shared/utils/dates.js', async (orig) => ({ ...(await orig()), todayIso: () => '2026-04-10' }));

const { useNetWorth } = await import('../../../web/src/features/reports/useNetWorth.js');
const { default: NetWorthSection } = await import('../../../web/src/features/reports/NetWorthSection.jsx');
const { reportFormatters } = await import('../../../web/src/features/reports/reportFormat.js');

function Harness() {
  const netWorth = useNetWorth(1405, 1);
  return <div className="report-dash"><NetWorthSection netWorth={netWorth} f={reportFormatters(false)} yearLabel="۱۴۰۵" /></div>;
}

afterEach(() => {
  cleanup();
  store.portfolios = [];
  store.loans = [];
  store.cheques = [];
});

describe('NetWorthSection', () => {
  it('asks for records when there are none', async () => {
    render(<Harness />);
    expect(await screen.findByText(/برای دیدن ارزش خالص/)).toBeTruthy();
  });

  it('adds the portfolios, takes away the loans, and compares the year with the dollar', async () => {
    // 10 dollars held since 1404 — 1 000 000 tomans today
    store.portfolios = [{ portfolioId: 'p1', holdings: [{ id: 'h1', assetId: 'usd', amount: 10, buyPrice: 40_000, buyDate: '2026-03-01' }], transactions: [] }];
    // 200 000 still owed
    store.loans = [{ id: 'loan_1', startDate: '2026-03-01', installments: [{ dueDate: '2026-05-01', totalAmount: 200_000, isPaid: false }], extraPayments: [] }];
    render(<Harness />);

    await waitFor(() => expect(screen.getByText('تغییر ارزش خالص')).toBeTruthy());
    // At 1404's end: 10 × 50 000 − 200 000 = 300 000; now: 10 × 100 000 − 200 000 = 800 000
    expect(document.querySelector('.mini-card-value').textContent.trim()).toBe('۸۰۰٬۰۰۰');
    // The dollar doubled; the net worth grew 166.7%: it beat the dollar
    expect(screen.getByText('ارزش خالص شما بیشتر از دلار رشد کرد')).toBeTruthy();
    expect(screen.getByText('دارایی ۱ میلیون · بدهی ۲۰۰٬۰۰۰')).toBeTruthy();
    expect(screen.getAllByText('۱۶۷٪').length).toBeGreaterThan(0);
    // In dollars: 6 → 8
    expect(screen.getAllByText('$۸').length).toBeGreaterThan(0);
    expect(screen.getByText('از $۶')).toBeTruthy();
  });
});
