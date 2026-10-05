// @vitest-environment happy-dom
/**
 * smsInboxPage.test.jsx — the Android app's «پیامک‌های بانکی» page: waiting messages, recording a
 * withdrawal as an everyday expense and a deposit as an income, dismissing one
 */
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';

const plugin = vi.hoisted(() => ({
  read: vi.fn(), checkPermissions: vi.fn(async () => ({ sms: 'granted' })), requestPermissions: vi.fn(), configure: vi.fn(), addListener: vi.fn(),
}));
vi.mock('../../../web/src/shared/native/nativeApp.js', () => ({ isNativeApp: () => true }));
vi.mock('../../../web/src/shared/native/nativePlugins.js', () => ({ BankSms: plugin, BiometricVault: {} }));
vi.mock('../../../web/src/shared/vault/useVault.js', () => ({ useVault: () => ({ status: 'unlocked', userId: 'usr_1' }) }));
vi.mock('../../../web/src/features/demo/index.js', () => ({ useDemo: () => ({ readOnly: false }) }));
const accountList = vi.hoisted(() => ({ list: [{ id: 'acc_1', name: 'بلو', bankId: 'blu', type: 'bank' }] }));
vi.mock('../../../web/src/features/accounts/hooks/useAccounts.js', () => ({
  useAccounts: () => ({ accounts: accountList.list }),
}));
vi.mock('../../../web/src/features/market/index.js', () => ({ usePricing: () => null }));
const expenses = vi.hoisted(() => ({
  getExpenses: vi.fn(async () => ({ expenses: [] })),
  getExpenseGroups: vi.fn(async () => ({ groups: [] })),
  ensureDailyGroup: vi.fn(async () => ({ id: 'exg_daily', type: 'daily' })),
  // Validated like the real store, so a draft it would refuse fails here too
  saveExpense: vi.fn(async (input) => {
    const { validateExpense } = await import('../../src/domain/expenseDocument.js');
    const { value, error } = validateExpense(input);
    if (error) throw new Error(error);
    return { expense: { id: 'exp_1', ...input, ...value } };
  }),
}));
vi.mock('../../../web/src/shared/vault/vaultExpenses.js', () => expenses);
const incomes = vi.hoisted(() => ({
  createIncome: vi.fn(async (input) => ({ income: input })),
  getIncomes: vi.fn(async () => ({ incomes: [] })),
}));
vi.mock('../../../web/src/features/incomes/api/incomeApi.js', () => incomes);
const transfers = vi.hoisted(() => ({
  getTransfers: vi.fn(async () => ({ transfers: [] })),
  saveTransfer: vi.fn(async (input) => ({ transfer: { id: 'trf_1', ...input } })),
}));
vi.mock('../../../web/src/shared/vault/vaultTransfers.js', () => transfers);
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('../../../web/src/shared/ui/FeedbackProvider.jsx', () => ({ useFeedback: () => ({ toast, confirm: vi.fn() }) }));

const loans = vi.hoisted(() => ({ list: [] }));
vi.mock('../../../web/src/features/loans/context/LoansContext.jsx', () => ({ useOptionalLoans: () => loans.list }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({ ...(await importOriginal()), useNavigate: () => navigate }));

import SmsInboxPage from '../../../web/src/features/sms-inbox/SmsInboxPage.jsx';
import { addSmsMessages, getPendingSms } from '../../../web/src/shared/native/smsInbox.js';

const RECEIVED = new Date(2026, 8, 28, 12, 0).getTime();
const BLU_DEBIT = 'بلو\nبرداشت پول\nسینا عزیز، 20,000,000 ریال از حساب شما پرید.\nموجودی: 77,436,726 ریال\n۱۰:۴۷\n۱۴۰۵.۰۷.۰۶';
const BLU_CREDIT = 'بلو\nواریز پول\nسینا عزیز، 2,500,000 ریال به حساب شما نشست.\nموجودی: 104,451,226 ریال\n۱۸:۲۳\n۱۴۰۵.۰۷.۰۳';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  expenses.getExpenses.mockResolvedValue({ expenses: [] });
  incomes.getIncomes.mockResolvedValue({ incomes: [] });
  addSmsMessages([
    { address: '+989999987641', body: BLU_DEBIT, date: RECEIVED },
    { address: '+989999987641', body: BLU_CREDIT, date: RECEIVED - 1000 },
  ]);
});
afterEach(cleanup);

const recordButtons = () => screen.getAllByText('ثبت').map((el) => el.closest('button'));

describe('SmsInboxPage', () => {
  it('lists the waiting withdrawal and deposit', async () => {
    render(<SmsInboxPage />);
    await waitFor(() => expect(screen.getByText('برداشت')).toBeTruthy());
    expect(screen.getByText('واریز')).toBeTruthy();
    expect(document.body.textContent).toMatch(/۲.۰۰۰.۰۰۰/);
  });

  it('records a withdrawal as an everyday expense, then drops it', async () => {
    render(<SmsInboxPage />);
    await waitFor(() => expect(recordButtons()).toHaveLength(2));
    fireEvent.click(recordButtons()[0]);
    fireEvent.submit(screen.getByText('ثبت هزینه').closest('form'));
    await waitFor(() => expect(expenses.saveExpense).toHaveBeenCalled());
    expect(expenses.saveExpense.mock.calls[0][0]).toMatchObject({
      groupId: 'exg_daily', amount: 2000000, date: '2026-09-28', accountId: 'acc_1', source: 'sms', bankId: 'blu',
      smsKey: 'blu|debit|2000000|2026-09-28|10:47',
    });
    await waitFor(() => expect(getPendingSms()).toHaveLength(1));
  });

  it('records a deposit as an income', async () => {
    render(<SmsInboxPage />);
    await waitFor(() => expect(recordButtons()).toHaveLength(2));
    fireEvent.click(recordButtons()[1]);
    fireEvent.submit(screen.getByText('ثبت درآمد').closest('form'));
    await waitFor(() => expect(incomes.createIncome).toHaveBeenCalled());
    expect(incomes.createIncome.mock.calls[0][0]).toMatchObject({
      title: 'واریز بلو', amount: 250000, incomeDate: '2026-09-25', smsKey: 'blu|credit|250000|2026-09-25|18:23',
    });
    await waitFor(() => expect(getPendingSms()).toHaveLength(1));
  });

  it('drops a message already recorded from SMS (on any device), and one recorded by hand (same day, amount and kind)', async () => {
    expenses.getExpenses.mockResolvedValue({ expenses: [{ id: 'e1', date: '2026-09-28', amount: 2000000, currency: 'IRT', smsKey: 'blu|debit|2000000|2026-09-28|10:47' }] });
    incomes.getIncomes.mockResolvedValue({ incomes: [{ id: 'i1', incomeDate: '2026-09-25', amount: 250000 }] });
    render(<SmsInboxPage />);
    await waitFor(() => expect(getPendingSms()).toHaveLength(0));
    // Deposits look back a year: a share of an expense («دنگ») comes back after the expense's day
    expect(expenses.getExpenses).toHaveBeenCalledWith({ from: '2025-09-25', to: '2026-09-28' });
  });

  it('keeps a message whose look-alike differs in amount', async () => {
    expenses.getExpenses.mockResolvedValue({ expenses: [] });
    incomes.getIncomes.mockResolvedValue({ incomes: [{ id: 'i1', incomeDate: '2026-09-25', amount: 250001 }] });
    render(<SmsInboxPage />);
    await waitFor(() => expect(incomes.getIncomes).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByLabelText('گزینه‌های این پیامک')).toHaveLength(2));
    expect(getPendingSms()).toHaveLength(2);
  });

  it('reading earlier messages brings back one whose recorded expense was deleted, not one still recorded', async () => {
    const debitKey = 'blu|debit|2000000|2026-09-28|10:47';
    // Recorded: the expense carries its key
    expenses.getExpenses.mockResolvedValue({ expenses: [{ id: 'e1', date: '2026-09-28', amount: 2000000, currency: 'IRT', smsKey: debitKey }] });
    render(<SmsInboxPage />);
    await waitFor(() => expect(getPendingSms().map((p) => p.tx.direction)).toEqual(['credit']));
    plugin.read.mockResolvedValue({ messages: [{ address: '+989999987641', body: BLU_DEBIT, date: RECEIVED }] });

    // Still recorded: read again, checked, gone — nothing new
    fireEvent.click(screen.getByText('بخوان').closest('button'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('۰ مورد جدید')));
    expect(getPendingSms().map((p) => p.tx.direction)).toEqual(['credit']);
    // …but shown, apart, as already recorded (on screen only)
    await waitFor(() => expect(screen.getByText('قبلاً ثبت‌شده')).toBeTruthy());
    expect(screen.getByText('ثبت شده')).toBeTruthy();

    // The expense deleted: it comes back
    expenses.getExpenses.mockResolvedValue({ expenses: [] });
    toast.success.mockClear();
    fireEvent.click(screen.getByText('بخوان').closest('button'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('۱ مورد جدید')));
    expect(getPendingSms().map((p) => p.tx.key)).toContain(debitKey);
    // Waiting again: no longer in the «already recorded» list
    await waitFor(() => expect(screen.queryByText('قبلاً ثبت‌شده')).toBeNull());
  });

  it('dismisses a message with «رد» beside the main action (not in the menu)', async () => {
    render(<SmsInboxPage />);
    await waitFor(() => expect(screen.getAllByText('رد')).toHaveLength(2));
    fireEvent.click(screen.getAllByText('رد')[0].closest('button'));
    await waitFor(() => expect(getPendingSms()).toHaveLength(1));
    fireEvent.click(screen.getAllByLabelText('گزینه‌های این پیامک')[0]);
    expect(screen.queryByText('رد این پیامک')).toBeNull();
  });
});

describe('«ثبت در یک پروژه»: a withdrawal into a project', () => {
  it('lists the open projects, opens the form for the chosen one and records into it', async () => {
    expenses.getExpenseGroups.mockResolvedValue({ groups: [
      { id: 'exg_daily', type: 'daily', name: 'روزمره' },
      { id: 'exg_trip', type: 'project', name: 'سفر شمال' },
      { id: 'exg_old', type: 'project', name: 'پروژه‌ی بایگانی', archived: true },
    ] });
    render(<SmsInboxPage />);
    await waitFor(() => expect(screen.getAllByLabelText('گزینه‌های این پیامک')).toHaveLength(2));
    screen.getAllByLabelText('گزینه‌های این پیامک').forEach((b) => fireEvent.click(b));
    // Only a withdrawal's menu has it
    expect(screen.getAllByText('ثبت در یک پروژه')).toHaveLength(1);
    fireEvent.click(screen.getByText('ثبت در یک پروژه').closest('button'));
    await waitFor(() => expect(screen.getByText('سفر شمال')).toBeTruthy());
    expect(screen.queryByText('پروژه‌ی بایگانی')).toBeNull();
    expect(screen.queryByText('روزمره')).toBeNull();
    fireEvent.click(screen.getByText('سفر شمال').closest('button'));
    fireEvent.submit(screen.getAllByText('ثبت هزینه').map((el) => el.closest('form')).find(Boolean));
    await waitFor(() => expect(expenses.saveExpense).toHaveBeenCalled());
    expect(expenses.saveExpense.mock.calls[0][0]).toMatchObject({
      groupId: 'exg_trip', title: 'برداشت بلو', amount: 2000000, source: 'sms', smsKey: 'blu|debit|2000000|2026-09-28|10:47',
    });
    await waitFor(() => expect(getPendingSms()).toHaveLength(1));
  });
});

describe('«انتقال بین حساب‌های خودم»: neither expense nor income', () => {
  afterEach(() => { accountList.list = [{ id: 'acc_1', name: 'بلو', bankId: 'blu', type: 'bank' }]; });

  it('only with two accounts; records a transfer from the matched account and drops the message', async () => {
    render(<SmsInboxPage />);
    await waitFor(() => expect(screen.getAllByLabelText('گزینه‌های این پیامک')).toHaveLength(2));
    screen.getAllByLabelText('گزینه‌های این پیامک').forEach((b) => fireEvent.click(b));
    expect(screen.queryByText('انتقال بین حساب‌های خودم')).toBeNull();
    cleanup();

    accountList.list = [
      { id: 'acc_1', name: 'بلو', bankId: 'blu', type: 'bank' },
      { id: 'acc_2', name: 'نقد', type: 'cash' },
    ];
    render(<SmsInboxPage />);
    await waitFor(() => expect(screen.getAllByLabelText('گزینه‌های این پیامک')).toHaveLength(2));
    fireEvent.click(screen.getAllByLabelText('گزینه‌های این پیامک')[0]);
    fireEvent.click(screen.getByText('انتقال بین حساب‌های خودم').closest('button'));
    // To: the cash account (from is the withdrawal's account)
    const toPicker = screen.getByText('به حساب *').closest('.ui-input-group');
    fireEvent.click([...toPicker.querySelectorAll('button')].find((b) => b.textContent.includes('نقد')));
    fireEvent.submit(screen.getByText('ثبت انتقال').closest('form'));
    await waitFor(() => expect(transfers.saveTransfer).toHaveBeenCalled());
    expect(transfers.saveTransfer.mock.calls[0][0]).toMatchObject({
      fromAccountId: 'acc_1', toAccountId: 'acc_2', amount: 2000000, date: '2026-09-28', smsKeys: ['blu|debit|2000000|2026-09-28|10:47'],
    });
    expect(expenses.saveExpense).not.toHaveBeenCalled();
    await waitFor(() => expect(getPendingSms()).toHaveLength(1));
  });

  it('a message already in a transfer leaves the inbox', async () => {
    transfers.getTransfers.mockResolvedValueOnce({ transfers: [{ id: 't1', date: '2026-09-28', amount: 2000000, smsKeys: ['blu|debit|2000000|2026-09-28|10:47'] }] });
    render(<SmsInboxPage />);
    await waitFor(() => expect(getPendingSms().map((p) => p.tx.direction)).toEqual(['credit']));
  });
});

describe('«ثبت سریع» (no form)', () => {
  const SMALL = 'بلو\nبرداشت پول\nسینا عزیز، 3,500,000 ریال از حساب شما پرید.\nموجودی: 73,936,726 ریال\n۱۱:۰۵\n۱۴۰۵.۰۷.۰۶';

  it('off by default: every message shows «ثبت»', async () => {
    addSmsMessages([{ address: '+989999987641', body: SMALL, date: RECEIVED + 1000 }]);
    render(<SmsInboxPage />);
    await waitFor(() => expect(screen.getAllByText('ثبت')).toHaveLength(3));
    expect(screen.queryByText('ثبت سریع')).toBeNull();
  });

  it('turned on in the settings: only for a withdrawal up to 1 million tomans; records it in the settings category', async () => {
    addSmsMessages([{ address: '+989999987641', body: SMALL, date: RECEIVED + 1000 }]);
    localStorage.setItem('realrate_sms_settings', JSON.stringify({ recordCategory: 'dining', quickRecord: true }));
    render(<SmsInboxPage />);
    await waitFor(() => expect(screen.getAllByText('ثبت سریع')).toHaveLength(1));
    fireEvent.click(screen.getByText('ثبت سریع').closest('button'));
    await waitFor(() => expect(expenses.saveExpense).toHaveBeenCalledTimes(1));
    expect(expenses.saveExpense.mock.calls[0][0]).toMatchObject({
      amount: 350000, category: 'dining', groupId: 'exg_daily', source: 'sms', accountId: 'acc_1',
    });
    await waitFor(() => expect(getPendingSms()).toHaveLength(2));
    expect(getPendingSms().some((p) => p.tx.amount === 350000)).toBe(false);
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('رستوران'));
  });
});

describe('«وام»: a deposit that is a received loan', () => {
  const LOAN = 'دریافت وام (درآمد نیست)';
  // In each message's «⋮» menu; only a deposit's menu has it
  const openMenus = () => screen.getAllByLabelText('گزینه‌های این پیامک').forEach((b) => fireEvent.click(b));
  const loanButton = () => screen.getByText(LOAN).closest('button');

  it('only on deposits; choosing a loan drops the message without recording income', async () => {
    loans.list = [
      { id: 'loan_a', title: 'وام مسکن', principalAmount: 250000, installmentCount: 12, paidCount: 0, remainingBalance: 250000 },
      { id: 'loan_s', title: 'وام تسویه‌شده', principalAmount: 1000, installmentCount: 1, paidCount: 1, remainingBalance: 0 },
    ];
    render(<SmsInboxPage />);
    await waitFor(() => expect(screen.getAllByLabelText('گزینه‌های این پیامک')).toHaveLength(2));
    openMenus();
    expect(screen.getAllByText(LOAN)).toHaveLength(1);
    fireEvent.click(loanButton());
    expect(screen.queryByText('وام تسویه‌شده')).toBeNull();
    fireEvent.click(screen.getByText('وام مسکن').closest('button'));
    await waitFor(() => expect(getPendingSms()).toHaveLength(1));
    expect(getPendingSms()[0].tx.direction).toBe('debit');
    expect(incomes.createIncome).not.toHaveBeenCalled();
  });

  it('a new loan opens the loans page with the amount, day and bank, keeping the message until saved', async () => {
    loans.list = [];
    render(<SmsInboxPage />);
    await waitFor(() => expect(screen.getAllByLabelText('گزینه‌های این پیامک')).toHaveLength(2));
    openMenus();
    fireEvent.click(loanButton());
    fireEvent.click(screen.getByText('ثبت وام جدید با این مبلغ').closest('button'));
    const url = new URL(navigate.mock.calls[0][0], 'http://x');
    expect(url.pathname).toMatch(/\/loans$/);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ add: 'loan', amount: '250000', date: '2026-09-25', bank: 'blu' });
    expect(getPendingSms()).toHaveLength(2);
  });
});
