/**
 * loansChequesI18n.test.jsx — Cheque display helpers and loan row cards in English and Persian
 */

import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerMessages, setActiveLocale } from '../../src/domain/i18n.js';
import commonEn from '../../../web/src/i18n/en/common.js';
import chequesEn from '../../../web/src/i18n/en/cheques.js';
import loansEn from '../../../web/src/i18n/en/loans.js';
import { describeDueDays, getStatusDisplay, getDirectionDisplay } from '../../../web/src/features/cheques/constants/chequeDisplay.js';
import LoansTable from '../../../web/src/features/loans/components/LoansTable.jsx';

registerMessages('en', commonEn);
registerMessages('en', chequesEn);
registerMessages('en', loansEn);

describe('cheques and loans in English', () => {
  afterEach(() => setActiveLocale('fa'));

  it('translates cheque labels and due-day wording', () => {
    setActiveLocale('en');
    expect(getStatusDisplay('cleared').label).toBe('Cleared');
    expect(getDirectionDisplay('issued').label).toBe('Issued');
    expect(describeDueDays(0)).toBe('Today');
    expect(describeDueDays(3)).toBe('in 3 days');
  });

  it('keeps the Persian wording in Persian', () => {
    expect(getStatusDisplay('cleared').label).toBe('پاس شده');
    expect(describeDueDays(0)).toBe('امروز');
  });

  it('renders a loan row card in English', () => {
    setActiveLocale('en');
    const loan = { id: 'l1', title: 'Home', principalAmount: 1000, remainingBalance: 500, totalCount: 10, paidCount: 5 };
    const html = renderToStaticMarkup(<LoansTable loans={[loan]} />);
    expect(html).toContain('5 of 10 installments');
    expect(html).toContain('Nothing due');
    expect(html).not.toMatch(/[؀-ۿ]/);
  });
});
