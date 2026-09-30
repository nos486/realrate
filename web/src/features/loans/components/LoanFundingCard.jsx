/**
 * LoanFundingCard.jsx — «مصرف وام»: how much of a loan's principal was spent, what is left, and on
 * what — the expenses recorded with «تأمین از» this loan (utils/loanFunding.js). Only the expenses
 * dated from the loan's start are downloaded (the vault filters on the plaintext date). Shown with
 * the expenses feature.
 */

import React, { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { useFeature } from '../../../shared/features/useFeature.js';
import { useVault } from '../../../shared/vault/useVault.js';
import { getExpenses } from '../../../shared/vault/vaultExpenses.js';
import { summarizeLoanFunding } from '../../../utils/loanFunding.js';
import { getExpenseCategory } from '../../expenses/constants/expenseCategories.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';

const LIST_LIMIT = 5;
const formatNum = (v) => Math.round(Number(v) || 0).toLocaleString('fa-IR');

export default function LoanFundingCard({ loan, hideValues = false }) {
  const enabled = useFeature('expenses');
  const { status: vaultStatus, epoch: vaultEpoch } = useVault();
  const [expenses, setExpenses] = useState(null);
  const from = String(loan?.startDate || '').slice(0, 10);

  useEffect(() => {
    if (!enabled || vaultStatus === 'locked' || !loan?.id) return undefined;
    let cancelled = false;
    getExpenses(from ? { from } : {})
      .then((res) => !cancelled && setExpenses(res.expenses))
      .catch((err) => {
        console.warn('Loan usage could not be loaded:', err);
        if (!cancelled) setExpenses([]);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, vaultStatus, vaultEpoch, loan?.id, from]);

  if (!enabled || !expenses) return null;
  const usage = summarizeLoanFunding(loan, expenses);
  const money = (v) => (hideValues ? '****' : formatNum(v));
  const pct = usage.principal > 0 ? Math.min(100, Math.round((usage.spent / usage.principal) * 100)) : 0;

  return (
    <section className="loan-funding-card" aria-label="مصرف وام">
      <header className="loan-funding-head">
        <span className="loan-funding-title">
          <Wallet size={15} />
          مصرف وام
        </span>
        <span className="loan-funding-pct">{formatNum(pct)}٪ خرج شده</span>
      </header>

      <div className="loan-progress-track">
        <div className={`loan-progress-bar ${usage.overspent > 0 ? 'is-over' : ''}`} style={{ width: `${pct}%` }} />
      </div>

      <dl className="loan-funding-stats">
        <div>
          <dt>خرج شده</dt>
          <dd>{money(usage.spent)} تومان</dd>
        </div>
        <div>
          <dt>{usage.overspent > 0 ? 'بیش از اصل وام' : 'مانده‌ی خرج‌نشده'}</dt>
          <dd className={usage.overspent > 0 ? 'is-over' : ''}>{money(usage.overspent || usage.remaining)} تومان</dd>
        </div>
      </dl>

      {usage.count === 0 ? (
        <p className="loan-funding-empty">
          هنوز هزینه‌ای از این وام ثبت نشده. هنگام ثبت هزینه، «تأمین از» را روی این وام بگذارید تا اینجا دیده شود.
        </p>
      ) : (
        <ul className="loan-funding-list">
          {usage.expenses.slice(0, LIST_LIMIT).map((e) => {
            const category = e.category ? getExpenseCategory(e.category) : null;
            return (
              <li key={e.id}>
                <span className="loan-funding-item-title">
                  {e.title}
                  {category && e.title !== category.label && <small>{category.label}</small>}
                </span>
                <span className="loan-funding-item-date">{formatShamsiDisplay(`${e.date}T00:00:00`)}</span>
                <strong>
                  {money(e.amount)} {e.currency === 'USD' ? 'دلار' : 'تومان'}
                </strong>
              </li>
            );
          })}
          {usage.count > LIST_LIMIT && (
            <li className="loan-funding-more">و {formatNum(usage.count - LIST_LIMIT)} هزینه‌ی دیگر</li>
          )}
        </ul>
      )}
    </section>
  );
}
