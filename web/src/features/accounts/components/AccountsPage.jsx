/**
 * AccountsPage.jsx — The user's money accounts: bank accounts, cash, e-wallets (beta:
 * `bank_accounts`)
 *
 * Each account is a card (bank logo, name, card's last digits) with this month's everyday
 * spending from it; expenses pick one of them as the account they were paid from. Accounts are
 * end-to-end encrypted vault records.
 */

import React, { useMemo, useState } from 'react';
import { WalletCards, Plus, Pencil, Trash2, Archive, ArchiveRestore } from 'lucide-react';
import { AlertBanner, Button, EmptyState, FeaturePageHeader } from '../../../shared/ui/index.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { SkeletonCards } from '../../../shared/ui/Skeleton.jsx';
import VaultUnlockCard from '../../../shared/vault/VaultUnlockCard.jsx';
import { BankLogo, resolveBank, useCustomBanks } from '../../../shared/banks/index.js';
import { useFeature } from '../../../shared/features/useFeature.js';
import { usePrivacyMode } from '../../../hooks/usePrivacyMode.js';
import { todayIso } from '../../../shared/utils/dates.js';
import { accountTypeLabel } from '../../../utils/accountDocument.js';
import { summarizeByAccount, shamsiMonthOf } from '../../../utils/expenseDocument.js';
import { useDemo } from '../../demo/index.js';
import { useDailyExpenses } from '../../expenses/hooks/useDailyExpenses.js';
import { formatAmount } from '../../expenses/utils/format.js';
import { useAccounts } from '../hooks/useAccounts.js';
import { getAccountTypeIcon } from '../constants/accountDisplay.js';
import AccountForm from './AccountForm.jsx';

const HEADER = {
  icon: <WalletCards size={24} />,
  title: 'حساب‌ها',
  subtitle: 'حساب‌های بانکی، پول نقد و کیف پول؛ منبع هزینه‌های شما',
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

  // This month's everyday spending per account (only with the expenses feature)
  const thisMonth = useMemo(() => shamsiMonthOf(todayIso()), []);
  const { expenses: monthExpenses } = useDailyExpenses(thisMonth, { enabled: hasExpenses });
  const spentBy = useMemo(
    () => new Map(summarizeByAccount(monthExpenses).map((s) => [s.accountId, s])),
    [monthExpenses]
  );

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

  const toggleArchive = (account) => saveAccount({ archived: !account.archived }, account).catch(() => {});

  return (
    <div className="incomes-page-container accounts-page">
      <FeaturePageHeader
        {...HEADER}
        actions={
          <Button
            icon={<Plus size={16} />}
            onClick={() => setForm({ account: null })}
            disabled={readOnly}
            title={readOnly ? 'در نسخه دمو غیرفعال است' : undefined}
          >
            حساب جدید
          </Button>
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
            const bank = account.type === 'bank' && account.bankId
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
                {hasExpenses && (
                  <div className="account-card-stat">
                    <span>هزینه روزمره این ماه</span>
                    <strong>{spent ? `${hideValues ? '****' : formatAmount(spent.totalToman)} تومان` : '—'}</strong>
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
