/**
 * spendingI18n.test.js — The subscriptions display helpers and the expense CSV headers in English
 */

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { registerMessages, setActiveLocale } from '../../src/domain/i18n.js';
import { daysLabel, periodDaysLabel, periodLeftLabel } from '../../../web/src/features/subscriptions/constants/subscriptionDisplay.js';
import { expenseCsvHeaders } from '../../../web/src/features/expenses/utils/expenseCsv.js';

const dir = path.resolve(__dirname, '../../../web/src/i18n/en');
for (const f of ['expenses.js', 'incomes.js', 'subscriptions.js']) {
  const body = fs.readFileSync(path.join(dir, f), 'utf8').replace(/^[\s\S]*?export default/, 'return');
  registerMessages('en', new Function(body)());
}

describe('spending texts in English', () => {
  afterEach(() => setActiveLocale('fa'));

  it('keeps Persian output unchanged', () => {
    expect(periodDaysLabel({ daysLeft: 0, until: 'renew' })).toBe('تمدید امروز');
    expect(daysLabel(1)).toBe('فردا');
  });

  it('renders subscription labels in English', () => {
    setActiveLocale('en');
    expect(periodDaysLabel({ daysLeft: 5, until: 'renew' })).toBe('5 days until renewal');
    expect(periodDaysLabel({ daysLeft: 0, until: 'end' })).toBe('Ends today');
    expect(daysLabel(-3)).toBe('3 days ago');
    expect(periodLeftLabel({ progress: 0.6 })).toBe('40% left');
  });
});

describe('expense CSV headers', () => {
  it('are Persian by default', () => {
    expect(expenseCsvHeaders()[1]).toBe('عنوان');
  });
});
