/**
 * csvFormulaEscape.test.js — CSV exports never hand a spreadsheet a formula: a text starting with
 * =, +, -, @, tab or CR (an asset name in a shared portfolio, a note) gets a leading apostrophe,
 * numbers stay numbers, and the import takes the apostrophe off again
 */

import { describe, it, expect } from 'vitest';
import { escapeCsvField, parseCsvText, buildCsvContent } from '../../../web/src/shared/utils/csv.js';

describe('CSV formula escaping', () => {
  it('neutralizes formula-like text', () => {
    expect(escapeCsvField('=HYPERLINK("https://x.example","click")')).toBe('"\'=HYPERLINK(""https://x.example"",""click"")"');
    expect(escapeCsvField('+cmd')).toBe('"\'+cmd"');
    expect(escapeCsvField('@SUM(A1)')).toBe('"\'@SUM(A1)"');
    expect(escapeCsvField('-2+3')).toBe('"\'-2+3"');
    expect(escapeCsvField('\tx')).toBe('"\'\tx"');
  });

  it('leaves numbers and plain text alone', () => {
    expect(escapeCsvField(-12.5)).toBe('"-12.5"');
    expect(escapeCsvField('-12.5')).toBe('"-12.5"');
    expect(escapeCsvField('-3.4%')).toBe('"-3.4%"');
    expect(escapeCsvField('طلای ۱۸ عیار')).toBe('"طلای ۱۸ عیار"');
    expect(escapeCsvField(null)).toBe('""');
  });

  it('imports back what was exported', () => {
    const csv = buildCsvContent(['name', 'value'], [['=1+1', -5], ['@note', 'ok']]);
    expect(parseCsvText(csv.replace(/^﻿/, ''))).toEqual([['name', 'value'], ['=1+1', '-5'], ['@note', 'ok']]);
  });
});
