/**
 * CreditPaymentForm.jsx — Paying a bank credit back from another of the user's accounts, by hand
 *
 * Two uses:
 *  - «تسویه بدهی»: the debt settled and what was actually paid for it. What was paid is a
 *    transfer into the credit (never an expense — the purchases already were), the part beyond
 *    the debt settled its `fee`: the settlement fee, shown as it is typed (amount and percent) and
 *    recorded as an expense of its own («کارمزد و سود اعتبار», with the credit's id), paid from
 *    the same account.
 *  - an installment (`installment`): its amount, paid into the credit; the page then marks it paid.
 * A settlement may start from bank messages (`draft`, smsDrafts.js smsCreditSettlementDraft): the
 * amounts, the payer, the day and the messages' keys, kept on the transfer so neither message
 * waits again. Opened without a credit (`credits` instead of `account`), the user picks it.
 * (utils/creditAccount.js)
 *
 * Laid out as an entry form (shared/form/): the amount first (the debt settled, or the
 * installment), what was actually paid under it for a settlement, «پرداخت از» as a picker row and
 * the day («امروز»/«دیروز»/«روز دیگر»).
 */

import { intlLocale, t } from '../../../utils/i18n.js';
import React, { useState } from 'react';
import { CreditCard } from 'lucide-react';
import { AlertBanner, Modal, NumericInput } from '../../../shared/ui/index.js';
import { AmountField, DateField, EntryFormActions, PickerRow } from '../../../shared/form/index.js';
import { getTodayShamsi, shamsiToGregorian, gregorianToShamsi, formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { CREDIT_COST_CATEGORY, settlementOf } from '../../../utils/creditAccount.js';
import { getExpenseGroups, ensureDailyGroup, saveExpense } from '../../../shared/vault/vaultExpenses.js';
import { formatAmount } from '../../expenses/utils/format.js';
import { accountLabel } from '../constants/accountDisplay.js';

const digitsOnly = (v) => Number(String(v || '').replace(/[^\d]/g, '')) || 0;
const faPct = (v) => Number(v).toLocaleString(intlLocale(), { maximumFractionDigits: 2 });

/**
 * @param {{ account?: object|null, credits?: object[], debt?: number, installment?: { n: number, count: number, dueDate: string, amount: number }|null,
 *   draft?: { creditId?: string, fromAccountId?: string, settled?: number, paid?: number, date?: string, smsKeys?: string[] }|null,
 *   payers: object[], saveTransfer: (input: object) => Promise<object>, onPaid?: (transfer: object, date: string) => unknown,
 *   onClose: () => void }} props - payers: the accounts it can be paid from; debt: what is owed
 *   outside the installments (the settlement's starting amount); credits: the credits to pick from
 *   when no `account` is given
 */
export default function CreditPaymentForm({ account: fixedAccount = null, credits = [], debt = 0, installment = null, draft = null, payers = [], saveTransfer, onPaid, onClose }) {
  const start = installment ? installment.amount : debt;
  const [creditId, setCreditId] = useState(fixedAccount?.id || draft?.creditId || (credits.length === 1 ? credits[0].id : ''));
  const account = fixedAccount || credits.find((a) => a.id === creditId) || null;
  const [fromAccountId, setFrom] = useState(draft?.fromAccountId || (payers.length === 1 ? payers[0].id : ''));
  const [settled, setSettled] = useState(String(draft?.settled || start || ''));
  const [paid, setPaid] = useState(String(draft?.paid || start || ''));
  const [dateShamsi, setDateShamsi] = useState(() => (draft?.date ? gregorianToShamsi(`${draft.date}T00:00:00`) : getTodayShamsi()));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const dateIso = shamsiToGregorian(dateShamsi);
  const settledNum = digitsOnly(settled);
  // An installment is paid as it is; a settlement may cost a fee
  const result = installment ? { fee: 0, pct: 0 } : settlementOf(settledNum, digitsOnly(paid));
  const isValid = Boolean(account) && Boolean(fromAccountId) && settledNum > 0 && !result.error && Boolean(dateIso) && !submitting;
  const what = installment ? t('قسط {n} از {count}', { n: faPct(installment.n), count: faPct(installment.count) }) : t('تسویه‌ی بدهی');

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!isValid) return;
    setSubmitting(true);
    setError('');
    try {
      const transfer = await saveTransfer({
        fromAccountId,
        toAccountId: account.id,
        // What left the account; the fee is the part of it that didn't pay the debt (transferDocument.js)
        amount: settledNum + result.fee,
        fee: result.fee,
        date: dateIso,
        notes: t('{what} — {name}', { what, name: account.name }),
        ...(draft?.smsKeys?.length ? { smsKeys: draft.smsKeys } : {}),
      });
      if (result.fee > 0) {
        const group = await ensureDailyGroup((await getExpenseGroups()).groups || []);
        await saveExpense({
          groupId: group.id,
          title: t('کارمزد تسویه {name}', { name: account.name }),
          amount: result.fee,
          currency: 'IRT',
          date: dateIso,
          category: CREDIT_COST_CATEGORY,
          accountId: fromAccountId,
          creditAccountId: account.id,
          notes: t('{pct} از {amount} تومان', { pct: `${faPct(result.pct)}${t('٪')}`, amount: formatAmount(settledNum) }),
        });
      }
      await onPaid?.(transfer, dateIso);
      onClose();
    } catch (err) {
      setError(err.message || t('ثبت پرداخت ممکن نشد.'));
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={installment ? t('پرداخت {what}', { what }) : account ? t('تسویه بدهی «{name}»', { name: account.name }) : t('تسویه بدهی اعتبار')}
      subtitle={installment
        ? t('سررسید {date}', { date: formatShamsiDisplay(`${installment.dueDate}T00:00:00`) })
        : t('بدهی تسویه‌شده انتقال به همین حساب است و دوباره هزینه حساب نمی‌شود؛ مابه‌التفاوت، کارمزد تسویه است')}
      icon={<CreditCard size={18} />}
      maxWidth="520px"
      onSubmit={handleSubmit}
      footer={<EntryFormActions submitLabel={t('ثبت پرداخت')} valid={isValid} submitting={submitting} onCancel={onClose} />}
    >
      <div className="entry-form-body">
        {error && <AlertBanner type="error" message={error} />}

        {!fixedAccount && (
          <PickerRow
            label={t('اعتبار')}
            value={creditId}
            options={credits.map((a) => ({ value: a.id, label: accountLabel(a) }))}
            onChange={setCreditId}
          />
        )}

        <AmountField
          id="credit-pay-settled"
          label={installment ? t('مبلغ قسط') : t('بدهی تسویه‌شده')}
          value={settled}
          onValueChange={setSettled}
          currency="IRT"
        />

        {!installment && (
          <div className="ui-input-group">
            <label htmlFor="credit-pay-paid" className="ui-input-label">{t('مبلغ پرداختی (تومان) *')}</label>
            <div className="ui-input-wrapper">
              <NumericInput id="credit-pay-paid" value={paid} onValueChange={setPaid} className="ui-input-control" required />
            </div>
            <p className="expense-form-hint">
              {result.error || (result.fee > 0
                ? t('کارمزد تسویه: {fee} تومان ({pct}) — جدا به‌عنوان هزینه ثبت می‌شود', { fee: formatAmount(result.fee), pct: `${faPct(result.pct)}${t('٪')}` })
                : t('بدون کارمزد'))}
            </p>
          </div>
        )}

        {payers.length === 0 ? (
          <AlertBanner type="info" message={t('برای پرداخت، حسابی که از آن پرداخت می‌کنید را در صفحه‌ی «حساب‌ها» اضافه کنید.')} />
        ) : (
          <PickerRow
            label={t('پرداخت از')}
            value={fromAccountId}
            options={payers.map((a) => ({ value: a.id, label: accountLabel(a) }))}
            onChange={setFrom}
          />
        )}

        <DateField label={t('تاریخ پرداخت *')} value={dateShamsi} onChange={setDateShamsi} />
      </div>
    </Modal>
  );
}
