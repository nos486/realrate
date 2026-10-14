/**
 * localeNews.test.js — the news is offered only in languages whose row says so (Persian today)
 */
import { describe, it, expect, afterEach } from 'vitest';
import { hasNews, setActiveLocale, LOCALES } from '../../src/domain/i18n.js';

describe('hasNews', () => {
  afterEach(() => setActiveLocale('fa'));

  it('follows the news field of the active language row', () => {
    for (const code of Object.keys(LOCALES)) {
      setActiveLocale(code);
      expect(hasNews()).toBe(LOCALES[code].news === true);
    }
  });

  it('is on for Persian and off for English', () => {
    setActiveLocale('fa');
    expect(hasNews()).toBe(true);
    setActiveLocale('en');
    expect(hasNews()).toBe(false);
  });
});
