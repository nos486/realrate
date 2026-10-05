// @vitest-environment happy-dom
/**
 * newsAnalysisLabUi.test.jsx — The admin's model lab for «تحلیل روز»: build today's input (shown as
 * sent), run it on the picked models, compare the answers (card, time, cost, errors) and choose a
 * model — publishing its answer; and the card's confidence and the day's drivers
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';

const api = {
  createNewsAnalysisLab: vi.fn(),
  runNewsAnalysisLabModel: vi.fn(),
  chooseNewsAnalysisModel: vi.fn(),
};
vi.mock('../../../web/src/features/news/newsApi.js', () => ({
  createNewsAnalysisLab: (...a) => api.createNewsAnalysisLab(...a),
  runNewsAnalysisLabModel: (...a) => api.runNewsAnalysisLabModel(...a),
  chooseNewsAnalysisModel: (...a) => api.chooseNewsAnalysisModel(...a),
}));
const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() };
vi.mock('../../../web/src/shared/ui/FeedbackProvider.jsx', () => ({ useFeedback: () => ({ toast }) }));
import AdminNewsAnalysisLab from '../../../web/src/features/admin/components/AdminNewsAnalysisLab.jsx';
import NewsAnalysisCard from '../../../web/src/features/news/NewsAnalysisCard.jsx';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const MODELS = [
  { id: '@cf/a', label: 'Model A', vendor: 'A', price: [0.44, 1.32] },
  { id: '@cf/b', label: 'Model B', vendor: 'B', price: [0.1, 0.3] },
];
const ANALYSIS = {
  title: 'دلار در انتظار مذاکرات',
  summary: 'تحلیل کوتاه.',
  outlook: [{ asset: 'usd', direction: 'up', confidence: 3, note: 'تحریم', evidence: ['c/1'] }],
  drivers: [{ id: 'c/1', title: 'خبر مهم', url: 'https://t.me/c/1', impact: 3, assets: ['usd'] }],
  points: [],
  risk: '',
};

describe('the model lab', () => {
  it('builds the input, runs the models and chooses one', async () => {
    api.createNewsAnalysisLab.mockResolvedValue({
      lab: { id: 'lab1', at: 1, newsCount: 4, messages: [{ role: 'system', content: 'You are the head' }, { role: 'user', content: 'N1 [10:00] خبر' }] },
      models: MODELS,
      current: '@cf/a',
    });
    api.runNewsAnalysisLabModel.mockImplementation(async (labId, model) => ({
      result: model === '@cf/a'
        ? { model, ok: true, durationMs: 4200, usage: { prompt_tokens: 3000, completion_tokens: 600 }, cost: 0.0021, analysis: ANALYSIS, raw: '{}' }
        : { model, ok: false, durationMs: 900, error: 'foreign-text', raw: 'nhẹ' },
    }));
    api.chooseNewsAnalysisModel.mockResolvedValue({ model: '@cf/a', published: true });
    const onChosen = vi.fn();
    render(<AdminNewsAnalysisLab aiConfigured current="@cf/a" onChosen={onChosen} />);

    fireEvent.click(screen.getByRole('button', { name: /ساختن ورودی امروز/ }));
    await screen.findByText(/ورودی‌ای که به مدل داده می‌شود/);
    expect(screen.getByText('You are the head')).toBeTruthy();
    expect(screen.getAllByRole('checkbox').every((c) => c.checked)).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /اجرای ۲ مدل/ }));
    await screen.findByText('دلار در انتظار مذاکرات');
    expect(api.runNewsAnalysisLabModel).toHaveBeenCalledWith('lab1', '@cf/a');
    expect(api.runNewsAnalysisLabModel).toHaveBeenCalledWith('lab1', '@cf/b');
    expect(await screen.findByText(/کلمه‌ی غیرفارسی/)).toBeTruthy();
    expect(screen.getByText(/۴٫۲ ثانیه/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /انتخاب و انتشار همین تحلیل/ }));
    await waitFor(() => expect(api.chooseNewsAnalysisModel).toHaveBeenCalledWith('@cf/a', 'lab1'));
    expect(onChosen).toHaveBeenCalledWith(MODELS[0]);
    expect(toast.success).toHaveBeenCalled();
  });

  it('no news yet: says so', async () => {
    api.createNewsAnalysisLab.mockResolvedValue({ lab: null, reason: 'no-news', models: MODELS, current: '@cf/a' });
    render(<AdminNewsAnalysisLab aiConfigured current="@cf/a" />);
    fireEvent.click(screen.getByRole('button', { name: /ساختن ورودی امروز/ }));
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith('امروز هنوز خبری نیست.'));
  });
});

describe('the analysis card', () => {
  it("shows each direction's confidence and the day's most important news", () => {
    render(<NewsAnalysisCard analysis={{ ...ANALYSIS, at: Date.now() }} />);
    expect(screen.getByLabelText('اطمینان زیاد')).toBeTruthy();
    expect(screen.getByText('مهم‌ترین خبرهای امروز')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'خبر مهم' }).getAttribute('href')).toBe('https://t.me/c/1');
    expect(screen.getByText('اثر زیاد')).toBeTruthy();
  });
});
