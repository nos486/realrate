/**
 * categoryLinks.test.js — a loan installment link may name several installments (one payment that
 * covered more than one loan): checked, de-duplicated, and compared as a set
 */
import { describe, it, expect } from 'vitest';
import { validateLinkValue, sameLinkValue, installmentLinksOf, MAX_INSTALLMENT_LINKS } from '../../src/domain/categoryLinks.js';

const a = { loanId: 'loan_a', installmentId: 'i1' };
const b = { loanId: 'loan_b', installmentId: 'i2' };

describe('loan installment links', () => {
  it('keeps one installment plain and several as a list, without repeats or malformed ones', () => {
    expect(validateLinkValue('loan_installment', a)).toEqual(a);
    expect(validateLinkValue('loan_installment', [a])).toEqual(a);
    expect(validateLinkValue('loan_installment', [a, b, a, { loanId: '', installmentId: 'x' }])).toEqual([a, b]);
    expect(validateLinkValue('loan_installment', [])).toBeNull();
  });

  it('names at most MAX_INSTALLMENT_LINKS installments', () => {
    const many = Array.from({ length: MAX_INSTALLMENT_LINKS + 5 }, (_, n) => ({ loanId: `loan_${n}`, installmentId: 'i1' }));
    expect(validateLinkValue('loan_installment', many)).toHaveLength(MAX_INSTALLMENT_LINKS);
  });

  it('compares lists regardless of order', () => {
    expect(sameLinkValue([a, b], [b, a])).toBe(true);
    expect(sameLinkValue([a, b], [a])).toBe(false);
    expect(sameLinkValue(a, [a])).toBe(true);
    expect(installmentLinksOf(null)).toEqual([]);
  });
});
