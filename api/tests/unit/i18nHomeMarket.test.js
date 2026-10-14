/**
 * i18nHomeMarket.test.js — The home, market, news, reports and shared-UI helpers render in English
 * (and stay byte-identical in Persian)
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { registerMessages, setActiveLocale } from '../../src/domain/i18n.js';
import common from '../../../web/src/i18n/en/common.js';
import home from '../../../web/src/i18n/en/home.js';
import news from '../../../web/src/i18n/en/news.js';
import ui from '../../../web/src/i18n/en/ui.js';
import { timeAgo } from '../../../web/src/shared/utils/timeAgo.js';
import { calendarLocale } from '../../../web/src/shared/utils/dates.js';
import { newsTimeAgo, newsFullTime } from '../../../web/src/features/news/newsFormat.js';
import { recordOriginOf } from '../../../web/src/shared/ui/recordOrigin.js';
import { tomanEquivalent } from '../../../web/src/features/market/assetPrice.js';

beforeAll(() => {
  for (const dict of [common, home, news, ui]) registerMessages('en', dict);
});
afterEach(() => setActiveLocale('fa'));

describe('English rendering of shared helpers', () => {
  const now = Date.now();

  it('writes relative times in English and keeps Persian unchanged', () => {
    expect(timeAgo(now - 5 * 60000, now)).toBe('۵ دقیقه پیش');
    setActiveLocale('en');
    expect(timeAgo(now - 5 * 60000, now)).toBe('5 min ago');
    expect(timeAgo(now - 30000, now)).toBe('just now');
    expect(newsTimeAgo(now - 3 * 3600000, now)).toBe('3 h ago');
  });

  it('formats a news time on the Shamsi calendar with Latin digits in English', () => {
    setActiveLocale('en');
    expect(calendarLocale()).toBe('en-US-u-ca-persian');
    expect(newsFullTime(Date.UTC(2026, 2, 25, 10, 30))).toMatch(/Farvardin|Ordibehesht|Esfand/);
  });

  it('translates labels with placeholders', () => {
    setActiveLocale('en');
    expect(recordOriginOf({ source: 'sms' }).label).toBe('Imported automatically · SMS');
    expect(tomanEquivalent({ price: 1000, currency: 'usd', priceUsd: 1 })).toMatch(/^≈ .* toman$/);
  });
});
