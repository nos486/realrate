// @vitest-environment happy-dom
/**
 * newsPageUi.test.jsx — The news page: the day's analysis in the side panel (compact, the rest
 * behind «ادامه‌ی تحلیل»), «امروز در یک نگاه» (a tap filters the list), the main prices, and the
 * list under a heading per day
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const NOW = Date.now();
const item = (id, title, minutesAgo, extra = {}) => ({
  id: `c/${id}`, channel: 'c', channelTitle: 'خبری', postId: id, url: `https://t.me/c/${id}`,
  title, summary: '', text: '', category: 'currency', importance: 1, publishedAt: NOW - minutesAgo * 60000, ...extra,
});
const useNews = vi.fn(() => ({
  items: [item(1, 'خبر امروز', 1), item(2, 'خبر دو روز پیش', 60 * 49)],
  total: 2, loading: false, error: '', updatedAt: NOW, removeItem: vi.fn(),
}));
const today = {
  analysis: {
    title: 'دلار در انتظار مذاکرات', summary: 'متن کامل تحلیل', at: NOW, newsCount: 2,
    outlook: [{ asset: 'usd', direction: 'up', confidence: 2, note: 'حواله', evidence: ['c/1'] }],
    drivers: [], points: [], risk: 'مذاکرات',
  },
  top: [], loading: false,
  stats: { total: 7, important: 2, byCategory: { currency: 4, gold: 3 } },
};
vi.mock('../../../web/src/features/news/useNews.js', () => ({ useNews: (...a) => useNews(...a), useNewsToday: () => today }));
vi.mock('../../../web/src/features/auth/index.js', () => ({ useAuth: () => ({ user: { role: 'user' } }) }));
vi.mock('../../../web/src/features/market/context/PricingContext.jsx', () => ({
  usePricing: () => ({ priceBook: { items: { usd: { id: 'usd', name: 'دلار', price: 105000, unit: 'تومان', params: { changePercent: 0.5 } } } } }),
}));
vi.mock('../../../web/src/shared/ui/FeedbackProvider.jsx', () => ({ useFeedback: () => ({ toast: { success: vi.fn(), error: vi.fn() } }) }));
vi.mock('../../../web/src/features/news/newsAlerts.js', () => ({ newsAlertsSupported: () => false, getNewsAlertsEnabled: vi.fn(), setNewsAlertsEnabled: vi.fn() }));
import NewsPage from '../../../web/src/features/news/NewsPage.jsx';

afterEach(cleanup);

const renderPage = () => render(<MemoryRouter initialEntries={['/news']}><NewsPage /></MemoryRouter>);

describe('the news page', () => {
  it('the analysis sits in the side panel, compact until opened', () => {
    renderPage();
    const aside = screen.getByRole('complementary', { name: 'تحلیل و خلاصه‌ی امروز' });
    const card = within(aside).getByRole('region', { name: 'تحلیل روز' });
    expect(within(card).getByText('دلار در انتظار مذاکرات')).toBeTruthy();
    expect(within(card).queryByText('متن کامل تحلیل')).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: /ادامه‌ی تحلیل/ }));
    expect(within(card).getByText('متن کامل تحلیل')).toBeTruthy();
    expect(within(card).getByText(/مذاکرات/, { selector: 'span' })).toBeTruthy();
  });

  it("today's counts filter the list", () => {
    renderPage();
    const stats = screen.getByRole('region', { name: 'امروز در یک نگاه' });
    expect(within(stats).getByText('۷')).toBeTruthy();
    fireEvent.click(within(stats).getByRole('button', { name: /طلا و سکه/ }));
    expect(useNews).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'gold', page: 1 }));
    fireEvent.click(within(stats).getByRole('button', { name: /مهم/ }));
    expect(useNews).toHaveBeenLastCalledWith(expect.objectContaining({ important: true, category: '' }));
  });

  it('the main prices and the list by day', () => {
    renderPage();
    expect(screen.getAllByRole('list', { name: 'قیمت‌های اصلی' })[0].textContent).toContain('۱۰۵٬۰۰۰');
    expect(screen.getByRole('heading', { name: 'امروز' })).toBeTruthy();
    const today = screen.getByRole('region', { name: 'امروز' });
    expect(within(today).getByText('خبر امروز')).toBeTruthy();
    expect(within(today).queryByText('خبر دو روز پیش')).toBeNull();
  });
});
