// @vitest-environment happy-dom
/**
 * accountsVaultI18n.test.jsx — The accounts / vault English texts: DayRateHint and the statement
 * digit helper render in English, and Persian stays as written
 */

import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { registerMessages, setActiveLocale } from '../../src/domain/i18n.js';
import accounts from '../../../web/src/i18n/en/accounts.js';
import vault from '../../../web/src/i18n/en/vault.js';
import DayRateHint from '../../../web/src/shared/currency/DayRateHint.jsx';
import { faDigits } from '../../../web/src/features/accounts/statement-import/statementFormat.js';

afterEach(() => {
  cleanup();
  setActiveLocale('fa');
});

describe('accounts and vault English', () => {
  it('renders the day-rate hint in English', () => {
    registerMessages('en', accounts);
    registerMessages('en', vault);
    setActiveLocale('en');
    const { container } = render(<DayRateHint unit="Dollar" rate={0} state="loading" />);
    expect(container.textContent).toBe('Reading the Dollar rate for that day…');
  });

  it('keeps Persian as written and Persian digits only in Persian', () => {
    const { container } = render(<DayRateHint unit="دلار" rate={0} state="loading" />);
    expect(container.textContent).toBe('در حال خواندن نرخ دلار آن روز…');
    expect(faDigits('12')).toBe('۱۲');
    setActiveLocale('en');
    expect(faDigits('12')).toBe('12');
  });
});
