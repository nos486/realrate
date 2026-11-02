/**
 * multiSourceExpense.test.js — A big toman purchase paid from several sources («چند منبع»): the
 * expense keeps its parts (`payments`), each source counts only its part (account balance, bank
 * credit debt, loan usage, per-account totals), merges re-point the parts, the form's rows turn
 * into parts, and an asset sold for a part is a «sell» in its portfolio written with the expense
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateExpense, expensePayments, expenseAccountAmount, expenseAccountIds, expenseLoanFraction,
  summarizeByAccount, summarizeExpenses,
} from '../../src/domain/expenseDocument.js';
import { accountBalanceOf } from '../../src/domain/accountBalance.js';
import { creditStatus, validateCreditTerms } from '../../src/domain/creditAccount.js';
import { summarizeLoanFunding } from '../../src/domain/loanFunding.js';
import { repointRecord } from '../../src/domain/accountMerge.js';
import { repointPortfolioRecord } from '../../src/domain/portfolioMerge.js';
import {
  newSplitRow, rowsFromPayments, paymentsFromRows, splitProblem, PORTFOLIO_SOURCE,
} from '../../../web/src/features/expenses/utils/paymentSplit.js';

const funds = vi.hoisted(() => ({ calls: [] }));
vi.mock('../../../web/src/shared/vault/portfolioFunds.js', () => {
  const remove = vi.fn(async (link) => funds.calls.push(['delete', link.portfolioId, link.txId]));
  return {
    saveSpendTransaction: vi.fn(async () => {}),
    saveLinkedTransaction: vi.fn(async (link, entry) => funds.calls.push(['link', entry.type, link.portfolioId, link.txId, link.quantity, entry.toman, entry.note])),
    deleteSpendTransaction: remove,
    deleteLinkedTransaction: remove,
  };
});
vi.mock('../../../web/src/shared/vault/recordRates.js', () => ({ tomanRateOn: vi.fn(async () => 1) }));
vi.mock('../../../web/src/shared/vault/vaultRecordMeta.js', () => ({
  putRecord: vi.fn(async () => funds.calls.push(['expense'])),
  recordDateOf: () => '',
}));
vi.mock('../../../web/src/shared/vault/vaultApi.js', () => ({
  listVaultRecords: vi.fn(async () => ({ records: [] })),
  deleteVaultRecord: vi.fn(async () => funds.calls.push(['deleteExpense'])),
}));
vi.mock('../../../web/src/shared/vault/vaultStore.js', () => ({
  encryptVaultRecord: vi.fn(async (v) => JSON.stringify(v)),
  decryptVaultRecord: vi.fn(async (p) => JSON.parse(p)),
  decryptVaultRecords: async (payloads) => Promise.all(payloads.map(async (p) => JSON.parse(p))),
}));
const api = await import('../../../web/src/shared/vault/vaultExpenses.js');

const gold = (patch = {}) => ({ portfolioId: 'pf_a', portfolioName: 'اصلی', assetId: 'gold18k', quantity: 2, txId: 'txl_1', ...patch });
const parts = () => [
  { id: 'pay_1', amount: 30_000_000, accountId: 'acc_bank' },
  { id: 'pay_2', amount: 40_000_000, accountId: 'acc_credit' },
  { id: 'pay_3', amount: 20_000_000, soldFrom: gold() },
];
const base = { groupId: 'exg_1', title: 'لپ‌تاپ', amount: 90_000_000, currency: 'IRT', date: '2026-10-20', category: 'shopping', createdAt: '2026-10-20T10:00:00Z' };
const purchase = () => ({ id: 'exp_1', ...validateExpense({ ...base, payments: parts() }).value, createdAt: base.createdAt });

beforeEach(() => {
  funds.calls = [];
});

describe('validateExpense — payments', () => {
  it('keeps the parts and drops the expense\'s own account, loan and portfolio', () => {
    const { value, error } = validateExpense({ ...base, accountId: 'acc_x', loanId: 'loan_x', payments: parts() });
    expect(error).toBeUndefined();
    expect(value.payments).toEqual(parts());
    expect(value).toMatchObject({ accountId: '', loanId: '', paidFrom: null });
  });

  it('one source is an ordinary expense', () => {
    expect(validateExpense(base).value.payments).toBeNull();
    expect(validateExpense({ ...base, payments: [] }).value.payments).toBeNull();
  });

  it('the parts must add up to the amount, each with one source, in tomans, at least two', () => {
    expect(validateExpense({ ...base, amount: 80_000_000, payments: parts() }).error).toBeTruthy();
    expect(validateExpense({ ...base, payments: [parts()[0]] }).error).toBeTruthy();
    expect(validateExpense({ ...base, payments: [...parts().slice(0, 2), { id: 'pay_3', amount: 20_000_000 }] }).error).toBeTruthy();
    expect(validateExpense({ ...base, payments: [...parts().slice(0, 2), { ...parts()[2], id: 'pay_1' }] }).error).toBeTruthy();
    expect(validateExpense({ ...base, currency: 'USD', amount: 900, payments: parts().map((p) => ({ ...p, amount: 300 })) }).error).toBeTruthy();
    expect(validateExpense({ ...base, chequeId: 'chq_1', payments: parts() }).error).toBeTruthy();
  });

  it('a loan part may go through an account', () => {
    const payments = [{ id: 'p1', amount: 50, loanId: 'loan_1', accountId: 'acc_bank' }, { id: 'p2', amount: 50, accountId: 'acc_cash' }];
    expect(validateExpense({ ...base, amount: 100, payments }).value.payments).toEqual(payments);
  });
});

describe('each source counts its part', () => {
  it('expensePayments reads one source as a single part', () => {
    expect(expensePayments({ amount: 10, accountId: 'a', loanId: 'l' })).toEqual([{ id: '', amount: 10, accountId: 'a', loanId: 'l' }]);
    expect(expensePayments(purchase())).toHaveLength(3);
    expect(expenseAccountIds(purchase())).toEqual(['acc_bank', 'acc_credit']);
    expect(expenseAccountAmount(purchase(), 'acc_credit')).toBe(40_000_000);
    expect(expenseAccountAmount({ amount: 10, accountId: 'a' }, 'a')).toBe(10);
  });

  it('an account balance loses only its part', () => {
    const bank = { id: 'acc_bank', type: 'bank', currencies: ['IRT'], balance: { amounts: { IRT: 100_000_000 }, startDate: '2026-10-01', startAt: '2026-10-01T00:00:00Z' } };
    expect(accountBalanceOf(bank, { expenses: [purchase()] })).toEqual({ IRT: 70_000_000 });
  });

  it('a bank credit owes only its part', () => {
    const credit = { id: 'acc_credit', type: 'credit', credit: validateCreditTerms({ limit: 100_000_000, startDate: '2026-10-01' }).value };
    expect(creditStatus(credit, { expenses: [purchase()] }, '2026-10-25').debt).toBe(40_000_000);
  });

  it('a loan counts only its part as spent', () => {
    const expense = { id: 'e', ...validateExpense({ ...base, payments: [{ id: 'p1', amount: 60_000_000, loanId: 'loan_1' }, { id: 'p2', amount: 30_000_000, accountId: 'a' }] }).value };
    expect(expenseLoanFraction(expense, 'loan_1')).toBeCloseTo(2 / 3);
    const s = summarizeLoanFunding({ id: 'loan_1', principalAmount: 100_000_000 }, [expense]);
    expect(s.spent).toBeCloseTo(60_000_000);
    expect(s.remaining).toBeCloseTo(40_000_000);
  });

  it('the expense is counted once, whole; per account each part', () => {
    expect(summarizeExpenses([purchase()]).totalToman).toBe(90_000_000);
    const byAccount = new Map(summarizeByAccount([purchase()]).map((a) => [a.accountId, a.totalToman]));
    expect(Object.fromEntries(byAccount)).toEqual({ acc_credit: 40_000_000, acc_bank: 30_000_000, '': 20_000_000 });
  });
});

describe('merges re-point the parts', () => {
  it('an account merge', () => {
    const { record, changed } = repointRecord('expense', purchase(), 'acc_bank', 'acc_new');
    expect(changed).toBe(true);
    expect(record.payments[0].accountId).toBe('acc_new');
  });

  it('a portfolio merge', () => {
    const { record, changed } = repointPortfolioRecord('expense', purchase(), 'pf_a', { id: 'pf_b', name: 'دوم' });
    expect(changed).toBe(true);
    expect(record.payments[2].soldFrom).toMatchObject({ portfolioId: 'pf_b', portfolioName: 'دوم', txId: 'txl_1' });
  });
});

describe('the form\'s rows', () => {
  it('turn into parts and back', () => {
    const rows = rowsFromPayments(parts());
    expect(rows.map((r) => r.source)).toEqual(['acc_bank', 'acc_credit', PORTFOLIO_SOURCE]);
    expect(splitProblem(rows, 90_000_000)).toBe('');
    expect(paymentsFromRows(rows, () => 'txl_new')).toEqual(parts());
  });

  it('say what is missing', () => {
    expect(splitProblem([newSplitRow({ amount: '10', source: 'a' })], 10)).toBeTruthy();
    expect(splitProblem([newSplitRow({ amount: '10', source: 'a' }), newSplitRow({ amount: '5' })], 15)).toBeTruthy();
    expect(splitProblem([newSplitRow({ amount: '10', source: 'a' }), newSplitRow({ amount: '5', source: 'b' })], 20)).toBeTruthy();
    expect(splitProblem([newSplitRow({ amount: '10', source: 'a' }), newSplitRow({ amount: '5', source: 'loan:l1' })], 15)).toBe('');
  });

  it('a new portfolio part gets a new transaction id; a loan part keeps its account', () => {
    const rows = [
      newSplitRow({ id: 'p1', amount: '10', source: PORTFOLIO_SOURCE, link: { portfolioId: 'pf', portfolioName: 'P', assetId: 'gold18k', quantity: 1 } }),
      newSplitRow({ id: 'p2', amount: '5', source: 'loan:l1', loanAccountId: 'acc' }),
    ];
    expect(paymentsFromRows(rows, () => 'txl_new')).toEqual([
      { id: 'p1', amount: 10, soldFrom: { portfolioId: 'pf', portfolioName: 'P', assetId: 'gold18k', quantity: 1, txId: 'txl_new' } },
      { id: 'p2', amount: 5, loanId: 'l1', accountId: 'acc' },
    ]);
  });
});

describe('saving: the asset sold for a part', () => {
  it('is a «sell» at the part, written before the expense, and goes with it', async () => {
    const { expense } = await api.saveExpense({ ...base, payments: parts() });
    expect(funds.calls).toEqual([['link', 'sell', 'pf_a', 'txl_1', 2, 20_000_000, 'pay'], ['expense']]);
    funds.calls = [];
    // No longer paid from the portfolio: its sale is removed
    await api.saveExpense({ payments: null, accountId: 'acc_bank' }, expense);
    expect(funds.calls).toEqual([['expense'], ['delete', 'pf_a', 'txl_1']]);
    funds.calls = [];
    await api.deleteExpense(expense.id, expense);
    expect(funds.calls).toEqual([['deleteExpense'], ['delete', 'pf_a', 'txl_1']]);
  });

  it('moves the sale to the portfolio a part now names', async () => {
    const { expense } = await api.saveExpense({ ...base, payments: parts() });
    funds.calls = [];
    const moved = parts().map((p) => (p.soldFrom ? { ...p, soldFrom: gold({ portfolioId: 'pf_b' }) } : p));
    await api.saveExpense({ payments: moved }, expense);
    expect(funds.calls).toEqual([['delete', 'pf_a', 'txl_1'], ['link', 'sell', 'pf_b', 'txl_1', 2, 20_000_000, 'pay'], ['expense']]);
  });
});
