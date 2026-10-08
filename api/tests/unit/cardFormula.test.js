/**
 * cardFormula.test.js — A home card built from several assets with a formula: the formula is
 * parsed (never run as code) with x, y, z, w, kept in one form and shown left to right; its value,
 * its daily series from its assets' series, and its place in a saved layout
 */

import { describe, it, expect } from 'vitest';
import {
  parseFormula,
  evaluateFormula,
  formatFormula,
  formatFormulaValue,
  formulaSeries,
  sanitizeFormulaCard,
  isFormulaId,
  seriesStats,
  formatFormulaShown,
  FORMULA_PRESETS,
} from '../../src/domain/cardFormula.js';
import { sanitizeHomeLayout } from '../../src/domain/homeLayout.js';

describe('parsing a formula', () => {
  it('reads x, y, z, w (any case), Persian digits and signs, and keeps one stored form', () => {
    const p = parseFormula('x / (Y - x) * ۱۰۰');
    expect(p).toMatchObject({ ok: true, expr: 'x/(y-x)*100', vars: ['x', 'y'] });
    expect(parseFormula('x ÷ (y − x) × 100').expr).toBe('x/(y-x)*100');
    expect(formatFormula('x/(y-x)*100')).toBe('x / (y - x) * 100');
    expect(parseFormula('-x + 2.5 * w').vars).toEqual(['x', 'w']);
  });

  it('a card saved with the first letters (a, b, c, d) reads as x, y, z, w', () => {
    expect(parseFormula('a/(b-a)').expr).toBe('x/(y-x)');
    expect(sanitizeFormulaCard({ name: 'n', expr: 'a/(b-a)', vars: { a: 'bubble_full_coin', b: 'full_coin' }, format: 'percent' }))
      .toEqual({ name: 'n', expr: 'x/(y-x)', vars: { x: 'bubble_full_coin', y: 'full_coin' }, format: 'percent' });
  });

  it('follows operator precedence and parentheses', () => {
    const v = (text, values) => evaluateFormula(parseFormula(text).tree, values);
    expect(v('x + y * z', { x: 1, y: 2, z: 3 })).toBe(7);
    expect(v('(x + y) * z', { x: 1, y: 2, z: 3 })).toBe(9);
    expect(v('x - y - z', { x: 10, y: 2, z: 3 })).toBe(5);
    expect(v('x / y / z', { x: 12, y: 2, z: 3 })).toBe(2);
    expect(v('-x * -y', { x: 2, y: 3 })).toBe(6);
  });

  it('says what is wrong, never runs anything else', () => {
    expect(parseFormula('').ok).toBe(false);
    expect(parseFormula('1 + 2').error).toMatch(/دست‌کم یک دارایی/);
    expect(parseFormula('x / (y').error).toMatch(/پرانتز/);
    expect(parseFormula('x +').error).toMatch(/ناتمام/);
    expect(parseFormula('x y').error).toBe('«y» بی‌جا آمده است');
    expect(parseFormula('alert(1)').ok).toBe(false);
    expect(parseFormula('max(x)').ok).toBe(false);
    expect(parseFormula('e').error).toMatch(/معتبر نیست/);
    expect(parseFormula('x'.repeat(81)).ok).toBe(false);
  });

  it('a value that is missing, or a division by zero, is no value', () => {
    const tree = parseFormula('x / y').tree;
    expect(evaluateFormula(tree, { x: 1, y: 0 })).toBeNull();
    expect(evaluateFormula(tree, { x: 1, y: null })).toBeNull();
    expect(evaluateFormula(tree, { x: 1 })).toBeNull();
  });
});

describe('the ready formulas: each coin\'s bubble percent', () => {
  it('one per coin bubble in the specs: x = the bubble, y = its coin, a percent with 30-day stats', () => {
    expect(FORMULA_PRESETS.map((p) => p.vars)).toEqual([
      { x: 'bubble_full_coin', y: 'full_coin' },
      { x: 'bubble_half_coin', y: 'half_coin' },
      { x: 'bubble_quarter_coin', y: 'quarter_coin' },
      { x: 'bubble_gerami_coin', y: 'gerami_coin' },
    ]);
    for (const p of FORMULA_PRESETS) {
      expect(p).toMatchObject({ expr: 'x/(y-x)', format: 'percent', stats: '30d' });
      expect(sanitizeFormulaCard({ name: p.label, ...p })).toBeTruthy();
    }
    expect(FORMULA_PRESETS.map((p) => p.label)).toContain('درصد حباب نیم سکه');
  });

  it('x / (y - x): the bubble over the coin\'s gold value, as a percent', () => {
    const preset = FORMULA_PRESETS[0];
    expect(formatFormula(preset.expr)).toBe('x / (y - x)');
    const value = evaluateFormula(parseFormula(preset.expr).tree, { x: 12_496_000, y: 76_100_000 });
    expect(formatFormulaValue(value, preset.format)).toBe('۱۹٫۶۵٪');
    expect(formatFormulaValue(value, 'number')).toBe('۰٫۱۹۶۵');
  });
});

describe('a formula card\'s statistics', () => {
  it('the highest, lowest and average value of its series', () => {
    expect(seriesStats([18, 22, 20])).toEqual({ max: 22, min: 18, avg: 20, days: 3 });
    expect(seriesStats([])).toBeNull();
    expect(formatFormulaShown(19.6, 'percent')).toBe('۱۹٫۶٪');
  });

  it('a window of 30 days or a year is kept; any other is dropped', () => {
    const base = { name: 'n', expr: 'x', vars: { x: 'usd' } };
    expect(sanitizeFormulaCard({ ...base, stats: '1y' }).stats).toBe('1y');
    expect(sanitizeFormulaCard({ ...base, stats: '7d' })).not.toHaveProperty('stats');
    expect(sanitizeFormulaCard(base)).not.toHaveProperty('stats');
  });
});

describe('a formula\'s daily series', () => {
  it('the formula of each day\'s opens and closes, on the days every asset has', () => {
    const tree = parseFormula('x / (y - x)').tree;
    const series = formulaSeries(tree, {
      x: { days: ['d1', 'd2', 'd3'], points: [10, 20, 30], candles: [[8, 11, 7, 10], [10, 21, 9, 20], [20, 31, 19, 30]] },
      y: { days: ['d2', 'd3'], points: [120, 130], candles: [[110, 125, 100, 120], [120, 140, 115, 130]] },
    });
    expect(series.days).toEqual(['d2', 'd3']);
    expect(series.points).toEqual([0.2, 0.3]);
    // open: 10 / (110 − 10) = 0.1; close 0.2 → high 0.2, low 0.1
    expect(series.candles[0]).toEqual([0.1, 0.2, 0.1, 0.2]);
  });

  it('no series without every asset\'s', () => {
    expect(formulaSeries(parseFormula('x+y').tree, { x: { days: ['d1'], points: [1] }, y: { days: [], points: [] } })).toBeNull();
  });
});

describe('a formula card in a saved layout', () => {
  const def = { name: 'درصد حباب', expr: 'x / (y - x)', vars: { x: 'bubble_full_coin', y: 'full_coin', z: 'usd' }, format: 'percent' };

  it('is kept in one form, with only the assets its formula uses', () => {
    expect(sanitizeFormulaCard(def)).toEqual({ name: 'درصد حباب', expr: 'x/(y-x)', vars: { x: 'bubble_full_coin', y: 'full_coin' }, format: 'percent' });
    expect(sanitizeFormulaCard({ ...def, vars: { x: 'bubble_full_coin' } })).toBeNull(); // y has no asset
    expect(sanitizeFormulaCard({ ...def, name: ' ' })).toBeNull();
    expect(sanitizeFormulaCard({ ...def, expr: 'x +' })).toBeNull();
    expect(sanitizeFormulaCard({ ...def, format: 'q' }).format).toBe('number');
    expect(sanitizeFormulaCard({ ...def, vars: { x: 'fx_abcd', y: 'usd' } })).toBeNull(); // not a card of a card
  });

  it('a section keeps a formula card only with its definition, and a definition only with its card', () => {
    const layout = sanitizeHomeLayout({ sections: [{
      id: 's1', style: 'detailed',
      items: ['fx_abcd', 'fx_nodef', 'usd', 'fx_bad!'],
      formulas: { fx_abcd: def, fx_orphan: { ...def, name: 'بی‌کارت' } },
    }] });
    expect(layout.sections[0].items).toEqual(['fx_abcd', 'usd']);
    expect(Object.keys(layout.sections[0].formulas)).toEqual(['fx_abcd']);
    expect(isFormulaId('fx_abcd')).toBe(true);
    expect(isFormulaId('full_coin')).toBe(false);
  });
});
