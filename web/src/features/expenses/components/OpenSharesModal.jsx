/**
 * OpenSharesModal.jsx — «طلب‌های دنگ»: every shared expense with something still owed back
 *
 * From every section and month (vaultExpenses.getOpenSharedExpenses). Picking one opens its
 * «دریافتی‌ها» (ReimbursementsModal), or, with `onPick`, hands it over (a bank deposit that is a
 * share coming back, sms-inbox/ShareDepositSheet.jsx). Saves go straight to the vault (the
 * expense keeps its own section); `onChanged` lets the opener reload.
 */

import { intlLocale, t } from '../../../utils/i18n.js';
import React, { useState } from 'react';
import { useUsdAt } from '../../market/dailyHistory.js';
import { HandCoins, ChevronLeft } from 'lucide-react';
import { AlertBanner, EmptyState, Modal } from '../../../shared/ui/index.js';
import { SkeletonRows } from '../../../shared/ui/Skeleton.jsx';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { expenseReceivable, summarizeReceivables } from '../../../utils/expenseDocument.js';
import * as api from '../../../shared/vault/vaultExpenses.js';
import { formatAmount } from '../utils/format.js';
import { currencyLabel } from '../../../utils/currencies.js';
import { useFxRates } from '../../market/useFxRates.js';
import ReimbursementsModal from './ReimbursementsModal.jsx';
import { useOpenShares } from '../hooks/useOpenShares.js';

export function OpenSharesList({ expenses, onPick, amountLimit = null, hideValues = false }) {
  return (
    <ul className="loan-deposit-list expense-open-shares">
      {expenses.map((e) => {
        const { remaining } = expenseReceivable(e);
        const unit = currencyLabel(e.currency);
        const tooMuch = amountLimit !== null && e.currency === 'IRT' && amountLimit > remaining + 1e-6;
        return (
          <li key={e.id}>
            <button type="button" className="loan-deposit-option" onClick={() => onPick(e)} disabled={tooMuch}>
              <HandCoins size={16} />
              <span>
                <strong>{e.title}</strong>
                <small>
                  {formatShamsiDisplay(`${e.date}T00:00:00`)} · {t('مانده‌ی طلب {amount} {unit}', { amount: hideValues ? '****' : formatAmount(remaining, e.currency), unit })}
                  {tooMuch && ` ${t('— کمتر از این واریز')}`}
                </small>
              </span>
              <ChevronLeft size={16} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default function OpenSharesModal({ accounts = [], usdToman = 0, hideValues = false, readOnly = false, onChanged, onClose }) {
  const { loading, error, expenses, reload } = useOpenShares();
  const [selected, setSelected] = useState(null);
  const usdAt = useUsdAt((expenses || []).some((e) => e.currency === 'USD'));
  const fx = useFxRates(expenses || []);
  const summary = summarizeReceivables(expenses, { usdToman, usdAt, ...fx });

  const save = async (input, existing) => {
    const { expense } = await api.saveExpense(input, existing);
    onChanged?.();
    return expense;
  };

  return (
    <>
      <Modal
        isOpen={!selected}
        onClose={onClose}
        title={t('طلب‌های دنگ')}
        subtitle={
          expenses.length
            ? t('{n} هزینه · مانده {amount} تومان', { n: summary.openCount.toLocaleString(intlLocale()), amount: hideValues ? '****' : formatAmount(summary.remainingToman) })
            : t('هزینه‌هایی که برای دیگران هم پرداخت کرده‌اید')
        }
        icon={<HandCoins size={18} />}
        maxWidth="480px"
      >
        <div className="loan-deposit-body">
          {error && <AlertBanner type="error" message={error} />}
          {loading && !expenses.length ? (
            <SkeletonRows rows={3} columns={2} label={t('در حال دریافت طلب‌ها')} />
          ) : expenses.length === 0 ? (
            <EmptyState
              icon={<HandCoins size={36} strokeWidth={1.5} />}
              title={t('طلب بازی نیست')}
              description={t('هزینه‌ای که برای دیگران هم پرداخت کردید را با «سهم: با دیگران (دنگ)» ثبت کنید؛ فقط سهم خودتان هزینه حساب می‌شود.')}
            />
          ) : (
            <OpenSharesList expenses={expenses} onPick={setSelected} hideValues={hideValues} />
          )}
        </div>
      </Modal>
      {selected && (
        <ReimbursementsModal
          expense={selected}
          accounts={accounts}
          readOnly={readOnly}
          onSave={save}
          onClose={() => {
            setSelected(null);
            reload();
          }}
        />
      )}
    </>
  );
}
