// @vitest-environment happy-dom
/**
 * adminNewsErrors.test.jsx — The admin's news panel says when a model failed (screening or the
 * day's analysis) and that no other model was tried; «تحلیل الان» reports the model's error
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
  createNewsAnalysisLab: vi.fn(),
  runNewsAnalysisLabModel: vi.fn(),
  chooseNewsAnalysisModel: vi.fn(),
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
  analysisModel: { id: '@cf/zai-org/glm-5.3-flash', label: 'GLM 5.3 Flash' },
  analysisStatus: { at: Date.now(), model: '@cf/zai-org/glm-5.3-flash', ok: false, error: 'foreign-text' },
};

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
