/**
 * i18n.test.js — The language core (translation lookup, placeholders), and the English dictionaries
 * covering every text the source marks for translation
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { t, msg, plural, registerMessages, setActiveLocale, getLocale, getDir, intlLocale } from '../../src/domain/i18n.js';
import { extractKeys, findUntranslated, listSources, SCAN_ROOTS, DICTIONARY_DIR, isSkipped } from '../../../web/scripts/i18n-scan.mjs';

describe('t', () => {
  beforeEach(() => {
    registerMessages('en', { ذخیره: 'Save', '{n} مورد': '{n} items' });
    setActiveLocale('fa');
  });
  afterAll(() => setActiveLocale('fa'));

  it('returns the Persian text in Persian', () => {
    expect(t('ذخیره')).toBe('ذخیره');
    expect(getDir()).toBe('rtl');
    expect(intlLocale()).toBe('fa-IR');
  });

  it('looks the text up in English, and falls back to Persian without a translation', () => {
    setActiveLocale('en');
    expect(t('ذخیره')).toBe('Save');
    expect(t('بدون ترجمه')).toBe('بدون ترجمه');
    expect(getDir()).toBe('ltr');
    expect(intlLocale()).toBe('en-US');
  });

  it('fills placeholders', () => {
    expect(t('{n} مورد', { n: 3 })).toBe('3 مورد');
    setActiveLocale('en');
    expect(t('{n} مورد', { n: 3 })).toBe('3 items');
    expect(t('{n} مورد', {})).toBe('{n} items');
  });

  it('ignores an unsupported language and marks texts without translating them', () => {
    setActiveLocale('de');
    expect(getLocale()).toBe('fa');
    expect(msg('ذخیره')).toBe('ذخیره');
  });

  it('plural: English adds the plural form, Persian keeps one', () => {
    expect(plural(2, 'item', 'items')).toBe('item');
    setActiveLocale('en');
    expect(plural(1, 'item', 'items')).toBe('item');
    expect(plural(2, 'item', 'items')).toBe('items');
  });
});

describe('scanner', () => {
  it('reads t()/msg() literals and ignores comments', () => {
    const src = "// نظر\nconst a = t('ذخیره'); /* بلوک */ const b = msg(\"حذف\");";
    expect(extractKeys(src)).toEqual(['ذخیره', 'حذف']);
    expect(findUntranslated(src)).toEqual([]);
  });

  it('flags a bare Persian literal unless marked i18n-ignore', () => {
    expect(findUntranslated("const a = 'ذخیره';")).toHaveLength(1);
    expect(findUntranslated("const a = 'ذخیره'; // i18n-ignore")).toHaveLength(0);
    expect(findUntranslated('<p>سلام</p>')).toHaveLength(1);
  });
});

describe('English dictionaries', () => {
  const dictionary = {};
  for (const file of fs.readdirSync(DICTIONARY_DIR).filter((f) => f.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(DICTIONARY_DIR, file), 'utf8');
    const body = src.replace(/^[\s\S]*?export default/, 'return');
    Object.assign(dictionary, new Function(body)());
  }
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

  it('translates every text the source marks with t() or msg()', () => {
    const missing = new Set();
    for (const dir of SCAN_ROOTS) {
      for (const file of listSources(dir)) {
        if (isSkipped(file)) continue;
        for (const key of extractKeys(fs.readFileSync(file, 'utf8'))) {
          if (/[؀-ۿ]/.test(key) && dictionary[key] === undefined) missing.add(key);
        }
      }
    }
    expect([...missing]).toEqual([]);
  });

  it('keeps the placeholders of each text in its translation', () => {
    const broken = Object.entries(dictionary).filter(([key, value]) => placeholders(key) !== placeholders(value));
    expect(broken.map(([key]) => key)).toEqual([]);
  });

  it('has no Persian left in a translation', () => {
    const persian = Object.entries(dictionary).filter(([, value]) => /[؀-ۿ]/.test(value));
    expect(persian.map(([key]) => key)).toEqual([]);
  });
});
