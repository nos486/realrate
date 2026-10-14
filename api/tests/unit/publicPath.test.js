/**
 * publicPath.test.js — Links to the website's public pages follow the active language
 */
import { describe, it, expect, afterEach } from 'vitest';
import { publicPath } from '../../../web/src/shared/i18n/publicPath.js';
import { setActiveLocale } from '../../src/domain/i18n.js';

describe('publicPath', () => {
  afterEach(() => setActiveLocale('fa'));

  it('keeps Persian pages at the root', () => {
    setActiveLocale('fa');
    expect(publicPath('/features/portfolio')).toBe('/features/portfolio');
  });

  it('puts English pages under /en', () => {
    setActiveLocale('en');
    expect(publicPath('/faq')).toBe('/en/faq');
    expect(publicPath('/privacy')).toBe('/en/privacy');
  });
});
