// @vitest-environment happy-dom
/**
 * newsWorld.test.jsx — The news page's international news: the «بین‌الملل» filter asks for the
 * feeds' news only; an article shows its Persian headline, a tag, its English original and a link
 * to it on its site (a Telegram post has no link out)
 */
import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const getNews = vi.fn();
vi.mock('../../../web/src/features/news/newsApi.js', () => ({
  getNews: (...args) => getNews(...args),
  getNewsToday: async () => ({ analysis: null, top: [], week: [] }),
  setNewsHidden: vi.fn(),
}));
vi.mock('../../../web/src/features/auth/index.js', () => ({ useAuth: () => ({ user: { role: 'user' } }) }));
vi.mock('../../../web/src/features/news/newsAlerts.js', () => ({
  newsAlertsSupported: () => false,
  getNewsAlertsEnabled: async () => false,
  setNewsAlertsEnabled: async () => false,
}));
vi.mock('../../../web/src/shared/ui/FeedbackProvider.jsx', () => ({ useFeedback: () => ({ toast: { success: vi.fn(), error: vi.fn() } }) }));
import NewsPage from '../../../web/src/features/news/NewsPage.jsx';
import { clearNewsCache } from '../../../web/src/features/news/useNews.js';

beforeEach(clearNewsCache);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const NOW = Date.now();
const world = {
  id: 'cnbc_economy/123', channel: 'cnbc_economy', channelTitle: 'CNBC', postId: 123, source: 'world',
  url: 'https://www.cnbc.com/2026/10/05/gold-record.html', title: 'طلا رکورد زد', summary: 'قیمت جهانی طلا از ۴۰۰۰ دلار گذشت.',
  text: 'Gold hits a record\nSpot gold rose above $4,000 an ounce.', category: 'gold', importance: 2, publishedAt: NOW - 3600000, ai: true,
};
const telegram = {
  id: 'khabari/9', channel: 'khabari', channelTitle: 'خبری', postId: 9, source: 'telegram', url: 'https://t.me/khabari/9',
  title: 'دلار گران شد', summary: '', text: 'دلار گران شد', category: 'currency', importance: 1, publishedAt: NOW - 7200000, ai: true,
};

const renderPage = () => render(<MemoryRouter initialEntries={['/news']}><NewsPage /></MemoryRouter>);

describe('international news on the news page', () => {
  it('an article shows its original and a link to it; a Telegram post has no link out', async () => {
    getNews.mockResolvedValue({ items: [world, telegram], total: 2 });
    renderPage();
    fireEvent.click(await screen.findByText('طلا رکورد زد'));
    expect(screen.getByText('متن اصلی خبر')).toBeTruthy();
    const link = screen.getByRole('link', { name: /خبر اصلی در CNBC/ });
    expect(link.getAttribute('href')).toBe(world.url);
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(screen.getByText('cnbc.com')).toBeTruthy();

    fireEvent.click(screen.getByText('دلار گران شد', { selector: 'h3' }));
    expect(screen.queryByRole('link', { name: /خبر اصلی/ })).toBeNull();
  });

  it('the «بین‌الملل» filter asks for the feeds\' news only', async () => {
    getNews.mockResolvedValue({ items: [world], total: 1 });
    renderPage();
    await screen.findByText('طلا رکورد زد');
    fireEvent.click(screen.getAllByText('بین‌الملل').find((el) => el.closest('nav')));
    await waitFor(() => expect(getNews).toHaveBeenLastCalledWith(expect.objectContaining({ source: 'world', category: '' })));
  });
});
