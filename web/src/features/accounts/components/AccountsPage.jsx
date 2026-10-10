/**
 * AccountsPage.jsx — The user's money accounts: bank accounts, cash, e-wallets (beta:
 * `bank_accounts`)
 *
 * Each account is a card (bank logo, name, card's last digits) with this month's spending from it
 * — everyday and projects', in each currency it was paid in (a euro account's in euros) and, when
 * that is not all tomans, about how much in tomans — and what moved in and out of it between the
 * user's own accounts; expenses pick
 * one of them as the account they were paid from. Below the cards, «انتقال بین حساب‌ها»: money
 * moved between the user's accounts (cash management) — never an expense or an income
 * (TransferForm, utils/transferDocument.js). A bank credit's card shows its limit and debt, with
 * «تسویه بدهی», «تبدیل به قسط» and each installment's «پرداخت» — all by hand, the fees worked out
 * from the amounts entered (CreditSummary, CreditPaymentForm, CreditConversionForm,
 * utils/creditAccount.js). Everything is end-to-end encrypted.
 */

import React, { useMemo, useState } from 'react';
import { WalletCards, Plus, Pencil, Trash2, Archive, ArchiveRestore, ArrowLeftRight, ChevronRight, ChevronLeft, ArrowLeft } from 'lucide-react';
import { AlertBanner, Button, EmptyState, FeaturePageHeader } from '../../../shared/ui/index.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { SkeletonCards } from '../../../shared/ui/Skeleton.jsx';
import VaultUnlockCard from '../../../shared/vault/VaultUnlockCard.jsx';
import { BankLogo, resolveBank, useCustomBanks } from '../../../shared/banks/index.js';
import { useFeature } from '../../../shared/features/useFeature.js';
import { usePrivacyMode } from '../../../hooks/usePrivacyMode.js';
import { todayIso } from '../../../shared/utils/dates.js';
import { accountTypeLabel, accountsForCurrency, isCreditAccount } from '../../../utils/accountDocument.js';
import { accountCurrencyLabel } from '../constants/accountDisplay.js';
import { summarizeByAccount, shamsiMonthOf, shamsiMonthRange, shiftShamsiMonth } from '../../../utils/expenseDocument.js';
import { summarizeTransfersByAccount } from '../../../utils/transferDocument.js';
import { formatShamsiMonth } from '../../incomes/utils/incomeReport.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { useDemo } from '../../demo/index.js';
import { useDailyExpenses } from '../../expenses/hooks/useDailyExpenses.js';
import { formatAmount } from '../../expenses/utils/format.js';
import { currencyAmounts, currencyLabel, formatMoney } from '../../../utils/currencies.js';
import { usePricing } from '../../market/context/PricingContext.jsx';
import { useUsdAt } from '../../market/dailyHistory.js';
import { useFxRates } from '../../market/useFxRates.js';
import { useQuickAddParam } from '../../../shared/hooks/useQuickAddParam.js';
import { useAccounts } from '../hooks/useAccounts.js';
import { useTransfers } from '../hooks/useTransfers.js';
import { useCreditStatus } from '../hooks/useCreditStatus.js';
import { CREDIT_COST_CATEGORY } from '../../../utils/creditAccount.js';
import { getExpenseGroups, ensureDailyGroup, saveExpense, deleteExpense } from '../../../shared/vault/vaultExpenses.js';
import { getAccountTypeIcon, accountLabel } from '../constants/accountDisplay.js';
import AccountForm from './AccountForm.jsx';
import TransferForm from './TransferForm.jsx';
import CreditSummary from './CreditSummary.jsx';
import CreditPaymentForm from './CreditPaymentForm.jsx';
import CreditConversionForm from './CreditConversionForm.jsx';

const HEADER = {
  icon: <WalletCards size={24} />,
  title: 'حساب‌ها',
  subtitle: 'حساب‌های بانکی، اعتبارها، پول نقد و کیف پول؛ منبع هزینه‌های شما',
};

/**
 * «هزینه‌های این ماه» on an account's card: what left it in each currency it was paid in, and — when
 * that is not tomans alone — about how much in tomans (summarizeByAccount)
 * @param {{ spent?: { totalToman: number, byCurrency: Record<string, number> }, hideValues?: boolean }} props
 */
function AccountSpending({ spent, hideValues = false }) {
  const amounts = currencyAmounts(spent?.byCurrency);
  const tomanOnly = amounts.length === 1 && amounts[0].code === 'IRT';
  return (
    <div className="account-card-stat">
      <span>هزینه‌های این ماه</span>
      {amounts.length === 0 ? <strong>—</strong> : (
        <span className="account-card-spent">
          {amounts.map(({ code, amount }) => (
            <strong key={code}>{hideValues ? `**** ${currencyLabel(code)}` : formatMoney(amount, code)}</strong>
          ))}
          {!tomanOnly && spent.totalToman > 0 && (
            <small>≈ {hideValues ? '****' : formatAmount(spent.totalToman)} تومان</small>
          )}
        </span>
      )}
    </div>
  );
}

export default function AccountsPage() {
  const { readOnly } = useDemo();
  const { confirm } = useFeedback();
  const hideValues = usePrivacyMode();
  const { customBanks } = useCustomBanks();
  const hasExpenses = useFeature('expenses');
  const {
    accounts, vaultLocked, loading, submitting, deletingId, error, clearError, fetchAccounts,
    saveAccount, deleteAccount,
  } = useAccounts();
  const [form, setForm] = useState(null); // null | { account: object|null }
  const [transferForm, setTransferForm] = useState(null); // null | { transfer: object|null }
  // null | { accountId, installment?: { planId, n, count, dueDate, amount } }: settling a credit, or paying an installment
  const [payCredit, setPayCredit] = useState(null);
  const [convertId, setConvertId] = useState(null); // null | the credit account whose debt is turned into installments
  // Each bank credit's debt, next payment and installments
  const credit = useCreditStatus(accounts);

  // This month's spending per account, everyday and projects' (only with the expenses feature):
  // in each currency as paid, and in tomans at each expense's day rate (utils/currencies.js)
  const thisMonth = useMemo(() => shamsiMonthOf(todayIso()), []);
  const { expenses: dailyExpenses, projectExpenses = [] } = useDailyExpenses(thisMonth, { enabled: hasExpenses });
  const monthExpenses = useMemo(() => [...dailyExpenses, ...projectExpenses], [dailyExpenses, projectExpenses]);
  const usdToman = Number(usePricing()?.getAssetPrice?.('usd')) || 0;
  const usdAt = useUsdAt(monthExpenses.some((e) => e.currency === 'USD'));
  const fx = useFxRates(monthExpenses);
  const spentBy = useMemo(
    () => new Map(summarizeByAccount(monthExpenses, { usdToman, usdAt, ...fx }).map((s) => [s.accountId, s])),
    [monthExpenses, usdToman, usdAt, fx]
  );

  // Transfers of the month shown (this month to start with)
  const [transferMonth, setTransferMonth] = useState(thisMonth);
  const transferRange = useMemo(() => shamsiMonthRange(transferMonth.jy, transferMonth.jm), [transferMonth]);
  const { transfers, saveTransfer, deleteTransfer, submitting: savingTransfer } = useTransfers({ from: transferRange.from, to: transferRange.to });
  const movedBy = useMemo(() => summarizeTransfersByAccount(transfers), [transfers]);
  const isThisMonth = transferMonth.jy === thisMonth.jy && transferMonth.jm === thisMonth.jm;
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const money = (v) => (hideValues ? '****' : formatAmount(v));
  // The app's "+" button: /accounts?add=transfer
  useQuickAddParam('transfer', () => setTransferForm({ transfer: null }), !vaultLocked && !readOnly && !loading);

  if (vaultLocked) {
    return (
      <div className="incomes-page-container">
        <FeaturePageHeader {...HEADER} />
        <VaultUnlockCard title="حساب‌های شما رمزنگاری شده‌اند" />
      </div>
    );
  }

  const handleDelete = async (account) => {
    const ok = await confirm({
      title: 'حذف حساب',
      message: `حساب «${account.name}» حذف شود؟ هزینه‌های ثبت‌شده از آن باقی می‌مانند، بدون نام حساب.`,
      confirmLabel: 'حذف',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteAccount(account.id);
    } catch {
      // Surfaced through the hook's `error` banner
    }
  };

  const handleDeleteTransfer = async (transfer) => {
    const ok = await confirm({
      title: 'حذف انتقال',
      message: `انتقال ${formatAmount(transfer.amount)} تومانی حذف شود؟`,
      confirmLabel: 'حذف',
      danger: true,
    });
    if (ok) deleteTransfer(transfer.id).then(credit.reload).catch(() => {});
  };

  // A credit's installment plans are kept on its account, as the user entered them (always the
  // latest copy of the account: one may have just been saved)
  const saveConversions = (accountId, change) => {
    const account = accountById.get(accountId);
    return saveAccount({ credit: { ...account.credit, conversions: change(account.credit.conversions || []) } }, account);
  };

  // «تبدیل به قسط»: the installments' fee is an expense charged to the credit itself, so the credit
  // owes the installments' total
  const handleConvert = async (accountId, conversion, cost) => {
    const account = accountById.get(accountId);
    let feeExpenseId = '';
    if (cost > 0) {
      const group = await ensureDailyGroup((await getExpenseGroups()).groups || []);
      const { expense } = await saveExpense({
        groupId: group.id,
        title: `کارمزد قسط‌بندی ${account.name}`,
        amount: cost,
        currency: 'IRT',
        date: conversion.date,
        category: CREDIT_COST_CATEGORY,
        accountId: account.id,
        creditAccountId: account.id,
      });
      feeExpenseId = expense.id;
    }
    await saveConversions(accountId, (list) => [...list, { ...conversion, ...(feeExpenseId ? { feeExpenseId } : {}) }]);
    credit.reload();
  };

  const handleUndoConversion = async (account, plan) => {
    const ok = await confirm({
      title: 'حذف قسط‌بندی',
      message: 'این قسط‌بندی و کارمزدش حذف شود؟ پرداخت‌هایی که برای اقساطش ثبت کرده‌اید باقی می‌مانند و از بدهی کم می‌شوند.',
      confirmLabel: 'حذف',
      danger: true,
    });
    if (!ok) return;
    try {
      if (plan.feeExpenseId) await deleteExpense(plan.feeExpenseId).catch(() => {});
      await saveConversions(account.id, (list) => list.filter((c) => c.id !== plan.id));
      credit.reload();
    } catch {
      // Surfaced through the hook's `error` banner
    }
  };

  // An installment paid: the transfer is recorded by the form, then the installment is marked paid
  const markInstallmentPaid = (accountId, { planId, n }, transfer, date) => saveConversions(accountId, (list) => list.map((c) => (
    c.id !== planId ? c : {
      ...c,
      installments: c.installments.map((i, k) => (k + 1 === n ? { ...i, paidOn: date, transferId: transfer.id } : i)),
    }
  )));

  const toggleArchive = (account) => saveAccount({ archived: !account.archived }, account).catch(() => {});

  return (
    <div className="incomes-page-container accounts-page">
      <FeaturePageHeader
        {...HEADER}
        actions={
          <>
            {accounts.length >= 2 && (
              <Button variant="secondary" icon={<ArrowLeftRight size={16} />} onClick={() => setTransferForm({ transfer: null })} disabled={readOnly}>
                انتقال بین حساب‌ها
              </Button>
            )}
            <Button
              icon={<Plus size={16} />}
              onClick={() => setForm({ account: null })}
              disabled={readOnly}
              title={readOnly ? 'در نسخه دمو غیرفعال است' : undefined}
            >
              حساب جدید
            </Button>
          </>
        }
      />

      {error && (
        <AlertBanner
          type="error"
          message={error}
          onClose={clearError}
          action={<Button size="sm" variant="secondary" onClick={fetchAccounts}>تلاش مجدد</Button>}
        />
      )}

      {loading && accounts.length === 0 ? (
        <SkeletonCards count={3} />
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={<WalletCards size={44} strokeWidth={1.5} />}
          title="هنوز حسابی اضافه نکرده‌اید"
          description="حساب‌های بانکی، پول نقد یا کیف پول الکترونیک را اضافه کنید تا هنگام ثبت هزینه مشخص کنید از کدام پرداخت شده است."
          action={!readOnly && (
            <Button icon={<Plus size={16} />} onClick={() => setForm({ account: null })}>افزودن اولین حساب</Button>
          )}
        />
      ) : (
        <div className="account-grid">
          {accounts.map((account) => {
            const Icon = getAccountTypeIcon(account.type);
            const spent = spentBy.get(account.id);
            const bank = (account.type === 'bank' || account.type === 'credit') && account.bankId
              ? resolveBank({ bankId: account.bankId, lenderName: account.bankName }, customBanks)
              : null;
            return (
              <article key={account.id} className={`account-card ${account.archived ? 'is-archived' : ''}`}>
                <header className="account-card-head">
                  {bank ? <BankLogo bank={bank} size={38} /> : <span className="account-type-icon"><Icon size={20} /></span>}
                  <div className="account-card-title">
                    <strong>{account.name}</strong>
                    <span>
                      {accountTypeLabel(account.type)}
                      {accountCurrencyLabel(account) && ` · ${accountCurrencyLabel(account)}`}
                      {account.archived && ' · بایگانی‌شده'}
                    </span>
                  </div>
                </header>
                {account.cardLast4 && (
                  <div className="account-card-number" dir="ltr">
                    •••• •••• •••• {account.cardLast4}
                  </div>
                )}
                {isCreditAccount(account) && (
                  <CreditSummary
                    status={credit.statusById.get(account.id)}
                    costsPaid={credit.costsById.get(account.id) || 0}
                    hideValues={hideValues}
                    readOnly={readOnly}
                    onSettle={() => setPayCredit({ accountId: account.id })}
                    onConvert={() => setConvertId(account.id)}
                    onPayInstallment={(plan, i) => setPayCredit({ accountId: account.id, installment: { planId: plan.id, n: i.n, count: plan.installments.length, dueDate: i.dueDate, amount: i.amount } })}
                    onUndoConversion={(plan) => handleUndoConversion(account, plan)}
                  />
                )}
                {hasExpenses && <AccountSpending spent={spent} hideValues={hideValues} />}
                {movedBy.has(account.id) && (
                  <div className="account-card-stat">
                    <span>انتقال {isThisMonth ? 'این ماه' : formatShamsiMonth(transferMonth.jy, transferMonth.jm)}</span>
                    <strong className="account-card-moved">
                      {movedBy.get(account.id).in > 0 && <span className="is-in">+{money(movedBy.get(account.id).in)}</span>}
                      {movedBy.get(account.id).out > 0 && <span className="is-out">−{money(movedBy.get(account.id).out)}</span>}
                    </strong>
                  </div>
                )}
                {account.notes && <p className="account-card-notes">{account.notes}</p>}
                {!readOnly && (
                  <div className="row-actions-group account-card-actions">
                    <button type="button" className="btn-table-action edit" title="ویرایش حساب" onClick={() => setForm({ account })}>
                      <Pencil size={13} strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      className="btn-table-action"
                      title={account.archived ? 'بازگردانی از بایگانی' : 'بایگانی (در فرم هزینه نمایش داده نمی‌شود)'}
                      onClick={() => toggleArchive(account)}
                    >
                      {account.archived ? <ArchiveRestore size={13} strokeWidth={2} /> : <Archive size={13} strokeWidth={2} />}
                    </button>
                    <button
                      type="button"
                      className={`btn-table-action delete ${deletingId === account.id ? 'loading' : ''}`}
                      title="حذف حساب"
                      onClick={() => handleDelete(account)}
                      disabled={deletingId === account.id}
                    >
                      <Trash2 size={13} strokeWidth={2} />
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {accounts.length >= 2 && (
        <section className="transfers-section">
          <header className="transfers-head">
            <h3><ArrowLeftRight size={17} /> انتقال بین حساب‌ها</h3>
            <div className="transfers-month">
              <button type="button" className="btn-table-action" title="ماه قبل" onClick={() => setTransferMonth((m) => shiftShamsiMonth(m, -1))}>
                <ChevronRight size={15} />
              </button>
              <span>{formatShamsiMonth(transferMonth.jy, transferMonth.jm)}</span>
              <button type="button" className="btn-table-action" title="ماه بعد" disabled={isThisMonth} onClick={() => setTransferMonth((m) => shiftShamsiMonth(m, 1))}>
                <ChevronLeft size={15} />
              </button>
            </div>
          </header>
          <p className="transfers-hint">جابه‌جایی پول بین حساب‌های خودتان (کارت به کارت به حساب دیگرتان، برداشت نقدی، شارژ کیف پول) هزینه یا درآمد نیست و در جمع آن‌ها حساب نمی‌شود.</p>
          {transfers.length === 0 ? (
            <p className="transfers-empty">انتقالی در این ماه ثبت نشده است.</p>
          ) : (
            <ul className="transfers-list">
              {transfers.map((t) => (
                <li key={t.id}>
                  <span className="transfers-date">{formatShamsiDisplay(`${t.date}T00:00:00`)}</span>
                  <span className="transfers-route">
                    {accountLabel(accountById.get(t.fromAccountId))} <ArrowLeft size={14} /> {accountLabel(accountById.get(t.toAccountId))}
                  </span>
                  <strong className="transfers-amount">
                    {money(t.amount)} تومان
                    {t.fee > 0 && <small> (کارمزد {money(t.fee)})</small>}
                  </strong>
                  {t.notes && <span className="transfers-notes">{t.notes}</span>}
                  {!readOnly && (
                    <span className="row-actions-group">
                      <button type="button" className="btn-table-action edit" title="ویرایش" onClick={() => setTransferForm({ transfer: t })}>
                        <Pencil size={13} />
                      </button>
                      <button type="button" className="btn-table-action delete" title="حذف" onClick={() => handleDeleteTransfer(t)}>
                        <Trash2 size={13} />
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {transferForm && (
        <TransferForm
          key={transferForm.transfer?.id || 'new'}
          transfer={transferForm.transfer}
          accounts={accounts.filter((a) => !a.archived || a.id === transferForm.transfer?.fromAccountId || a.id === transferForm.transfer?.toAccountId)}
          submitting={savingTransfer}
          onSubmit={async (input) => {
            await saveTransfer(input, transferForm.transfer);
            // A transfer into or out of a credit changes what is owed on it
            credit.reload();
          }}
          onClose={() => setTransferForm(null)}
        />
      )}

      {convertId && accountById.get(convertId) && (
        <CreditConversionForm
          account={accountById.get(convertId)}
          debt={credit.statusById.get(convertId)?.freeDebt || 0}
          onSave={(conversion, cost) => handleConvert(convertId, conversion, cost)}
          onClose={() => setConvertId(null)}
        />
      )}

      {payCredit && accountById.get(payCredit.accountId) && (
        <CreditPaymentForm
          account={accountById.get(payCredit.accountId)}
          debt={credit.statusById.get(payCredit.accountId)?.freeDebt || 0}
          installment={payCredit.installment || null}
          payers={accountsForCurrency(accounts, 'IRT').filter((a) => !a.archived && !isCreditAccount(a))}
          saveTransfer={(input) => saveTransfer(input)}
          onPaid={async (transfer, date) => {
            if (payCredit.installment) await markInstallmentPaid(payCredit.accountId, payCredit.installment, transfer, date);
            credit.reload();
          }}
          onClose={() => setPayCredit(null)}
        />
      )}

      {form && (
        <AccountForm
          key={form.account?.id || 'new'}
          account={form.account}
          onSubmit={(input) => saveAccount(input, form.account)}
          onClose={() => setForm(null)}
          submitting={submitting}
        />
      )}
    </div>
  );
}
