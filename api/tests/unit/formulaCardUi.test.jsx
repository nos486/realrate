// @vitest-environment happy-dom
/**
 * formulaCardUi.test.jsx — A home card built with a formula: its value at the book's prices and the
 * formula with which asset each letter is; turned, its chart from its assets' series in one request;
 * «کارت ترکیبی» fills the ready coin-bubble formula and saves a complete card only
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, within, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ getSparklines: vi.fn() }));
vi.mock('../../../web/src/features/market/api/marketApi.js', () => api);

const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();
const itemMap = {
  full_coin: { id: 'full_coin', name: 'سکه امامی', price: 76_100_000, updatedAt: minutesAgo(5) },
  bubble_full_coin: { id: 'bubble_full_coin', name: 'حباب سکه امامی', price: 12_496_000, updatedAt: minutesAgo(20) },
};
const searchAssets = (q) => Object.values(itemMap).filter((a) => !q || a.name.includes(q));
vi.mock('../../../web/src/features/market/context/PricingContext.jsx', () => ({ usePricing: () => ({ itemMap, searchAssets }) }));

const { default: HomeAssetCard } = await import('../../../web/src/features/home/HomeAssetCard.jsx');
const { default: FormulaCardModal } = await import('../../../web/src/features/home/FormulaCardModal.jsx');
const { buildAssetIndex, resolveFormulaCard } = await import('../../../web/src/features/home/homeAssets.js');
const { clearAssetCandlesCache } = await import('../../../web/src/features/home/useAssetCandles.js');
const { saveFormulaCard, removeItem } = await import('../../../web/src/features/home/homeLayoutModel.js');

afterEach(() => {
  cleanup();
  clearAssetCandlesCache();
  api.getSparklines.mockReset();
});

const index = buildAssetIndex({ itemMap, analysis: [] });
const def = { name: 'درصد حباب سکه', expr: 'x/(y-x)', vars: { x: 'bubble_full_coin', y: 'full_coin' }, format: 'percent' };

describe('a formula card', () => {
  it('shows the formula\'s value, the formula with its assets, and its stalest asset\'s time', () => {
    const card = resolveFormulaCard('fx_abcd', def, index);
    const { container } = render(<HomeAssetCard asset={card} style="detailed" />);
    expect(container.querySelector('.pro-card-price-value').textContent).toBe('۱۹٫۶۵٪');
    expect(screen.getByText('x / (y - x)')).toBeTruthy();
    const caption = document.querySelector('.home-formula-caption').textContent;
    expect(caption).toContain('x: حباب سکه امامی');
    expect(caption).toContain('y: سکه امامی');
    expect(screen.getByText('به‌روزرسانی ۲۰ دقیقه پیش')).toBeTruthy();
  });

  it('turned, draws the formula of its assets\' daily candles, fetched in one request', async () => {
    api.getSparklines.mockResolvedValue({ available: true, sparklines: {
      bubble_full_coin: { days: ['2026-10-06', '2026-10-07'], points: [10, 20], candles: [[10, 10, 10, 10], [10, 20, 10, 20]] },
      full_coin: { days: ['2026-10-06', '2026-10-07'], points: [110, 120], candles: [[110, 110, 110, 110], [110, 120, 110, 120]] },
    } });
    const { container } = render(<HomeAssetCard asset={resolveFormulaCard('fx_abcd', def, index)} style="detailed" />);
    fireEvent.click(container.querySelector('.home-pro-card'));
    await waitFor(() => expect(container.querySelector('.pro-card-chart')).toBeTruthy());
    expect(api.getSparklines).toHaveBeenCalledTimes(1);
    expect(api.getSparklines.mock.calls[0][0]).toEqual(['bubble_full_coin', 'full_coin']);
  });

  it('shows its highest, lowest and average value over its window, from the chart\'s one request', async () => {
    api.getSparklines.mockResolvedValue({ available: true, sparklines: {
      bubble_full_coin: { days: ['d1', 'd2', 'd3'], points: [10, 20, 15], candles: [[10, 10, 10, 10], [20, 20, 20, 20], [15, 15, 15, 15]] },
      full_coin: { days: ['d1', 'd2', 'd3'], points: [110, 120, 115], candles: [[110, 110, 110, 110], [120, 120, 120, 120], [115, 115, 115, 115]] },
    } });
    const { container } = render(<HomeAssetCard asset={resolveFormulaCard('fx_abcd', { ...def, stats: '30d' }, index)} style="detailed" />);
    // 10/100 = 10%, 20/100 = 20%, 15/100 = 15%
    await waitFor(() => expect(container.querySelector('.pro-metric strong').textContent).toBe('۲۰٪'));
    const cells = [...container.querySelectorAll('.pro-metric')].map((el) => [...el.children].map((c) => c.textContent));
    expect(cells).toEqual([['بیشینه ۳۰ روز', '۲۰٪'], ['کمینه ۳۰ روز', '۱۰٪'], ['میانگین ۳۰ روز', '۱۵٪']]);
    expect(api.getSparklines).toHaveBeenCalledTimes(1);
    expect(api.getSparklines.mock.calls[0][1]).toBe('30d');
  });

  it('a compact card shows its value', () => {
    const { container } = render(<HomeAssetCard asset={resolveFormulaCard('fx_abcd', def, index)} style="compact" />);
    expect(container.querySelector('.curr-price-val').textContent).toBe('۱۹٫۶۵٪');
  });

  it('a missing asset: no value', () => {
    const card = resolveFormulaCard('fx_abcd', { ...def, vars: { x: 'gone', y: 'full_coin' } }, index);
    expect(card.value).toBeNull();
    render(<HomeAssetCard asset={card} style="detailed" />);
    expect(screen.getByText('نرخ در دسترس نیست')).toBeTruthy();
  });
});

describe('«کارت ترکیبی»', () => {
  it('the ready formula fills the card; it is saved as stored', () => {
    const onSave = vi.fn();
    render(<FormulaCardModal formula={null} onSave={onSave} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'افزودن کارت' }).disabled).toBe(true);
    // One ready formula per coin
    for (const name of ['درصد حباب سکه امامی', 'درصد حباب نیم سکه', 'درصد حباب ربع سکه']) expect(screen.getByRole('button', { name })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'درصد حباب سکه امامی' }));
    expect(screen.getByRole('status').textContent).toContain('۱۹٫۶۵٪');
    fireEvent.click(screen.getByRole('button', { name: 'افزودن کارت' }));
    expect(onSave).toHaveBeenCalledWith({
      name: 'درصد حباب سکه امامی', expr: 'x/(y-x)', vars: { x: 'bubble_full_coin', y: 'full_coin' }, format: 'percent', stats: '30d',
    });
  });

  it('says what is wrong with a formula and saves nothing until each letter has an asset', () => {
    render(<FormulaCardModal formula={null} onSave={() => {}} onClose={() => {}} />);
    const [name, formula] = screen.getAllByRole('textbox');
    fireEvent.change(name, { target: { value: 'نسبت' } });
    fireEvent.change(formula, { target: { value: 'x / (' } });
    expect(screen.getByText(/ناتمام/)).toBeTruthy();
    fireEvent.change(formula, { target: { value: 'x / y' } });
    expect(screen.getByRole('button', { name: 'افزودن کارت' }).disabled).toBe(true);
    const pickers = document.querySelectorAll('.formula-var');
    expect(pickers).toHaveLength(2);
    fireEvent.click(within(pickers[0]).getByRole('button', { name: /حباب سکه امامی/ }));
    fireEvent.click(within(document.querySelectorAll('.formula-var')[1]).getByRole('button', { name: /^سکه امامی/ }));
    expect(screen.getByRole('button', { name: 'افزودن کارت' }).disabled).toBe(false);
  });
});

describe('the layout', () => {
  it('adds a formula card to a section, edits it, and drops its definition with the card', () => {
    const layout = { version: 1, sections: [{ id: 's1', title: '', style: 'detailed', items: ['usd'] }] };
    const added = saveFormulaCard(layout, 's1', null, def);
    const id = added.sections[0].items[1];
    expect(id).toMatch(/^fx_[a-z0-9]+$/);
    expect(added.sections[0].formulas[id]).toEqual(def);
    const edited = saveFormulaCard(added, 's1', id, { ...def, name: 'تازه' });
    expect(edited.sections[0].items).toHaveLength(2);
    expect(edited.sections[0].formulas[id].name).toBe('تازه');
    expect(removeItem(edited, 's1', id).sections[0].formulas).toBeUndefined();
  });
});
