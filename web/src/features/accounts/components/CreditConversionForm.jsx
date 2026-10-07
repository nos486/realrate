/**
 * CreditConversionForm.jsx — «تبدیل به اقساط»: the user turns a bank credit's statement into the
 * installments the bank set
 *
 * Never automatic (the bank may move the dates): it starts from the credit's terms
 * (conversionDraft — what is left of the statement, the usual count, each installment from the
 * quoted installment or the rate, the first due a month after the statement's) and every field
 * can be changed to what the bank actually set: the amount, the count, each installment and the
 * first one's day. The rate those amounts imply is shown, like a loan's. Saved on the credit
 * account (`credit.conversions`, utils/creditAccount.js).
 */

import React, { useMemo, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { AlertBanner, Button, Modal, NumericInput } from '../../../shared/ui/index.js';
import ShamsiDatePicker, { gregorianToShamsi, shamsiToGregorian, formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { conversionDraft, installmentRateFromAmounts, validateConversion } from '../../../utils/creditAccount.js';
import { todayIso } from '../../../shared/utils/dates.js';

const digitsOnly = (v) => Number(String(v || '').replace(/[^\d]/g, '')) || 0;
const fa = (n, digits = 0) => Number(n).toLocaleString('fa-IR', { maximumFractionDigits: digits });
const newId = () => `cnv_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

/**
 * @param {{ account: object, statement: object, onSave: (conversion: object) => Promise<unknown>, onClose: () => void }} props
 *   statement: the credit's statement (creditStatus().statements[i])
 */
export default function CreditConversionForm({ account, statement, onSave, onClose }) {
  const draft = useMemo(() => conversionDraft(account, statement, todayIso()), [account, statement]);
  const [principal, setPrincipal] = useState(String(draft.principal));
  const [count, setCount] = useState(String(draft.count));
  const [payment, setPayment] = useState(String(draft.payment));
  const [firstShamsi, setFirstShamsi] = useState(() => gregorianToShamsi(`${draft.firstDueDate}T00:00:00`));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const conversion = {
    id: newId(),
    date: draft.date,
    closeDate: draft.closeDate,
    principal: digitsOnly(principal),
    count: digitsOnly(count),
    payment: digitsOnly(payment),
    firstDueDate: shamsiToGregorian(firstShamsi) || '',
  };
  const checked = validateConversion(conversion);
  const implied = installmentRateFromAmounts(conversion.principal, conversion.payment, conversion.count);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (checked.error || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await onSave(checked.value);
      onClose();
    } catch (err) {
      setError(err.message || 'ثبت قسط‌بندی ممکن نشد.');
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="تبدیل به اقساط"
      subtitle={`صورت‌حساب ${formatShamsiDisplay(`${statement.closeDate}T00:00:00`)} «${account.name}» — همان‌طور که بانک قسط‌بندی کرده`}
      icon={<CalendarClock size={18} />}
      maxWidth="520px"
      onSubmit={handleSubmit}
      footer={(
        <div className="modal-actions">
          <Button variant="secondary" block disabled={submitting} onClick={onClose}>انصراف</Button>
          <Button type="submit" block loading={submitting} disabled={Boolean(checked.error)}>تبدیل به اقساط</Button>
        </div>
      )}
    >
      <div className="income-form-body">
        {error && <AlertBanner type="error" message={error} />}

        <div className="ui-input-group">
          <label htmlFor="conversion-principal" className="ui-input-label">مبلغ قسط‌بندی (تومان) *</label>
          <div className="ui-input-wrapper">
            <NumericInput id="conversion-principal" value={principal} onValueChange={setPrincipal} className="ui-input-control" required />
          </div>
          <p className="expense-form-hint">مانده‌ی این صورت‌حساب: {fa(statement.remaining)} تومان</p>
        </div>

        <div className="credit-terms-row">
          <div className="ui-input-group">
            <label htmlFor="conversion-count" className="ui-input-label">تعداد اقساط *</label>
            <div className="ui-input-wrapper">
              <NumericInput id="conversion-count" value={count} onValueChange={setCount} className="ui-input-control" required />
            </div>
          </div>
          <div className="ui-input-group">
            <label htmlFor="conversion-payment" className="ui-input-label">مبلغ هر قسط (تومان) *</label>
            <div className="ui-input-wrapper">
              <NumericInput id="conversion-payment" value={payment} onValueChange={setPayment} className="ui-input-control" required />
            </div>
          </div>
        </div>

        <ShamsiDatePicker label="سررسید اولین قسط *" value={firstShamsi} onChange={setFirstShamsi} />

        <p className="expense-form-hint">
          {checked.error
            ? checked.error
            : `جمع اقساط ${fa(conversion.payment * conversion.count)} تومان؛ سود ${fa(conversion.payment * conversion.count - conversion.principal)} تومان${implied.ratePct > 0 ? ` (حدود ${fa(implied.ratePct, 2)}٪ سالانه)` : ''}. اقساط بعدی هر ماه در همان روز.`}
        </p>
      </div>
    </Modal>
  );
}
