/**
 * domainI18n.test.js — Shared domain texts in English: built-in category names show translated while the
 * stored name stays Persian, and validation errors follow the language
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { registerMessages, setActiveLocale } from '../../src/domain/i18n.js';
import { validateTransfer } from '../../src/domain/transferDocument.js';
import domainDocuments from '../../../web/src/i18n/en/domain-documents.js';
import domainMessages from '../../../web/src/i18n/en/domain-messages.js';

describe('domain texts in English', () => {
  afterEach(() => setActiveLocale('fa'));

  it('shows an unrenamed built-in category in English and keeps the Persian name stored', async () => {
    registerMessages('en', { ...domainDocuments, ...domainMessages });
    // The language is fixed before the app's modules load, so load the module after choosing it
    vi.resetModules();
    const i18n = await import('../../src/domain/i18n.js');
    i18n.registerMessages('en', { ...domainDocuments, ...domainMessages });
    i18n.setActiveLocale('en');
    const { mergeCategories, validateCategoryList } = await import('../../src/domain/categoryDocument.js');
    const stored = [{ value: 'groceries', label: 'خوراک و خواربار' }, { value: 'dining', label: 'ناهار بیرون' }];
    i18n.setActiveLocale('en');
    const merged = mergeCategories('expense', stored);
    expect(merged.find((c) => c.value === 'groceries').label).not.toMatch(/[؀-ۿ]/);
    expect(merged.find((c) => c.value === 'dining').label).toBe('ناهار بیرون');
    const shown = merged.find((c) => c.value === 'groceries').label;
    const saved = validateCategoryList('expense', [{ value: 'groceries', label: shown }]).value;
    expect(saved[0].label).toBe('خوراک و خواربار');
  });

  it('translates validation errors', () => {
    setActiveLocale('en');
    const res = validateTransfer({ fromAccountId: '', toAccountId: '' });
    expect(res.error).toMatch(/^[\x00-\x7F]+$/);
  });
});
