import { describe, it, expect } from 'vitest';
import { suggestLinks, linkFieldsOf, LINK_DAYS } from '../../src/domain/statementLinks.js';

const tx = (over) => ({ id: 't1', date: '2026-08-10', time: '10:00:00', amount: 5_000_000, direction: 'debit', fields: {}, ...over });
const row = (over = {}, decision = {}) => ({ included: true, tx: tx(over), decision: { action: 'expense', category: 'installments', ...decision } });

const INSTALLMENTS = [
  { loanId: 'loan_1', loanTitle: 'خودرو', installmentId: 'inst_1_3', number: 3, dueDate: '2026-08-12', amount: 5_000_000 },
  { loanId: 'loan_1', loanTitle: 'خودرو', installmentId: 'inst_1_4', number: 4, dueDate: '2026-09-12', amount: 5_000_000 },
];

describe('suggestLinks', () => {
  it('links a received cheque by its number', () => {
    const cheques = [{ id: 'chq_1', direction: 'received', status: 'pending', chequeNumber: '0700123', counterparty: 'علی' }];
    const links = suggestLinks([row({ direction: 'credit', fields: { chequeNo: '700123' } }, { action: 'income', category: 'other' })], { cheques });
    expect(links.t1).toMatchObject({ kind: 'cheque', field: 'chequeId', value: 'chq_1' });
    expect(linkFieldsOf(links.t1)).toEqual({ chequeId: 'chq_1' });
  });

  it('does not link a cheque that is cleared, of the other direction, or numbered otherwise', () => {
    const base = { id: 'chq_1', direction: 'received', status: 'pending', chequeNumber: '700123' };
    const plan = [row({ direction: 'credit', fields: { chequeNo: '700123' } }, { action: 'income', category: 'other' })];
    for (const cheque of [{ ...base, status: 'cleared' }, { ...base, direction: 'issued' }, { ...base, chequeNumber: '700124' }]) {
      expect(suggestLinks(plan, { cheques: [cheque] })).toEqual({});
    }
  });

  it('links an installment of the same amount due near the day, the nearest first', () => {
    const links = suggestLinks([row()], { installments: INSTALLMENTS });
    expect(links.t1).toMatchObject({ kind: 'installment', field: 'loanInstallment', value: { loanId: 'loan_1', installmentId: 'inst_1_3' } });
    expect(links.t1.label).toContain('خودرو');
  });

  it('gives one installment to one row only', () => {
    const plan = [row({ id: 'a', date: '2026-08-10' }), row({ id: 'b', date: '2026-08-11', time: '11:00:00' })];
    const links = suggestLinks(plan, { installments: INSTALLMENTS.slice(0, 1) });
    expect(Object.keys(links)).toEqual(['a']);
  });

  it('needs the amount to match and the due day to be near', () => {
    expect(suggestLinks([row({ amount: 4_000_000 })], { installments: INSTALLMENTS })).toEqual({});
    expect(suggestLinks([row({ date: '2026-12-10' })], { installments: INSTALLMENTS.slice(0, 1) })).toEqual({});
    expect(LINK_DAYS).toBeGreaterThan(30);
    // A rounding difference of a few tomans is the same amount
    expect(Object.keys(suggestLinks([row({ amount: 5_000_003 })], { installments: INSTALLMENTS }))).toEqual(['t1']);
  });

  it('only looks for an installment in «پرداخت قسط» and a subscription in «اشتراک‌ها»', () => {
    expect(suggestLinks([row({}, { category: 'other' })], { installments: INSTALLMENTS })).toEqual({});
    const subscriptions = [{ id: 'sub_1', name: 'نتفلیکس', amount: 5_000_000, currency: 'IRT', status: 'active' }];
    expect(suggestLinks([row({}, { category: 'subscriptions' })], { subscriptions }).t1).toMatchObject({ kind: 'subscription', field: 'subscriptionId', value: 'sub_1' });
  });

  it('is unsure with two subscriptions of one price, and links one payment a month', () => {
    const one = { id: 'sub_1', name: 'الف', amount: 5_000_000, currency: 'IRT', status: 'active' };
    const plan = [row({}, { category: 'subscriptions' })];
    expect(suggestLinks(plan, { subscriptions: [one, { ...one, id: 'sub_2', name: 'ب' }] })).toEqual({});
    expect(suggestLinks(plan, { subscriptions: [{ ...one, currency: 'USD' }] })).toEqual({});
    expect(suggestLinks(plan, { subscriptions: [{ ...one, status: 'cancelled' }] })).toEqual({});
    const twice = [row({ id: 'a', date: '2026-08-02' }, { category: 'subscriptions' }), row({ id: 'b', date: '2026-08-20' }, { category: 'subscriptions' })];
    expect(Object.keys(suggestLinks(twice, { subscriptions: [one] }))).toEqual(['a']);
  });

  it('skips rows that are not going to be saved', () => {
    expect(suggestLinks([{ ...row(), included: false }], { installments: INSTALLMENTS })).toEqual({});
    expect(linkFieldsOf(null)).toEqual({});
  });
});
