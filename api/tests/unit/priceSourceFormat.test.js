/**
 * priceSourceFormat.test.js — How the admin's price sources page words a source's interval,
 * times, status and price (web features/admin/utils/priceSourceFormat.js)
 */

import { describe, it, expect } from 'vitest';
import {
  durationText, intervalText, relativeTime, nextFetchText, quotePrice, sharedPriceTypes, sourceMatches,
  SOURCE_STATUS, SOURCE_STATUS_ORDER,
} from '../../../web/src/features/admin/utils/priceSourceFormat.js';

const NOW = Date.parse('2026-05-01T12:00:00Z');
const at = (sec) => new Date(NOW + sec * 1000).toISOString();

describe('price source wording', () => {
  it('words an interval in seconds, minutes, hours or days', () => {
    expect(durationText(30)).toBe('۳۰ ثانیه');
    expect(durationText(60)).toBe('۱ دقیقه');
    expect(durationText(90)).toBe('۱ دقیقه و ۳۰ ثانیه');
    expect(durationText(1800)).toBe('۳۰ دقیقه');
    expect(durationText(5400)).toBe('۱ ساعت و ۳۰ دقیقه');
    expect(durationText(86400 * 2)).toBe('۲ روز');
    expect(intervalText(300)).toBe('هر ۵ دقیقه');
  });

  it('words a time before or after now', () => {
    expect(relativeTime(at(-120), NOW)).toBe('۲ دقیقه پیش');
    expect(relativeTime(at(600), NOW)).toBe('۱۰ دقیقه دیگر');
    expect(relativeTime(at(5), NOW)).toBe('همین حالا');
    expect(relativeTime(null, NOW)).toBe('—');
  });

  it('a next fetch already past is due on the next tick; a source off has none', () => {
    expect(nextFetchText({ nextDueAt: at(-10) }, NOW)).toBe('در نوبت (دقیقه‌ی بعد)');
    expect(nextFetchText({ nextDueAt: at(240) }, NOW)).toBe('۴ دقیقه دیگر');
    expect(nextFetchText({ nextDueAt: null }, NOW)).toBe('خاموش');
  });

  it('shows a price in its own quote', () => {
    expect(quotePrice(95500, 'toman')).toBe('۹۵٬۵۰۰ تومان');
    expect(quotePrice(955000, 'rial')).toBe('۹۵۵٬۰۰۰ ریال');
    expect(quotePrice(2650.456, 'usd')).toBe('$2,650.46');
    expect(quotePrice(0.9234, 'usd_cross')).toBe('۰٫۹۲۳۴');
    expect(quotePrice(0, 'toman')).toBe('—');
  });

  it('names a status for every state the server sends', () => {
    for (const k of SOURCE_STATUS_ORDER) expect(SOURCE_STATUS[k].label).toBeTruthy();
  });

  it('needs a primary only where several single sources give the same id', () => {
    const shared = sharedPriceTypes([
      { kind: 'single', priceType: 'usd' }, { kind: 'single', priceType: 'usd' },
      { kind: 'single', priceType: 'eur' }, { kind: 'catalog', priceType: 'bourse' },
    ]);
    expect([...shared]).toEqual(['usd']);
  });

  it('finds a source by its name, id, category or endpoint', () => {
    const src = { name: 'دلار سبزه', id: 'src_def_usd', categoryName: 'ارز', endpoint: 'tahran_sabza' };
    expect(sourceMatches(src, 'سبزه')).toBe(true);
    expect(sourceMatches(src, 'USD')).toBe(true);
    expect(sourceMatches(src, 'ارز')).toBe(true);
    expect(sourceMatches(src, 'sabza')).toBe(true);
    expect(sourceMatches(src, 'طلا')).toBe(false);
    expect(sourceMatches(src, '')).toBe(true);
  });
});
