/**
 * numberWords.test.js — A whole number in words, in Persian and in the English UI
 */

import { describe, it, expect, afterEach } from 'vitest';
import { setActiveLocale } from '../../src/domain/i18n.js';
import { numberToWords } from '../../../web/src/shared/utils/numberWords.js';

describe('numberToWords', () => {
  afterEach(() => setActiveLocale('fa'));

  it('writes Persian words in Persian', () => {
    expect(numberToWords(1_250_000)).toBe('یک میلیون و دویست و پنجاه هزار');
    expect(numberToWords(1_500)).toBe('هزار و پانصد');
  });

  it('writes natural English words in English', () => {
    setActiveLocale('en');
    expect(numberToWords(1_250_000)).toBe('one million two hundred fifty thousand');
    expect(numberToWords(15_000_000)).toBe('fifteen million');
    expect(numberToWords(1_500)).toBe('one thousand five hundred');
    expect(numberToWords(2_001_005)).toBe('two million one thousand five');
    expect(numberToWords(21)).toBe('twenty-one');
    expect(numberToWords(113)).toBe('one hundred thirteen');
    expect(numberToWords(3_000_000_000_000)).toBe('three trillion');
  });

  it('returns nothing for anything but a positive whole number', () => {
    setActiveLocale('en');
    expect(numberToWords(0)).toBe('');
    expect(numberToWords(1.5)).toBe('');
    expect(numberToWords(1e15)).toBe('');
  });
});
