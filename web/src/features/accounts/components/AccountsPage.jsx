/**
 * AccountsPage.jsx — The user's money accounts: bank accounts, cash, e-wallets (beta:
 * `bank_accounts`)
 *
 * Each account is a card (bank logo, name, card's last digits) with this month's everyday
 * spending from it and what moved in and out of it between the user's own accounts; expenses pick
 * one of them as the account they were paid from. Below the cards, «انتقال بین حساب‌ها»: money
 * moved between the user's accounts (cash management) — never an expense or an income
 * (TransferForm, utils/transferDocument.js). A bank credit's card also shows its debt, the next
 * payment and its installments, with «پرداخت بدهی» and, for a statement not settled in time,
 * «تبدیل به اقساط» (CreditSummary, CreditPaymentForm, CreditConversionForm, utils/creditAccount.js). Everything is end-to-end encrypted.
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
import { accountTypeLabel, isCreditAccount } from '../../../utils/accountDocument.js';
import { summarizeByAccount, shamsiMonthOf, shamsiMonthRange, shiftShamsiMonth } from '../../../utils/expenseDocument.js';
import { summarizeTransfersByAccount } from '../../../utils/transferDocument.js';
import { formatShamsiMonth } from '../../incomes/utils/incomeReport.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { useDemo } from '../../demo/index.js';
import { useDailyExpenses } from '../../expenses/hooks/useDailyExpenses.js';
import { formatAmount } from '../../expenses/utils/format.js';
import { useQuickAddParam } from '../../../shared/hooks/useQuickAddParam.js';
import { useAccounts } from '../hooks/useAccounts.js';
import { useTransfers } from '../hooks/useTransfers.js';
import { useCreditStatus } from '../hooks/useCreditStatus.js';
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
  const [payCredit, setPayCredit] = useState(null); // null | the credit account being paid
  const [convert, setConvert] = useState(null); // null | { account, statement } being turned into installments
  // Each bank credit's debt, next payment and installments
  const credit = useCreditStatus(accounts);

  // This month's everyday spending per account (only with the expenses feature)
  const thisMonth = useMemo(() => shamsiMonthOf(todayIso()), []);
  const { expenses: monthExpenses } = useDailyExpenses(thisMonth, { enabled: hasExpenses });
  const spentBy = useMemo(
    () => new Map(summarizeByAccount(monthExpenses).map((s) => [s.accountId, s])),
    [monthExpenses]
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

  // A statement's installments are kept on the credit account, as the bank set them
  const saveConversions = (account, conversions) => saveAccount({ credit: { ...account.credit, conversions } }, account);
  const handleUndoConversion = async (account, plan) => {
    const ok = await confirm({
      title: 'حذف قسط‌بندی',
      message: 'این قسط‌بندی حذف شود؟ مانده‌ی آن دوباره بدهی همان صورت‌حساب می‌شود و پرداخت‌ها دوباره به آن حساب می‌شوند.',
      confirmLabel: 'حذف',
      danger: true,
    });
    if (ok) saveConversions(account, (account.credit.conversions || []).filter((c) => c.id !== plan.id)).catch(() => {});
  };

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
                      {account.currency === 'USD' && ' · دلاری'}
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
                    account={account}
                    status={credit.statusById.get(account.id)}
                    costsPaid={credit.costsById.get(account.id) || 0}
                    hideValues={hideValues}
                    readOnly={readOnly}
                    onPay={() => setPayCredit(account)}
                    onConvert={(statement) => setConvert({ account, statement })}
                    onUndoConversion={(plan) => handleUndoConversion(account, plan)}
                  />
                )}
                {hasExpenses && (
                  <div className="account-card-stat">
                    <span>هزینه روزمره این ماه</span>
                    <strong>{spent ? `${hideValues ? '****' : formatAmount(spent.totalToman)} تومان` : '—'}</strong>
                  </div>
                )}
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

      {convert && (
        <CreditConversionForm
          account={convert.account}
          statement={convert.statement}
          onSave={(conversion) => saveConversions(convert.account, [...(convert.account.credit.conversions || []), conversion])}
          onClose={() => setConvert(null)}
        />
      )}

      {payCredit && (
        <CreditPaymentForm
          account={payCredit}
          status={credit.statusById.get(payCredit.id)}
          payers={accounts.filter((a) => !a.archived && !isCreditAccount(a) && a.currency !== 'USD')}
          saveTransfer={(input) => saveTransfer(input)}
          onPaid={credit.reload}
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
