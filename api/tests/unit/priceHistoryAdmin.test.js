// @vitest-environment happy-dom
/**
 * priceHistoryAdmin.test.js — The admin price history page: suggested mappings land on book items,
 * a preview offers the matching unit, "run all" goes dollar first, and stray ids can be removed
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor, screen } from '@testing-library/react';

const api = vi.hoisted(() => ({
  getHistoryAdmin: vi.fn(),
  saveHistoryMappings: vi.fn(),
  previewHistorySeries: vi.fn(),
  runHistoryBackfill: vi.fn(),
  editHistoryKeys: vi.fn(),
}));
vi.mock('../../../web/src/features/admin/api/adminApi.js', () => api);

const { default: PriceHistoryAdmin } = await import('../../../web/src/features/admin/components/PriceHistoryAdmin.jsx');
const { FeedbackProvider } = await import('../../../web/src/shared/ui/FeedbackProvider.jsx');

const catalog = [
  { slug: 'price_dollar_rl', label: 'دلار آزاد', group: 'ارز', unit: 'rial', suggest: 'usd' },
  { slug: 'ons', label: 'انس طلا', group: 'فلزات جهانی', unit: 'usd', suggest: 'ons_gold' },
  { slug: 'price_try', label: 'لیر ترکیه', group: 'ارز', unit: 'rial', suggest: 'try' },
  { slug: 'platinum', label: 'انس پلاتین', group: 'فلزات جهانی', unit: 'usd' },
];
const items = [
  { id: 'usd', name: 'دلار', category: 'currency', price: 100000 },
  { id: 'try', name: 'لیر', category: 'currency', price: 3000 },
  { id: 'ons_gold', name: 'انس طلا', category: 'gold', price: 400000000 },
];
const history = [
  { key: 'usd', name: 'دلار', inBook: true, days: 700, first: '2024-01-01', last: '2026-01-09' },
  { key: 'price_try', name: null, inBook: false, days: 300, first: '2025-01-01', last: '2026-01-08' },
];

const page = () => render(React.createElement(FeedbackProvider, null, React.createElement(PriceHistoryAdmin)));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  Object.values(api).forEach((fn) => fn.mockReset());
  api.getHistoryAdmin.mockResolvedValue({ catalog, items, history, mappings: [] });
  api.saveHistoryMappings.mockImplementation(async (mappings) => ({ mappings }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('price history admin', () => {
  it('adds the suggested series mapped to book items, and saves them', async () => {
    page();
    await screen.findByText('افزودن موارد پیشنهادی');
    fireEvent.click(screen.getByText('افزودن موارد پیشنهادی'));
    await vi.advanceTimersByTimeAsync(700);
    await waitFor(() => expect(api.saveHistoryMappings).toHaveBeenCalled());
    expect(api.saveHistoryMappings.mock.calls.at(-1)[0]).toEqual([
      { slug: 'price_dollar_rl', label: 'دلار آزاد', unit: 'rial', target: 'usd' },
      { slug: 'ons', label: 'انس طلا', unit: 'usd', target: 'ons_gold' },
      { slug: 'price_try', label: 'لیر ترکیه', unit: 'rial', target: 'try' },
    ]);
    expect(screen.getByText(/بارگذاری همه/).textContent).toContain('۳');
  });

  it('runs every mapping with a target, the dollar first and dollar series last', async () => {
    api.getHistoryAdmin.mockResolvedValue({
      catalog, items, history,
      mappings: [
        { slug: 'ons', label: 'انس طلا', unit: 'usd', target: 'ons_gold' },
        { slug: 'price_try', label: 'لیر', unit: 'rial', target: 'try' },
        { slug: 'platinum', label: 'پلاتین', unit: 'usd', target: '' },
        { slug: 'price_dollar_rl', label: 'دلار', unit: 'rial', target: 'usd' },
      ],
    });
    api.runHistoryBackfill.mockImplementation(async (b) => ({ ...b, written: 10, from: '2024-01-01', to: '2026-01-09' }));
    page();
    const runAll = await screen.findByText(/بارگذاری همه/);
    fireEvent.click(runAll);
    await waitFor(() => expect(api.runHistoryBackfill).toHaveBeenCalledTimes(3));
    expect(api.runHistoryBackfill.mock.calls.map(([b]) => b.slug)).toEqual(['price_dollar_rl', 'price_try', 'ons']);
    expect(api.runHistoryBackfill.mock.calls[0][0]).toMatchObject({ days: 730, overwrite: false, usdTarget: 'usd' });
  });

  it('previews a series and applies the unit that matches', async () => {
    api.getHistoryAdmin.mockResolvedValue({ catalog, items, history, mappings: [{ slug: 'price_try', label: 'لیر', unit: 'toman', target: 'try' }] });
    api.previewHistorySeries.mockResolvedValue({ slug: 'price_try', target: 'try', live: 3000, guess: { unit: 'rial', ratio: 1.003 }, latest: [{ day: '2026-01-08', open: 30000, high: 30500, low: 29500, close: 30100 }] });
    const { container } = page();
    fireEvent.click(await screen.findByText('پیش‌نمایش'));
    await screen.findByText('اعمال');
    expect(api.previewHistorySeries).toHaveBeenCalledWith('price_try', 'try');
    expect(container.querySelectorAll('.history-preview-table tbody tr')).toHaveLength(1);
    fireEvent.click(screen.getByText('اعمال'));
    expect(container.querySelector('.history-select.is-unit').value).toBe('rial');
  });

  it('lists stray ids and deletes them after a confirmation', async () => {
    api.editHistoryKeys.mockResolvedValue({ keys: ['price_try'], deleted: 300, history: [history[0]] });
    const { container } = page();
    const button = await screen.findByText(/حذف همه‌ی بی‌استفاده‌ها/);
    expect(container.querySelectorAll('.history-key.is-orphan')).toHaveLength(1);
    fireEvent.click(button);
    fireEvent.click(await screen.findByText('حذف', { selector: 'button, button *' }));
    await waitFor(() => expect(api.editHistoryKeys).toHaveBeenCalledWith({ action: 'delete-orphans' }));
    await waitFor(() => expect(container.querySelectorAll('.history-key.is-orphan')).toHaveLength(0));
  });
});
