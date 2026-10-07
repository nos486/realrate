// @vitest-environment happy-dom
/**
 * creditAccountUi.test.jsx — A bank credit on the accounts page: its card shows the debt, the
 * next payment with its fee and the installments of a statement not settled in time; «پرداخت
 * بدهی» records the repayment as a transfer into the credit and the fee as an expense of its own;
 * the account form takes the credit's terms
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { addDaysIso, validateCreditTerms } from '../../src/domain/creditAccount.js';

const today = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();
const store = vi.hoisted(() => ({
  expenses: [],
  transfers: [],
  saveTransfer: null,
  saveExpense: null,
  saveAccount: null,
}));
store.saveTransfer = vi.fn(async (input) => ({ id: 'trf_new', ...input }));
store.saveExpense = vi.fn(async (input) => ({ expense: { id: 'exp_fee', ...input } }));
store.saveAccount = vi.fn(async () => ({}));

// A credit closing today, every purchase in this statement; a statement 90 days ago never paid
const credit = (patch = {}) => validateCreditTerms({
  limit: 100_000_000, closingDay: 1, graceDays: 0, payMode: 'due_day', settleFeePct: 2,
  installmentCount: 6, installmentRatePct: 0, startDate: addDaysIso(today, -120), ...patch,
}).value;
const ACCOUNTS = [
  { id: 'bank_1', name: 'ملت', type: 'bank' },
  { id: 'cr_1', name: 'اوانو', type: 'credit', credit: credit() },
];

vi.mock('../../../web/src/features/accounts/hooks/useAccounts.js', () => ({
  useAccounts: () => ({ accounts: ACCOUNTS, vaultLocked: false, loading: false, submitting: false, deletingId: null, error: null, clearError: vi.fn(), fetchAccounts: vi.fn(), saveAccount: store.saveAccount, deleteAccount: vi.fn() }),
}));
vi.mock('../../../web/src/features/accounts/hooks/useTransfers.js', () => ({
  useTransfers: () => ({ transfers: [], saveTransfer: store.saveTransfer, deleteTransfer: vi.fn(), submitting: false }),
}));
vi.mock('../../../web/src/shared/vault/vaultExpenses.js', () => ({
  getExpenses: vi.fn(async () => ({ expenses: store.expenses })),
  getExpenseGroups: vi.fn(async () => ({ groups: [{ id: 'g_daily', type: 'daily' }] })),
  ensureDailyGroup: vi.fn(async (groups) => groups[0]),
  saveExpense: (...a) => store.saveExpense(...a),
}));
vi.mock('../../../web/src/shared/vault/vaultTransfers.js', () => ({
  getTransfers: vi.fn(async () => ({ transfers: store.transfers })),
}));
vi.mock('../../../web/src/features/expenses/hooks/useDailyExpenses.js', () => ({ useDailyExpenses: () => ({ expenses: [] }) }));
vi.mock('../../../web/src/shared/features/useFeature.js', () => ({ useFeature: () => true }));
vi.mock('../../../web/src/features/demo/index.js', () => ({ useDemo: () => ({ readOnly: false }), isDemoReadOnly: () => false }));
vi.mock('../../../web/src/shared/ui/FeedbackProvider.jsx', () => ({ useFeedback: () => ({ confirm: vi.fn(async () => true), toast: { success: vi.fn(), error: vi.fn() } }) }));
vi.mock('../../../web/src/shared/banks/index.js', () => ({ BankLogo: () => null, resolveBank: () => null, useCustomBanks: () => ({ customBanks: [] }), BankPicker: () => null }));

import AccountsPage from '../../../web/src/features/accounts/components/AccountsPage.jsx';
import AccountForm from '../../../web/src/features/accounts/components/AccountForm.jsx';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const renderPage = () => render(<MemoryRouter><AccountsPage /></MemoryRouter>);
const card = () => screen.getByText('اوانو').closest('article');

describe('a bank credit on the accounts page', () => {
  it('shows the debt, what is free, and the statement due today with its fee', async () => {
    store.expenses = [{ id: 'e1', accountId: 'cr_1', date: addDaysIso(today, -5), amount: 10_000_000, currency: 'IRT' }];
    store.transfers = [];
    // Closing day = today's Shamsi day, so this statement is due today
    const jd = Number(new Intl.DateTimeFormat('en-US-u-ca-persian', { day: 'numeric' }).format(new Date()));
    ACCOUNTS[1].credit = credit({ closingDay: jd, startDate: addDaysIso(today, -10) });
    renderPage();
    await waitFor(() => expect(within(card()).getByText(/۱۰٬۰۰۰٬۰۰۰ تومان/)).toBeTruthy());
    expect(within(card()).getByText(/آزاد: ۹۰٬۰۰۰٬۰۰۰/)).toBeTruthy();
    expect(within(card()).getByText(/تسویه‌ی صورت‌حساب/)).toBeTruthy();
    expect(within(card()).getByText('۱۰٬۲۰۰٬۰۰۰ تومان')).toBeTruthy();
    expect(within(card()).getByText(/شامل کارمزد ۲۰۰٬۰۰۰ تومان/)).toBeTruthy();
    expect(within(card()).getByText(/پرداخت فقط در روز سررسید/)).toBeTruthy();
  });

  it('a statement not paid in time stays overdue until the user turns it into installments, as the bank set them', async () => {
    ACCOUNTS[1].credit = credit({ closingDay: 1, startDate: addDaysIso(today, -150), installmentRatePct: 0 });
    store.expenses = [{ id: 'e1', accountId: 'cr_1', date: addDaysIso(today, -140), amount: 6_000_000, currency: 'IRT' }];
    store.transfers = [];
    renderPage();
    await waitFor(() => expect(within(card()).getByText(/پرداخت معوق/)).toBeTruthy());
    expect(within(card()).queryByText(/اقساط صورت‌حساب/)).toBeNull();
    expect(within(card()).getByText(/گذشته/)).toBeTruthy();

    fireEvent.click(within(card()).getByText(/تبدیل به اقساط/));
    const dialog = await screen.findByText('سررسید اولین قسط *');
    const form = dialog.closest('form');
    // The bank set 6 × 1,050,000
    fireEvent.change(form.querySelector('#conversion-payment'), { target: { value: '1050000' } });
    expect(within(form).getByText(/جمع اقساط ۶٬۳۰۰٬۰۰۰ تومان/)).toBeTruthy();
    fireEvent.submit(form);
    await waitFor(() => expect(store.saveAccount).toHaveBeenCalled());
    const [input, existing] = store.saveAccount.mock.calls[0];
    expect(existing.id).toBe('cr_1');
    expect(input.credit.conversions).toHaveLength(1);
    expect(input.credit.conversions[0]).toMatchObject({ principal: 6_000_000, count: 6, payment: 1_050_000, date: today });
    expect(input.credit.conversions[0].firstDueDate >= today).toBe(true);
  });

  it('a plan the user set shows its installments, and can be undone', async () => {
    const conversion = { id: 'cnv_1', date: addDaysIso(today, -100), closeDate: addDaysIso(today, -110), principal: 6_000_000, count: 6, payment: 1_000_000, firstDueDate: addDaysIso(today, -70) };
    ACCOUNTS[1].credit = credit({ startDate: addDaysIso(today, -150), conversions: [conversion] });
    // The purchase is on the statement the conversion names
    ACCOUNTS[1].credit.closingDay = Number(new Intl.DateTimeFormat('en-US-u-ca-persian', { day: 'numeric' }).format(new Date(`${conversion.closeDate}T12:00:00`)));
    store.expenses = [{ id: 'e1', accountId: 'cr_1', date: addDaysIso(today, -115), amount: 6_000_000, currency: 'IRT' }];
    store.transfers = [];
    renderPage();
    await waitFor(() => expect(within(card()).getByText(/اقساط صورت‌حساب/)).toBeTruthy());
    expect(within(card()).getByText(/قسط .* از ۶/)).toBeTruthy();
    expect(within(card()).getByText(/پرداخت معوق/)).toBeTruthy();
    fireEvent.click(within(card()).getByText(/حذف قسط‌بندی/));
    await waitFor(() => expect(store.saveAccount).toHaveBeenCalled());
    expect(store.saveAccount.mock.calls[0][0].credit.conversions).toEqual([]);
  });

  it('«پرداخت بدهی»: a transfer into the credit, and the fee as an expense of its own', async () => {
    const jd = Number(new Intl.DateTimeFormat('en-US-u-ca-persian', { day: 'numeric' }).format(new Date()));
    ACCOUNTS[1].credit = credit({ closingDay: jd, startDate: addDaysIso(today, -10) });
    store.expenses = [{ id: 'e1', accountId: 'cr_1', date: addDaysIso(today, -5), amount: 10_000_000, currency: 'IRT' }];
    store.transfers = [];
    renderPage();
    await waitFor(() => expect(within(card()).getByText('پرداخت بدهی')).toBeTruthy());
    fireEvent.click(within(card()).getByText('پرداخت بدهی'));
    // Paid from the only other account
    const submit = await screen.findByText('ثبت پرداخت');
    fireEvent.submit(submit.closest('form'));
    await waitFor(() => expect(store.saveTransfer).toHaveBeenCalled());
    expect(store.saveTransfer.mock.calls[0][0]).toMatchObject({ fromAccountId: 'bank_1', toAccountId: 'cr_1', amount: 10_000_000, date: today });
    await waitFor(() => expect(store.saveExpense).toHaveBeenCalled());
    expect(store.saveExpense.mock.calls[0][0]).toMatchObject({
      groupId: 'g_daily', amount: 200_000, category: 'credit_fees', accountId: 'bank_1', creditAccountId: 'cr_1', date: today,
    });
  });
});

describe('the account form', () => {
  it('the fee and the installments can be given by amounts: the percent and the rate are worked out', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<AccountForm onSubmit={onSubmit} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('اعتبار بانکی'));
    fireEvent.change(screen.getByLabelText('سقف اعتبار (تومان) *'), { target: { value: '100000000' } });
    fireEvent.change(screen.getByLabelText('نام حساب (اختیاری)'), { target: { value: 'اوانو' } });
    fireEvent.click(screen.getByText('با مبلغ'));
    fireEvent.change(screen.getByLabelText('مبلغ استفاده‌شده (تومان)'), { target: { value: '10000000' } });
    fireEvent.change(screen.getByLabelText('مبلغ برگشتی (تومان)'), { target: { value: '10200000' } });
    expect(screen.getByText(/کارمزد: ۲٪/)).toBeTruthy();
    fireEvent.click(screen.getByText('مبلغ قسط را می‌دانم'));
    fireEvent.change(screen.getByLabelText('برای مبلغ (تومان)'), { target: { value: '10000000' } });
    fireEvent.change(screen.getByLabelText('مبلغ هر قسط (تومان)'), { target: { value: '1850000' } });
    expect(screen.getByText(/جمع اقساط ۱۱٬۱۰۰٬۰۰۰ تومان؛ سود سالانه حدود/)).toBeTruthy();
    fireEvent.submit(screen.getByText('افزودن حساب').closest('form'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].credit).toMatchObject({
      feeSample: { used: 10_000_000, repaid: 10_200_000 },
      installmentSample: { principal: 10_000_000, payment: 1_850_000 },
      installmentCount: 6,
      conversions: [],
    });
  });

  it('a bank credit takes its terms', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<AccountForm onSubmit={onSubmit} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('اعتبار بانکی'));
    fireEvent.change(screen.getByLabelText('نام حساب (اختیاری)'), { target: { value: 'اوانو' } });
    fireEvent.change(screen.getByLabelText('سقف اعتبار (تومان) *'), { target: { value: '100000000' } });
    fireEvent.change(screen.getByLabelText('روز بستن صورت‌حساب'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('کارمزد تسویه (درصد)'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('فقط در روز سررسید'));
    expect(screen.queryByText('ارز حساب')).toBeNull();
    fireEvent.submit(screen.getByText('افزودن حساب').closest('form'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      type: 'credit',
      name: 'اوانو',
      currency: 'IRT',
      credit: { limit: 100_000_000, closingDay: 15, settleFeePct: 2, payMode: 'due_day', installmentCount: 6 },
    });
  });
});
