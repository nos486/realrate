// @vitest-environment happy-dom
/**
 * newsUi.test.jsx — «آخرین اخبار» on the home page: the latest headlines with their source and
 * time, a tap opens the news page on that item; nothing when there is no news. The time reads
 * relative, then by day.
 */
import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const getNews = vi.fn();
const getNewsToday = vi.fn(async () => ({ analysis: null, top: [] }));
vi.mock('../../../web/src/features/news/newsApi.js', () => ({
  getNews: (...args) => getNews(...args),
  getNewsToday: (...args) => getNewsToday(...args),
}));
import NewsCard from '../../../web/src/features/news/NewsCard.jsx';
import { newsTimeAgo } from '../../../web/src/features/news/newsFormat.js';
import { clearNewsCache } from '../../../web/src/features/news/useNews.js';

// News is kept for the visit once read: each test starts without it
beforeEach(clearNewsCache);
afterEach(cleanup);

const NOW = Date.now();
const item = (id, title, minutesAgo, extra = {}) => ({
  id: `khabari/${id}`, channel: 'khabari', channelTitle: 'خبری', postId: id, url: `https://t.me/khabari/${id}`,
  title, summary: '', text: '', category: 'currency', importance: 1, publishedAt: NOW - minutesAgo * 60000, ...extra,
});

function Where() {
  const loc = useLocation();
  return <span data-testid="where">{loc.pathname}{loc.search}</span>;
}

const renderCard = (props) => render(
  <MemoryRouter initialEntries={['/app']}>
    <Routes>
      <Route path="*" element={<><NewsCard {...props} /><Where /></>} />
    </Routes>
  </MemoryRouter>,
);

describe('NewsCard', () => {
  it('shows the latest headlines with source and time, and opens the news page on one', async () => {
    getNews.mockResolvedValueOnce({ items: [item(2, 'دلار ۱۰۰ هزار تومانی شد', 5, { importance: 3 }), item(1, 'سکه ارزان شد', 90)], hasMore: false });
    renderCard({ count: 3 });
    expect(await screen.findByText('دلار ۱۰۰ هزار تومانی شد')).toBeTruthy();
    expect(screen.getByText('سکه ارزان شد')).toBeTruthy();
    expect(screen.getAllByText('خبری')).toHaveLength(2);
    expect(screen.getByText('۵ دقیقه پیش')).toBeTruthy();
    expect(getNews).toHaveBeenCalledWith(expect.objectContaining({ limit: 3 }));

    fireEvent.click(screen.getByText('دلار ۱۰۰ هزار تومانی شد'));
    expect(screen.getByTestId('where').textContent).toBe('/news?open=khabari%2F2');
  });

  it("the day's analysis in one line above the news", async () => {
    getNews.mockResolvedValueOnce({ items: [item(5, 'سکه ارزان شد', 3)], hasMore: false });
    getNewsToday.mockResolvedValueOnce({ analysis: { title: 'دلار در کانال صعودی می‌ماند', summary: 'x', at: NOW }, top: [] });
    renderCard({ count: 4, className: 'is-analysis-test' });
    expect(await screen.findByText('دلار در کانال صعودی می‌ماند')).toBeTruthy();
    fireEvent.click(screen.getByText('تحلیل روز'));
    expect(screen.getByTestId('where').textContent).toBe('/news');
  });

  it('no news: no card', async () => {
    getNews.mockResolvedValueOnce({ items: [], hasMore: false });
    const { container } = renderCard({ count: 5 });
    await waitFor(() => expect(container.querySelector('.news-card')).toBeNull());
  });
});

describe('newsTimeAgo', () => {
  it('reads minutes and hours, then the day', () => {
    const now = Date.parse('2026-10-05T12:00:00Z');
    expect(newsTimeAgo(now - 20000, now)).toBe('لحظاتی پیش');
    expect(newsTimeAgo(now - 3 * 3600000, now)).toBe('۳ ساعت پیش');
    expect(newsTimeAgo(now - 20 * 3600000, now)).toMatch(/^دیروز /);
    expect(newsTimeAgo(now - 5 * 86400000, now)).toMatch(/مهر/);
  });
});
