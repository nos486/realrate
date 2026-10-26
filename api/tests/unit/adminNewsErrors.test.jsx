// @vitest-environment happy-dom
/**
 * adminNewsErrors.test.jsx — The admin's news panel: the report (today's totals, the last runs,
 * the last published news); it says when the model failed (screening or the day's analysis) and
 * that no other model was tried; «تحلیل الان» reports the model's error; the international feeds;
 * the channels, an English one marked «ترجمه»; «درخواست‌های ردشده»: the posts the model was sent
 * and didn't publish, filtered by reason
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';

const api = { getNewsChannels: vi.fn(), runNewsAnalysisNow: vi.fn(), saveNewsFeeds: vi.fn(), saveNewsChannels: vi.fn(), getNewsAiLog: vi.fn(async () => ({ items: [], counts: {}, hours: 24, limit: 300, model: 'GLM 5.3 Flash' })) };
vi.mock('../../../web/src/features/news/newsApi.js', () => ({
  getNewsChannels: (...a) => api.getNewsChannels(...a),
  saveNewsChannels: (...a) => api.saveNewsChannels(...a),
  saveNewsFeeds: (...a) => api.saveNewsFeeds(...a),
  runNewsNow: vi.fn(),
  runNewsAnalysisNow: (...a) => api.runNewsAnalysisNow(...a),
  getNewsAiLog: (...a) => api.getNewsAiLog(...a),
}));
const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() };
vi.mock('../../../web/src/shared/ui/FeedbackProvider.jsx', () => ({ useFeedback: () => ({ toast }) }));
import AdminNewsPage from '../../../web/src/features/admin/components/AdminNewsPage.jsx';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const EMPTY_LOG = { items: [], counts: {}, hours: 24, limit: 300, model: 'GLM 5.3 Flash' };

const DATA = {
  channels: [],
  status: { at: Date.now(), published: 0, aiCallsToday: 3, aiModel: 'GLM 5.3 Flash', aiError: '3040: capacity', channels: {} },
  limits: { aiCallsPerDay: 600, maxChannels: 20 },
  aiConfigured: true,
  model: 'GLM 5.3 Flash',
  analysisModel: 'GLM 5.3 Flash',
  analysisStatus: { at: Date.now(), model: '@cf/zai-org/glm-5.3-flash', ok: false, error: 'foreign-text' },
};

describe('the report', () => {
  it("today's totals, the last runs and the last published news", async () => {
    const at = Date.now();
    api.getNewsChannels.mockResolvedValue({
      ...DATA,
      status: {
        ...DATA.status,
        today: { checked: 42, notMarket: 25, duplicates: 4, sent: 13, rejected: 5, published: 8, aiCalls: 3, errors: 1 },
        runs: [{ at, checked: 5, notMarket: 2, duplicates: 0, sent: 3, rejected: 1, published: 2, waiting: 0, aiCalls: 1, error: '' }],
      },
      latest: [{ id: 'c/1', channel: 'c', channelTitle: 'خبری', url: 'https://t.me/c/1', title: 'خبر تازه', category: 'gold', importance: 3, publishedAt: at }],
    });
    render(<AdminNewsPage />);
    expect(await screen.findByText('گزارش اخبار')).toBeTruthy();
    expect(screen.getByText('۴۲')).toBeTruthy();
    expect(screen.getByText('پست بررسی‌شده')).toBeTruthy();
    expect(screen.getByText('منتشرشده').previousSibling.textContent).toBe('۸');
    expect(screen.getByRole('table', { name: 'آخرین اجراها' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'خبر تازه' }).getAttribute('href')).toBe('https://t.me/c/1');
  });
});

describe('model errors in the news panel', () => {
  it('shows the screening and the analysis errors, and that no other model was tried', async () => {
    api.getNewsChannels.mockResolvedValue(DATA);
    render(<AdminNewsPage />);
    expect(await screen.findByText(/خطای مدل GLM 5.3 Flash در آخرین اجرا/)).toBeTruthy();
    expect(screen.getByText('3040: capacity')).toBeTruthy();
    expect(screen.getByText(/متن جواب کلمه‌ی غیرفارسی داشت/)).toBeTruthy();
    expect(screen.getAllByText(/مدل دیگری امتحان نشد/)).toHaveLength(2);
  });

  it('«تحلیل الان» reports the model error', async () => {
    api.getNewsChannels.mockResolvedValue({ ...DATA, status: { ...DATA.status, aiError: '' }, analysisStatus: null });
    api.runNewsAnalysisNow.mockResolvedValue({
      result: { updated: false, reason: 'model-error', error: 'bad-answer' },
      analysisStatus: { at: Date.now(), ok: false, error: 'bad-answer' },
    });
    render(<AdminNewsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /تحلیل الان/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('مدل خطا داد: جواب قالب درستی نداشت (JSON)', { duration: 8000 }));
    expect(await screen.findByText(/جواب قالب درستی نداشت/)).toBeTruthy();
  });
});

describe('the international feeds', () => {
  it("lists each feed with how it did, and saves a new one apart from the channels", async () => {
    const feed = { id: 'cnbc_economy', title: 'CNBC', url: 'https://www.cnbc.com/rss', enabled: true };
    api.getNewsChannels.mockResolvedValue({
      ...DATA,
      feeds: [feed],
      status: { ...DATA.status, feeds: { cnbc_economy: { ok: true, items: 30, published: 4, title: 'CNBC' } } },
    });
    const added = { id: 'fxstreet_ab12', title: 'FXStreet', url: 'https://www.fxstreet.com/rss/news', enabled: true };
    api.saveNewsFeeds.mockResolvedValue({ feeds: [feed, added] });
    render(<AdminNewsPage />);
    expect(await screen.findByText('خبرگزاری‌های بین‌المللی (RSS)')).toBeTruthy();
    expect(screen.getByText(/۳۰ خبر در فید · ۴ خبر منتشرشده/)).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('نام (مثل Reuters)'), { target: { value: 'FXStreet' } });
    fireEvent.change(screen.getByPlaceholderText('https://example.com/rss'), { target: { value: 'https://www.fxstreet.com/rss/news' } });
    fireEvent.submit(screen.getByPlaceholderText('https://example.com/rss').closest('form'));
    const saveButtons = screen.getAllByText('ذخیره فهرست');
    fireEvent.click(saveButtons[saveButtons.length - 1]);
    await waitFor(() => expect(api.saveNewsFeeds).toHaveBeenCalledWith([feed, { title: 'FXStreet', url: 'https://www.fxstreet.com/rss/news', enabled: true }]));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('فهرست خبرگزاری‌ها ذخیره شد.'));
  });

  it('an address that is not http(s) is not added', async () => {
    api.getNewsChannels.mockResolvedValue({ ...DATA, feeds: [] });
    render(<AdminNewsPage />);
    const url = await screen.findByPlaceholderText('https://example.com/rss');
    fireEvent.change(url, { target: { value: 'not a feed' } });
    fireEvent.submit(url.closest('form'));
    expect(toast.error).toHaveBeenCalled();
    expect(screen.getByText('فیدی نیست')).toBeTruthy();
  });
});

describe('the channels', () => {
  it('marks a channel «ترجمه» and adds an English one, saved with the flag', async () => {
    const channel = { username: 'khabari', enabled: true, translate: false };
    api.getNewsChannels.mockResolvedValue({ ...DATA, channels: [channel], status: { ...DATA.status, channels: { khabari: { ok: true, title: 'خبری', published: 3 } } } });
    api.saveNewsChannels.mockImplementation(async (channels) => ({ channels }));
    render(<AdminNewsPage />);
    expect(await screen.findByText('کانال‌های خبری تلگرام')).toBeTruthy();
    expect(screen.getByText('۳ خبر منتشرشده')).toBeTruthy();

    fireEvent.click(screen.getAllByLabelText(/^ترجمه$/)[0]);
    fireEvent.change(screen.getByPlaceholderText('@channel یا t.me/channel'), { target: { value: 't.me/EN_Wire' } });
    fireEvent.click(screen.getByLabelText(/انگلیسی \(ترجمه\)/));
    fireEvent.submit(screen.getByPlaceholderText('@channel یا t.me/channel').closest('form'));
    expect(screen.getByText('تغییرات ذخیره نشده‌اند')).toBeTruthy();
    fireEvent.click(screen.getAllByText('ذخیره فهرست')[0]);
    await waitFor(() => expect(api.saveNewsChannels).toHaveBeenCalledWith([
      { username: 'khabari', enabled: true, translate: true },
      { username: 'en_wire', enabled: true, translate: true },
    ]));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('فهرست کانال‌ها ذخیره شد.'));
  });
});

describe('«درخواست‌های ردشده»', () => {
  it("lists the posts the model didn't publish, with the error and its answer, and filters by reason", async () => {
    api.getNewsChannels.mockResolvedValue(DATA);
    const at = Date.now();
    const failed = { id: 2, at, requestId: `${at}-1`, reason: 'unreadable', post: 'chan/7', channel: 'chan', url: 'https://t.me/chan/7', source: 'telegram', text: 'دلار جهش کرد', tries: 1, error: 'unreadable answer (no JSON verdicts)', answer: 'Sorry, I cannot' };
    const rejected = { id: 1, at, requestId: `${at}-1`, reason: 'rejected', post: 'chan/8', channel: 'chan', url: 'https://t.me/chan/8', source: 'telegram', text: 'تیم ملی برد', tries: 0, error: '', answer: '' };
    api.getNewsAiLog.mockImplementation(async (reason) => ({
      ...EMPTY_LOG,
      counts: { unreadable: 1, rejected: 1 },
      items: reason === 'unreadable' ? [failed] : [failed, rejected],
    }));
    render(<AdminNewsPage />);
    fireEvent.click(await screen.findByRole('tab', { name: 'درخواست‌های ردشده' }));
    const list = await screen.findByRole('list', { name: 'درخواست‌های ردشده' });
    expect(list.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByText('unreadable answer (no JSON verdicts)')).toBeTruthy();
    expect(screen.getByText('Sorry, I cannot')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'chan/7' }).getAttribute('href')).toBe('https://t.me/chan/7');

    fireEvent.click(screen.getByRole('tab', { name: 'جواب نامفهوم' }));
    await waitFor(() => expect(api.getNewsAiLog).toHaveBeenLastCalledWith('unreadable'));
    await waitFor(() => expect(screen.getByRole('list', { name: 'درخواست‌های ردشده' }).querySelectorAll('li')).toHaveLength(1));
  });

  it('says when nothing was rejected', async () => {
    api.getNewsChannels.mockResolvedValue(DATA);
    api.getNewsAiLog.mockResolvedValue(EMPTY_LOG);
    render(<AdminNewsPage />);
    expect(await screen.findByText('در این بازه چیزی نیست')).toBeTruthy();
  });
});
