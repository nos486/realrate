/**
 * cardFormula.test.js — A home card built from several assets with a formula: the formula is
 * parsed (never run as code) in Persian or Latin, kept in one form and shown in Persian; its value,
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
  FORMULA_PRESETS,
} from '../../src/domain/cardFormula.js';
import { sanitizeHomeLayout } from '../../src/domain/homeLayout.js';

describe('parsing a formula', () => {
  it('reads Persian letters, digits and signs, and keeps one stored form', () => {
    const p = parseFormula('الف ÷ (ب − الف) × ۱۰۰');
    expect(p).toMatchObject({ ok: true, expr: 'a/(b-a)*100', vars: ['a', 'b'] });
    expect(parseFormula('A / ( b - a ) * 100').expr).toBe('a/(b-a)*100');
    expect(formatFormula('a/(b-a)*100')).toBe('الف ÷ (ب − الف) × ۱۰۰');
    expect(parseFormula('-a + ۲٫۵ * د').vars).toEqual(['a', 'd']);
  });

  it('follows operator precedence and parentheses', () => {
    const v = (text, values) => evaluateFormula(parseFormula(text).tree, values);
    expect(v('a + b * c', { a: 1, b: 2, c: 3 })).toBe(7);
    expect(v('(a + b) * c', { a: 1, b: 2, c: 3 })).toBe(9);
    expect(v('a - b - c', { a: 10, b: 2, c: 3 })).toBe(5);
    expect(v('a / b / c', { a: 12, b: 2, c: 3 })).toBe(2);
    expect(v('-a * -b', { a: 2, b: 3 })).toBe(6);
  });

  it('says what is wrong, never runs anything else', () => {
    expect(parseFormula('').ok).toBe(false);
    expect(parseFormula('1 + 2').error).toMatch(/دست‌کم یک دارایی/);
    expect(parseFormula('a / (b').error).toMatch(/پرانتز/);
    expect(parseFormula('a +').error).toMatch(/ناتمام/);
    expect(parseFormula('a b').error).toBe('«ب» بی‌جا آمده است');
    expect(parseFormula('alert(1)').ok).toBe(false);
    expect(parseFormula('e').error).toMatch(/معتبر نیست/);
    expect(parseFormula('a'.repeat(81)).ok).toBe(false);
  });

  it('a value that is missing, or a division by zero, is no value', () => {
    const tree = parseFormula('a / b').tree;
    expect(evaluateFormula(tree, { a: 1, b: 0 })).toBeNull();
    expect(evaluateFormula(tree, { a: 1, b: null })).toBeNull();
    expect(evaluateFormula(tree, { a: 1 })).toBeNull();
  });
});

describe('the coin bubble percent (the ready formula)', () => {
  it('الف ÷ (ب − الف): the bubble over the coin\'s gold value, as a percent', () => {
    const preset = FORMULA_PRESETS.find((p) => p.key === 'bubble_pct');
    expect(formatFormula(preset.expr)).toBe('الف ÷ (ب − الف)');
    const value = evaluateFormula(parseFormula(preset.expr).tree, { a: 12_496_000, b: 76_100_000 });
    expect(formatFormulaValue(value, preset.format)).toBe('۱۹٫۶۵٪');
    expect(formatFormulaValue(value, 'number')).toBe('۰٫۱۹۶۵');
  });
});

describe('a formula\'s daily series', () => {
  it('the formula of each day\'s opens and closes, on the days every asset has', () => {
    const tree = parseFormula('a / (b - a)').tree;
    const series = formulaSeries(tree, {
      a: { days: ['d1', 'd2', 'd3'], points: [10, 20, 30], candles: [[8, 11, 7, 10], [10, 21, 9, 20], [20, 31, 19, 30]] },
      b: { days: ['d2', 'd3'], points: [120, 130], candles: [[110, 125, 100, 120], [120, 140, 115, 130]] },
    });
    expect(series.days).toEqual(['d2', 'd3']);
    expect(series.points).toEqual([0.2, 0.3]);
    // open: 10 / (110 − 10) = 0.1; close 0.2 → high 0.2, low 0.1
    expect(series.candles[0]).toEqual([0.1, 0.2, 0.1, 0.2]);
  });

  it('no series without every asset\'s', () => {
    expect(formulaSeries(parseFormula('a+b').tree, { a: { days: ['d1'], points: [1] }, b: { days: [], points: [] } })).toBeNull();
  });
});

describe('a formula card in a saved layout', () => {
  const def = { name: 'درصد حباب', expr: 'الف ÷ (ب − الف)', vars: { a: 'bubble_full_coin', b: 'full_coin', c: 'usd' }, format: 'percent' };

  it('is kept in one form, with only the assets its formula uses', () => {
    expect(sanitizeFormulaCard(def)).toEqual({ name: 'درصد حباب', expr: 'a/(b-a)', vars: { a: 'bubble_full_coin', b: 'full_coin' }, format: 'percent' });
    expect(sanitizeFormulaCard({ ...def, vars: { a: 'bubble_full_coin' } })).toBeNull(); // ب has no asset
    expect(sanitizeFormulaCard({ ...def, name: ' ' })).toBeNull();
    expect(sanitizeFormulaCard({ ...def, expr: 'a +' })).toBeNull();
    expect(sanitizeFormulaCard({ ...def, format: 'x' }).format).toBe('number');
    expect(sanitizeFormulaCard({ ...def, vars: { a: 'fx_abcd', b: 'usd' } })).toBeNull(); // not a card of a card
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
