// @vitest-environment happy-dom
/**
 * smsAutoRecord.test.js — small withdrawals recorded by themselves (app settings): only when turned
 * on, only up to the limit, in the chosen category, never twice
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../web/src/shared/native/nativeApp.js', () => ({ isNativeApp: () => true }));
vi.mock('../../../web/src/shared/native/nativePlugins.js', () => ({ BankSms: {}, BiometricVault: {} }));
const expenses = vi.hoisted(() => ({
  getExpenses: vi.fn(async () => ({ expenses: [] })),
  getExpenseGroups: vi.fn(async () => ({ groups: [] })),
  ensureDailyGroup: vi.fn(async () => ({ id: 'exg_daily', type: 'daily' })),
  // Validated like the real store, so a draft it would refuse fails here too; no section: the
  // everyday expenses' (the store's own rule)
  saveExpense: vi.fn(async (body) => {
    const input = { ...body, groupId: body.groupId || 'exg_daily' };
    const { validateExpense } = await import('../../src/domain/expenseDocument.js');
    const { value, error } = validateExpense(input);
    if (error) throw new Error(error);
    return { expense: { id: `exp_${input.amount}`, ...input, ...value } };
  }),
}));
vi.mock('../../../web/src/shared/vault/vaultExpenses.js', () => expenses);
vi.mock('../../../web/src/shared/vault/vaultAccounts.js', () => ({
  getAccounts: vi.fn(async () => ({ accounts: [{ id: 'acc_1', name: 'بلو', bankId: 'blu', type: 'bank' }] })),
}));
const incomes = vi.hoisted(() => ({ getIncomes: vi.fn(async () => ({ incomes: [] })) }));
vi.mock('../../../web/src/features/incomes/api/incomeApi.js', () => incomes);

import { addSmsMessages, getPendingSms, setSmsSettings, getSmsSettings } from '../../../web/src/shared/native/smsInbox.js';
import { autoRecordSmallExpenses } from '../../../web/src/features/sms-inbox/smsRecord.js';

const RECEIVED = new Date(2026, 8, 28, 12, 0).getTime();
const debit = (rial, time) => `بلو\nبرداشت پول\nسینا عزیز، ${rial} ریال از حساب شما پرید.\nموجودی: 70,000,000 ریال\n${time}\n۱۴۰۵.۰۷.۰۶`;
const CREDIT = 'بلو\nواریز پول\nسینا عزیز، 2,500,000 ریال به حساب شما نشست.\nموجودی: 104,451,226 ریال\n۱۸:۲۳\n۱۴۰۵.۰۷.۰۳';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  expenses.getExpenses.mockResolvedValue({ expenses: [] });
  addSmsMessages([
    { address: '+989999987641', body: debit('3,500,000', '۱۰:۰۱'), date: RECEIVED },      // 350,000
    { address: '+989999987641', body: debit('4,800,000', '۱۰:۰۲'), date: RECEIVED + 1 },  // 480,000
    { address: '+989999987641', body: debit('9,000,000', '۱۰:۰۳'), date: RECEIVED + 2 },  // 900,000
    { address: '+989999987641', body: CREDIT, date: RECEIVED + 3 },
  ]);
});

describe('automatic recording of small withdrawals', () => {
  it('off by default: nothing is recorded', async () => {
    expect(getSmsSettings()).toMatchObject({ autoRecord: false, autoRecordMax: 500000, recordCategory: 'other' });
    expect(await autoRecordSmallExpenses()).toBe(0);
    expect(expenses.saveExpense).not.toHaveBeenCalled();
    expect(getPendingSms()).toHaveLength(4);
  });

  it('records withdrawals up to the limit in the chosen category; deposits and larger ones wait', async () => {
    setSmsSettings({ autoRecord: true, autoRecordMax: 500000, recordCategory: 'transport' });
    expect(await autoRecordSmallExpenses()).toBe(2);
    expect(expenses.saveExpense.mock.calls.map((c) => [c[0].amount, c[0].category, c[0].accountId])).toEqual([
      [350000, 'transport', 'acc_1'],
      [480000, 'transport', 'acc_1'],
    ]);
    expect(getPendingSms().map((p) => [p.tx.direction, p.tx.amount]).sort()).toEqual([['credit', 250000], ['debit', 900000]]);
    // Nothing left to record: a second run records nothing
    expect(await autoRecordSmallExpenses()).toBe(0);
    expect(expenses.saveExpense).toHaveBeenCalledTimes(2);
  });

  it('never twice: one already recorded (another device, or by hand) is only dropped', async () => {
    setSmsSettings({ autoRecord: true, autoRecordMax: 500000 });
    expenses.getExpenses.mockResolvedValue({ expenses: [
      { id: 'e1', date: '2026-09-28', amount: 350000, currency: 'IRT' },                    // by hand, same day and amount
      { id: 'e2', date: '2026-09-28', amount: 1, currency: 'IRT', smsKey: getPendingSms().find((p) => p.tx.amount === 480000).tx.key },
    ] });
    expect(await autoRecordSmallExpenses()).toBe(0);
    expect(expenses.saveExpense).not.toHaveBeenCalled();
    expect(getPendingSms().map((p) => p.tx.amount).sort((a, b) => a - b)).toEqual([250000, 900000]);
  });
});
