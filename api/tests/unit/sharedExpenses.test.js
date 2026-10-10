/**
 * sharedExpenses.test.js — «دنگ»: an expense paid for others too counts only the user's share;
 * what comes back is kept on the expense (never income), and bank deposits can be matched to it
 */
import { describe, it, expect, vi } from 'vitest';
import {
  validateExpense,
  expenseInToman,
  expensePaidInToman,
  expenseReceivable,
  summarizeExpenses,
  summarizeByCategory,
  summarizeReceivables,
} from '../../src/domain/expenseDocument.js';

const vault = vi.hoisted(() => ({ expenses: [] }));
vi.mock('../../../web/src/shared/vault/vaultExpenses.js', () => ({
  getExpenses: vi.fn(async () => ({ expenses: vault.expenses })),
}));
vi.mock('../../../web/src/features/incomes/api/incomeApi.js', () => ({ getIncomes: vi.fn(async () => ({ incomes: [] })) }));
const { findRecorded, sameDayKey } = await import('../../../web/src/features/sms-inbox/recordedCheck.js');
const { getExpenses } = await import('../../../web/src/shared/vault/vaultExpenses.js');

const base = { groupId: 'exg_1', title: 'شام', amount: 10_000_000, date: '2026-09-20', category: 'dining' };
const rmb = (id, amount, extra = {}) => ({ id, amount, date: '2026-09-22', ...extra });

describe('validateExpense — shared', () => {
  it('is an ordinary expense without myShare', () => {
    const { value } = validateExpense(base);
    expect(value.myShare).toBeNull();
    expect(value.reimbursements).toEqual([]);
  });

  it('keeps the share and what came back, in pieces and accounts', () => {
    const { value, error } = validateExpense({
      ...base,
      myShare: 3_000_000,
      reimbursements: [
        rmb('rmb_b', 4_000_000, { date: '2026-09-25', accountId: 'acc_2' }),
        rmb('rmb_a', 2_000_000, { accountId: 'acc_1', notes: 'سهم علی', source: 'sms', bankId: 'mellat', smsKey: 'k1' }),
      ],
    });
    expect(error).toBeUndefined();
    expect(value.myShare).toBe(3_000_000);
    expect(value.reimbursements.map((r) => r.id)).toEqual(['rmb_a', 'rmb_b']); // by day
    expect(value.reimbursements[0]).toMatchObject({ accountId: 'acc_1', notes: 'سهم علی', source: 'sms', smsKey: 'k1' });
  });

  it('allows a zero share (all of it for others)', () => {
    expect(validateExpense({ ...base, myShare: 0 }).value.myShare).toBe(0);
  });

  it('refuses a share not below the amount, and more back than owed', () => {
    expect(validateExpense({ ...base, myShare: 10_000_000 }).error).toBeTruthy();
    expect(validateExpense({ ...base, myShare: -1 }).error).toBeTruthy();
    expect(validateExpense({ ...base, myShare: 3_000_000, reimbursements: [rmb('rmb_a', 7_000_001)] }).error).toMatch(/بیشتر/);
    expect(validateExpense({ ...base, myShare: 3_000_000, reimbursements: [rmb('bad id!', 1)] }).error).toBeTruthy();
  });

  it('is for toman expenses only', () => {
    expect(validateExpense({ ...base, currency: 'USD', amount: 100, myShare: 30 }).value.myShare).toBeNull();
    expect(validateExpense({ ...base, currency: 'USD', amount: 100, myShare: 30, reimbursements: [rmb('rmb_a', 10)] }).error).toMatch(/تومانی/);
  });

  it('will not drop the share while reimbursements remain', () => {
    expect(validateExpense({ ...base, myShare: null, reimbursements: [rmb('rmb_a', 1)] }).error).toMatch(/دریافتی/);
  });
});

describe('totals count the share', () => {
  const shared = { ...base, currency: 'IRT', myShare: 3_000_000, reimbursements: [rmb('rmb_a', 2_000_000)] };
  const plain = { ...base, title: 'خرید', amount: 1_000_000, currency: 'IRT', category: 'groceries', myShare: null, reimbursements: [] };

  it('expenseInToman is the share, expensePaidInToman the whole amount', () => {
    expect(expenseInToman(shared)).toBe(3_000_000);
    expect(expensePaidInToman(shared)).toBe(10_000_000);
    expect(expenseInToman(plain)).toBe(1_000_000);
  });

  it('summaries and categories use the share', () => {
    expect(summarizeExpenses([shared, plain]).totalToman).toBe(4_000_000);
    expect(summarizeExpenses([shared, plain]).toman).toBe(4_000_000);
    expect(summarizeByCategory([shared, plain])[0]).toMatchObject({ category: 'dining', totalToman: 3_000_000 });
  });

  it('dollar shares convert at the day\'s rate', () => {
    const usd = { ...base, currency: 'USD', amount: 100, myShare: 25, reimbursements: [rmb('rmb_a', 25)] };
    const rates = { usdAt: () => 100_000 };
    expect(expenseInToman(usd, rates)).toBe(2_500_000);
    expect(summarizeReceivables([usd], rates)).toMatchObject({ owedToman: 7_500_000, receivedToman: 2_500_000, remainingToman: 5_000_000 });
  });

  it('receivables: owed, received, remaining; settled ones are not open', () => {
    expect(expenseReceivable(shared)).toEqual({ owed: 7_000_000, received: 2_000_000, remaining: 5_000_000 });
    expect(expenseReceivable(plain)).toEqual({ owed: 0, received: 0, remaining: 0 });
    const settled = { ...shared, id: 's', reimbursements: [rmb('rmb_a', 7_000_000)] };
    const sum = summarizeReceivables([shared, settled, plain]);
    expect(sum).toMatchObject({ count: 2, openCount: 1, owedToman: 14_000_000, receivedToman: 9_000_000, remainingToman: 5_000_000 });
    expect(sum.open).toEqual([shared]);
  });
});

describe('bank SMS against shared expenses', () => {
  it('a withdrawal matches the whole amount paid; a share that came back matches its deposit', async () => {
    vault.expenses = [
      { ...base, currency: 'IRT', myShare: 3_000_000, reimbursements: [rmb('rmb_a', 2_000_000), rmb('rmb_b', 1_000_000, { source: 'sms', smsKey: 'dep-key' })] },
    ];
    const { recordedKeys, sameDay } = await findRecorded([
      { tx: { direction: 'debit', date: '2026-09-20', amount: 10_000_000 } },
      { tx: { direction: 'credit', date: '2026-09-22', amount: 2_000_000 } },
    ]);
    expect(sameDay.has(sameDayKey('debit', '2026-09-20', 10_000_000))).toBe(true);
    expect(sameDay.has(sameDayKey('credit', '2026-09-22', 2_000_000))).toBe(true);
    expect(recordedKeys.has('dep-key')).toBe(true);
  });

  it('looks back a year for deposits, since a share comes back after the expense', async () => {
    vault.expenses = [];
    getExpenses.mockClear();
    await findRecorded([{ tx: { direction: 'credit', date: '2026-09-22', amount: 1 } }]);
    expect(getExpenses).toHaveBeenCalledWith({ from: '2025-09-22', to: '2026-09-22' });
  });
});
