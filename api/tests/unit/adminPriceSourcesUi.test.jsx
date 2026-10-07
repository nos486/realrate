// @vitest-environment happy-dom
/**
 * adminPriceSourcesUi.test.jsx — The admin's price sources page: the two groups (base rates, and
 * multi-output feeds and catalogs), each source's interval, status and error, a dry-run test shown
 * in place, and a feed's full items on demand
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent, within } from '@testing-library/react';

const api = {
  getPriceSources: vi.fn(),
  getPriceSourceItems: vi.fn(),
  testPriceSource: vi.fn(),
  syncPriceSource: vi.fn(),
};
vi.mock('../../../web/src/features/admin/api/adminApi.js', () => ({
  getPriceSources: (...a) => api.getPriceSources(...a),
  getPriceSourceItems: (...a) => api.getPriceSourceItems(...a),
  testPriceSource: (...a) => api.testPriceSource(...a),
  syncPriceSource: (...a) => api.syncPriceSource(...a),
  setPriceSourceActive: vi.fn(),
  setPrimarySource: vi.fn(),
  fetchAllSourcesNow: vi.fn(),
}));
const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() };
vi.mock('../../../web/src/shared/ui/FeedbackProvider.jsx', () => ({ useFeedback: () => ({ toast }) }));
import AdminPriceSourcesPage from '../../../web/src/features/admin/components/AdminPriceSourcesPage.jsx';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const now = Date.now();
const iso = (sec) => new Date(now + sec * 1000).toISOString();
const base = {
  brand: '', adapterName: 'کانال‌های تلگرام', market: null, category: 'currency', categoryName: 'ارز', unit: 'تومان',
  isActive: true, isPrimary: true, isReferenceRate: false, guard: { maxJumpPct: 25, confirmTicks: 3 }, held: 0, series: null,
};
const DATA = {
  success: true,
  tickSec: 60,
  summary: { total: 2, ok: 1, error: 1, stale: 0, pending: 0, off: 0 },
  sources: [
    {
      ...base, id: 'src_def_usd', name: 'دلار آزاد', sourceType: 'telegram', kind: 'single', kindLabel: 'تک‌نرخی',
      priceType: 'usd', quote: 'toman', quoteLabel: 'تومان', endpoint: 'tahran_sabza', count: 1, price: 95500, preview: [],
      schedule: { status: 'ok', intervalSec: 300, staleAfterSec: 1800, syncedAt: iso(-60), failedAt: null, error: null, nextDueAt: iso(240) },
    },
    {
      ...base, id: 'src_def_bourse', name: 'بورس تهران', sourceType: 'bourse_symbols', adapterName: 'بورس تهران (BRS API)', kind: 'catalog',
      kindLabel: 'کاتالوگ', priceType: 'bourse', quote: 'toman', quoteLabel: 'تومان', endpoint: 'https://api.example/bourse', count: 1200, price: null,
      preview: [{ id: 'فولاد', name: 'فولاد مبارکه', price: 540 }],
      schedule: { status: 'error', intervalSec: 3600, staleAfterSec: 18000, syncedAt: iso(-7200), failedAt: iso(-120), error: 'پاسخ وب‌سرویس بورس: 503', nextDueAt: iso(3480) },
    },
  ],
};

describe('the price sources page', () => {
  it('groups sources by kind and shows each one\'s interval, status, error and price', async () => {
    api.getPriceSources.mockResolvedValue(DATA);
    render(<AdminPriceSourcesPage />);
    const baseGroup = await screen.findByRole('region', { name: /سورس‌های نرخ پایه/ });
    const feeds = screen.getByRole('region', { name: /هاب سورس‌های چند خروجی/ });

    expect(within(baseGroup).getByText('دلار آزاد')).toBeTruthy();
    expect(within(baseGroup).getByText('هر ۵ دقیقه')).toBeTruthy();
    expect(within(baseGroup).getByText('۹۵٬۵۰۰ تومان')).toBeTruthy();
    expect(within(baseGroup).queryByText('بورس تهران')).toBeNull();

    expect(within(feeds).getByText('بورس تهران')).toBeTruthy();
    expect(within(feeds).getByText('هر ۱ ساعت')).toBeTruthy();
    expect(within(feeds).getByText('۱٬۲۰۰')).toBeTruthy();
    expect(within(feeds).getByText(/پاسخ وب‌سرویس بورس: 503/)).toBeTruthy();
    expect(within(feeds).getByText('خطا')).toBeTruthy();
  });

  it('shows a dry-run test in place, saying nothing was kept', async () => {
    api.getPriceSources.mockResolvedValue(DATA);
    api.testPriceSource.mockResolvedValue({ success: true, count: 1, price: 96000, sample: [{ id: 'src_def_usd', price: 96000 }], ms: 420 });
    render(<AdminPriceSourcesPage />);
    const baseGroup = await screen.findByRole('region', { name: /سورس‌های نرخ پایه/ });
    fireEvent.click(within(baseGroup).getByRole('button', { name: 'تست' }));
    expect(await within(baseGroup).findByText('۹۶٬۰۰۰ تومان')).toBeTruthy();
    expect(within(baseGroup).getByText(/چیزی ذخیره نشد/)).toBeTruthy();
    expect(api.testPriceSource).toHaveBeenCalledWith('src_def_usd');
  });

  it('opens a catalog\'s full items, searchable', async () => {
    api.getPriceSources.mockResolvedValue(DATA);
    api.getPriceSourceItems.mockResolvedValue({ success: true, items: [{ id: 'فولاد', name: 'فولاد مبارکه', price: 540 }, { id: 'فملی', name: 'ملی مس', price: 680 }] });
    render(<AdminPriceSourcesPage />);
    const feeds = await screen.findByRole('region', { name: /هاب سورس‌های چند خروجی/ });
    fireEvent.click(within(feeds).getByRole('button', { name: 'همه‌ی اقلام' }));
    expect(await screen.findByText('ملی مس')).toBeTruthy();
    expect(api.getPriceSourceItems).toHaveBeenCalledWith('src_def_bourse');
    fireEvent.change(screen.getByPlaceholderText('جستجوی نماد یا نام…'), { target: { value: 'فملی' } });
    expect(screen.queryByText('ملی مس')).toBeTruthy();
    expect(screen.queryAllByText('فولاد مبارکه').length).toBe(1); // only the row's preview, not the table
  });
});
