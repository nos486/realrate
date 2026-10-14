/**
 * portfolioI18n.test.js — Portfolio texts render in Persian by default and in English from the dictionary
 */

import { describe, it, expect, afterEach } from 'vitest';
import { registerMessages, setActiveLocale } from '../../src/domain/i18n.js';
import messages from '../../../web/src/i18n/en/portfolio.js';
import { describeDrift } from '../../../web/src/features/portfolio/utils/allocationTargets.js';

afterEach(() => setActiveLocale('fa'));

describe('portfolio i18n', () => {
  it('keeps the Persian sentence unchanged', () => {
    expect(describeDrift({ name: 'طلا', diff: 8 })).toBe('طلا ۸٪ بیشتر از هدف');
    expect(describeDrift({ name: 'طلا', diff: -8 })).toBe('طلا ۸٪ کمتر از هدف');
  });

  it('renders the English sentence with Latin digits', () => {
    registerMessages('en', messages);
    setActiveLocale('en');
    expect(describeDrift({ name: 'Gold', diff: 8 })).toBe('Gold 8% above target');
    expect(describeDrift({ name: 'Gold', diff: -8 })).toBe('Gold 8% below target');
  });
});
