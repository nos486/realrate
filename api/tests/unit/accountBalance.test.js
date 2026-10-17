/**
 * accountBalance.test.js — A stated account balance moved by expenses, incomes and transfers
 */
import { describe, it, expect } from 'vitest';
import { accountBalanceOf, accountBalances, validateBalance, tracksBalance } from '../../src/domain/accountBalance.js';
import { validateAccount } from '../../src/domain/accountDocument.js';

const balance = { amounts: { IRT: 3250000 }, startDate: '2026-10-10', startAt: '2026-10-10T08:00:00.000Z' };
const mellat = { id: 'a1', type: 'bank', name: 'Mellat', currencies: ['IRT'], balance };
const saman = { id: 'a2', type: 'bank', name: 'Saman', currencies: ['IRT'], balance: { ...balance, amounts: { IRT: 1000000 } } };

describe('accountBalanceOf', () => {
  it('moves the stated amount by expenses, incomes and transfers after it', () => {
    const records = {
      expenses: [{ accountId: 'a1', amount: 250000, currency: 'IRT', date: '2026-10-12', createdAt: '2026-10-12T09:00:00Z' }],
      incomes: [{ accountId: 'a1', amount: 100000, currency: 'IRT', incomeDate: '2026-10-13', createdAt: '2026-10-13T09:00:00Z' }],
      transfers: [
        { fromAccountId: 'a1', toAccountId: 'a2', amount: 500000, fee: 1000, date: '2026-10-14', createdAt: '2026-10-14T09:00:00Z' },
        { fromAccountId: 'a2', toAccountId: 'a1', amount: 20000, fee: 0, date: '2026-10-15', createdAt: '2026-10-15T09:00:00Z' },
      ],
    };
    expect(accountBalanceOf(mellat, records)).toEqual({ IRT: 3250000 - 250000 + 100000 - 500000 + 20000 });
    expect(accountBalanceOf(saman, records)).toEqual({ IRT: 1000000 + 499000 - 20000 });
  });

  it('ignores records before the stated moment, and same-day ones saved before it', () => {
    const records = {
      expenses: [
        { accountId: 'a1', amount: 111, date: '2026-10-09', createdAt: '2026-10-09T09:00:00Z' },
        { accountId: 'a1', amount: 222, date: '2026-10-10', createdAt: '2026-10-10T07:59:00Z' },
        { accountId: 'a1', amount: 333, date: '2026-10-10', createdAt: '2026-10-10T08:01:00Z' },
      ],
    };
    expect(accountBalanceOf(mellat, records)).toEqual({ IRT: 3250000 - 333 });
  });

  it('keeps foreign currencies apart and puts a reimbursement back', () => {
    const wise = { id: 'w', type: 'bank', name: 'Wise', currencies: ['IRT', 'USD'], balance: { amounts: { IRT: 0, USD: 100 }, startDate: '2026-10-01', startAt: '2026-10-01T00:00:00Z' } };
    const records = {
      expenses: [{
        accountId: 'w', amount: 30, currency: 'USD', date: '2026-10-02', createdAt: '2026-10-02T00:00:00Z',
        reimbursements: [{ accountId: 'w', amount: 10, date: '2026-10-03' }],
      }],
    };
    expect(accountBalanceOf(wise, records)).toEqual({ IRT: 0, USD: 80 });
  });

  it('counts yesterday\'s income and transfers when the balance is stated from that day', () => {
    const cash = { id: 'c', type: 'cash', name: 'Cash', currencies: ['IRT'], balance: { amounts: { IRT: 0 }, startDate: '2026-10-16', startAt: '2026-10-16T00:00:00.000Z' } };
    const records = {
      incomes: [{ accountId: 'c', amount: 2500000, currency: 'IRT', incomeDate: '2026-10-16', createdAt: '2026-10-16T10:00:00Z' }],
      transfers: [
        { fromAccountId: 'b', toAccountId: 'c', amount: 2500000, date: '2026-10-16', createdAt: '2026-10-16T10:05:00Z' },
        { fromAccountId: 'c', toAccountId: 'b', amount: 1000000, date: '2026-10-17', createdAt: '2026-10-17T07:00:00Z' },
      ],
    };
    expect(accountBalanceOf(cash, records, '2026-10-17')).toEqual({ IRT: 4000000 });
  });

  it('does not count records after today', () => {
    const records = { expenses: [{ accountId: 'a1', amount: 5, date: '2026-10-20', createdAt: '2026-10-20T00:00:00Z' }] };
    expect(accountBalanceOf(mellat, records, '2026-10-16')).toEqual({ IRT: 3250000 });
  });
});

describe('accountBalances', () => {
  it('totals the tracked, non-archived accounts in tomans at today\'s rates', () => {
    const usd = { id: 'u', type: 'cash', name: 'Cash', currencies: ['USD'], balance: { amounts: { USD: 10 }, startDate: '2026-10-01', startAt: '2026-10-01T00:00:00Z' } };
    const archived = { ...saman, id: 'z', archived: true };
    const untracked = { id: 'n', type: 'bank', name: 'No', currencies: ['IRT'] };
    const total = accountBalances([mellat, usd, archived, untracked], {}, '2026-10-16', { usdToman: 100000 });
    expect(total.totalToman).toBe(3250000 + 1000000);
    expect(total.count).toBe(2);
    expect(total.byId.get('z').toman).toBe(1000000);
    expect(total.unpriced).toEqual([]);
    expect(accountBalances([usd], {}, '2026-10-16', {}).unpriced).toEqual(['USD']);
  });
});

describe('validateBalance / validateAccount', () => {
  const stamp = { today: '2026-10-16', now: '2026-10-16T10:00:00.000Z' };
  it('keeps amounts of held currencies and stamps the moment', () => {
    expect(validateBalance({ amounts: { IRT: '3,250,000', USD: 5 } }, ['IRT'], stamp).value)
      .toEqual({ amounts: { IRT: 3250000 }, startDate: '2026-10-16', startAt: stamp.now });
    expect(validateBalance(null, ['IRT'], stamp).value).toBeNull();
    expect(validateBalance({ amounts: { IRT: 'x' } }, ['IRT'], stamp).error).toBeTruthy();
  });

  it('stores a balance on an account, but never on a credit', () => {
    const { value } = validateAccount({ name: 'Mellat', type: 'bank', currencies: ['IRT'], balance: { amounts: { IRT: 3250000 } } });
    expect(value.balance.amounts).toEqual({ IRT: 3250000 });
    expect(tracksBalance(value)).toBe(true);
    const credit = validateAccount({ name: 'C', type: 'credit', credit: { limit: 1000 }, balance: { amounts: { IRT: 5 } } });
    expect(credit.value.balance).toBeUndefined();
    expect(validateAccount({ name: 'Plain', type: 'bank' }).value.balance).toBeUndefined();
  });
});
