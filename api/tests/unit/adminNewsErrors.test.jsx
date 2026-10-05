// @vitest-environment happy-dom
/**
 * adminNewsErrors.test.jsx — The admin's news panel: the report (today's totals, the last runs,
 * the last published news); it says when the model failed (screening or the day's analysis) and
 * that no other model was tried; «تحلیل الان» reports the model's error
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';

const api = { getNewsChannels: vi.fn(), runNewsAnalysisNow: vi.fn() };
vi.mock('../../../web/src/features/news/newsApi.js', () => ({
  getNewsChannels: (...a) => api.getNewsChannels(...a),
  saveNewsChannels: vi.fn(),
  runNewsNow: vi.fn(),
  runNewsAnalysisNow: (...a) => api.runNewsAnalysisNow(...a),
}));
const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() };
vi.mock('../../../web/src/shared/ui/FeedbackProvider.jsx', () => ({ useFeedback: () => ({ toast }) }));
import AdminNewsPage from '../../../web/src/features/admin/components/AdminNewsPage.jsx';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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
    expect(await screen.findByText(/مدل GLM 5.3 Flash در آخرین اجرا خطا داد \(3040: capacity\)/)).toBeTruthy();
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
