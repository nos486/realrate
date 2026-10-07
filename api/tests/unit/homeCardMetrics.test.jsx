// @vitest-environment happy-dom
/**
 * homeCardMetrics.test.jsx — A home card set to show more than its last price: an average as its
 * main figure, slots with a linked asset's values (a coin's bubble), when it was last updated;
 * «تنظیم کارت» saves the choices into the layout
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, within } from '@testing-library/react';

vi.mock('../../../web/src/features/market/api/marketApi.js', () => ({ getSparklines: vi.fn() }));
const { default: HomeAssetCard } = await import('../../../web/src/features/home/HomeAssetCard.jsx');
const { default: CardSettingsModal } = await import('../../../web/src/features/home/CardSettingsModal.jsx');
const { buildAssetIndex, resolveHomeAsset, cardOptionsOf } = await import('../../../web/src/features/home/homeAssets.js');
const { setCardSettings } = await import('../../../web/src/features/home/homeLayoutModel.js');

afterEach(cleanup);

const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();
const itemMap = {
  full_coin: {
    id: 'full_coin', name: 'سکه امامی', price: 100_000_000, sourceId: 's', updatedAt: minutesAgo(30), category: 'coin',
    params: { avg: { '30d': { value: 95_000_000, days: 30 }, '1y': { value: 80_000_000, days: 200 } }, changePercent: 1 },
  },
  bubble_full_coin: {
    id: 'bubble_full_coin', name: 'حباب سکه امامی', price: 20_000_000, sourceId: 't', category: 'bubble',
    params: { bubblePct: 25, avg: { '30d': { value: 18_000_000, days: 30 } } },
  },
};
const index = buildAssetIndex({ itemMap, analysis: [] });

describe('a card set to show more', () => {
  it('its average as the main figure, a linked bubble in its slots, and when it was updated', () => {
    const asset = resolveHomeAsset('full_coin', index, null, { main: 'avg:30d', slots: ['bubble/price', 'bubble/bubblePct', 'avg:1y'] });
    const { container } = render(<HomeAssetCard asset={asset} style="detailed" />);
    const front = container.querySelector('.pro-card-face.is-front');
    expect(front.querySelector('.pro-card-price-value').textContent).toBe('۹۵٬۰۰۰٬۰۰۰');
    expect(within(front).getByText(/میانگین ۳۰ روز · آخرین قیمت ۱۰۰٬۰۰۰٬۰۰۰/)).toBeTruthy();
    expect(within(front).getByText('به‌روزرسانی ۳۰ دقیقه پیش')).toBeTruthy();

    // Each slot: its label, the linked asset's name (a linked slot) and its value
    const slots = [...front.querySelectorAll('.pro-metric')].map((el) => [...el.children].map((c) => c.textContent));
    expect(slots).toEqual([
      ['آخرین قیمت', 'حباب سکه امامی', '۲۰٬۰۰۰٬۰۰۰'],
      ['درصد حباب', 'حباب سکه امامی', '۲۵٫۰٪'],
      ['میانگین یک سال', '۸۰٬۰۰۰٬۰۰۰'],
    ]);
    // An average of fewer days than its window says so
    expect(front.querySelectorAll('.pro-metric')[2].getAttribute('title')).toContain('از ۲۰۰ روز ثبت‌شده');
  });

  it('a compact card shows its average with a label', () => {
    const asset = resolveHomeAsset('full_coin', index, null, { main: 'avg:1y' });
    const { container } = render(<HomeAssetCard asset={asset} style="compact" />);
    expect(container.querySelector('.curr-price-val').textContent).toContain('۸۰٬۰۰۰٬۰۰۰');
    expect(screen.getByText('میانگین یک سال')).toBeTruthy();
  });

  it('a chosen average the item doesn\'t have yet falls back to the last price, and says so', () => {
    const asset = resolveHomeAsset('bubble_full_coin', index, null, { main: 'avg:1y' });
    expect(asset.main).toBeNull();
    render(<HomeAssetCard asset={asset} style="detailed" />);
    expect(screen.getByText(/میانگین یک سال هنوز ثبت نشده/)).toBeTruthy();
  });
});

describe('«تنظیم کارت»', () => {
  it('offers the averages it has and its linked bubble, and saves the choices in order', () => {
    const asset = resolveHomeAsset('full_coin', index);
    const options = cardOptionsOf('full_coin', index);
    expect(options.main.map((o) => o.key)).toEqual(['price', 'avg:30d', 'avg:1y']);
    const onSave = vi.fn();
    render(<CardSettingsModal asset={asset} options={options} settings={null} detailed onSave={onSave} onClose={() => {}} />);

    fireEvent.click(screen.getByRole('radio', { name: /میانگین ۳۰ روز/ }));
    const bubbleGroup = screen.getByRole('heading', { name: 'حباب سکه امامی' }).parentElement;
    fireEvent.click(within(bubbleGroup).getByRole('checkbox', { name: /درصد حباب/ }));
    fireEvent.click(within(bubbleGroup).getByRole('checkbox', { name: /آخرین قیمت/ }));
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }));
    expect(onSave).toHaveBeenCalledWith({ main: 'avg:30d', slots: ['bubble/bubblePct', 'bubble/price'] });
  });

  it('«پیش‌فرض» clears the card\'s settings from the layout', () => {
    const onSave = vi.fn();
    render(<CardSettingsModal asset={resolveHomeAsset('full_coin', index)} options={cardOptionsOf('full_coin', index)}
      settings={{ main: 'avg:1y', slots: ['avg:30d'] }} detailed onSave={onSave} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'پیش‌فرض' }));
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }));
    expect(onSave).toHaveBeenCalledWith(null);

    const layout = { version: 1, sections: [{ id: 's1', title: '', style: 'detailed', items: ['full_coin'], cards: { full_coin: { main: 'avg:1y' } } }] };
    const set = setCardSettings(layout, 's1', 'full_coin', { main: 'avg:30d', slots: ['bubble/price'] });
    expect(set.sections[0].cards).toEqual({ full_coin: { main: 'avg:30d', slots: ['bubble/price'] } });
    expect(setCardSettings(set, 's1', 'full_coin', null).sections[0].cards).toBeUndefined();
  });
});
