/**
 * CreditConversionForm.jsx — «تبدیل به قسط»: the user turns an amount of a bank credit's debt into
 * the installments the bank set, by hand
 *
 * Every installment is a row of its own — its day and its amount, as the bank set them. To save
 * typing, «ساخت ردیف‌ها» fills the rows (a count, the first day, one amount: monthly on that
 * Shamsi day), which can then be changed one by one, added to or removed. What the installments
 * add up to beyond the amount is the installments' fee, shown as it is typed (amount and percent)
 * and recorded with the plan (utils/creditAccount.js).
 *
 * Laid out as an entry form (shared/form/): the amount first and large, the day it was turned
 * into installments («امروز»/«دیروز»/«روز دیگر»), then the quick fill and the rows (their days
 * are in the future: the full Shamsi picker).
 */

import { intlLocale, t } from '../../../utils/i18n.js';
import React, { useState } from 'react';
import { CalendarClock, Plus, X } from 'lucide-react';
import { AlertBanner, Button, Modal, NumericInput } from '../../../shared/ui/index.js';
import { AmountField, DateField, EntryFormActions } from '../../../shared/form/index.js';
import ShamsiDatePicker, { gregorianToShamsi, shamsiToGregorian } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { conversionCost, monthlyDates, validateConversion } from '../../../utils/creditAccount.js';
import { todayIso } from '../../../shared/utils/dates.js';
import { formatAmount } from '../../expenses/utils/format.js';

const digitsOnly = (v) => Number(String(v || '').replace(/[^\d]/g, '')) || 0;
const faPct = (v) => Number(v).toLocaleString(intlLocale(), { maximumFractionDigits: 2 });
const shamsiOf = (iso) => gregorianToShamsi(`${iso}T00:00:00`);
let rowSeq = 0;
const row = (dueShamsi = '', amount = '') => ({ key: ++rowSeq, dueShamsi, amount });

/**
 * @param {{ account: object, debt: number, onSave: (conversion: object, cost: number) => Promise<unknown>, onClose: () => void }} props
 *   debt: what is owed outside the installments (the amount's starting value)
 */
export default function CreditConversionForm({ account, debt, onSave, onClose }) {
  const [principal, setPrincipal] = useState(debt > 0 ? String(debt) : '');
  const [dateShamsi, setDateShamsi] = useState(() => shamsiOf(todayIso()));
  // «ساخت ردیف‌ها»: the count, the first installment's day and one amount
  const [fillCount, setFillCount] = useState('');
  const [fillFirst, setFillFirst] = useState('');
  const [fillAmount, setFillAmount] = useState('');
  const [rows, setRows] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fillRows = () => {
    const first = shamsiToGregorian(fillFirst);
    const count = digitsOnly(fillCount);
    if (!first || !(count > 0)) return;
    setRows(monthlyDates(first, Math.min(count, 120)).map((iso) => row(shamsiOf(iso), fillAmount)));
  };
  const setRow = (key, patch) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const conversion = {
    id: `cnv_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    date: shamsiToGregorian(dateShamsi) || '',
    principal: digitsOnly(principal),
    installments: rows.map((r) => ({ dueDate: shamsiToGregorian(r.dueShamsi) || '', amount: digitsOnly(r.amount) })),
  };
  const checked = validateConversion(conversion);
  const { total, cost, pct } = conversionCost(conversion);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (checked.error || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await onSave(checked.value, cost);
      onClose();
    } catch (err) {
      setError(err.message || t('ثبت قسط‌بندی ممکن نشد.'));
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('تبدیل به قسط')}
      subtitle={t('«{name}» — اقساط را همان‌طور که بانک تعیین کرده وارد کنید', { name: account.name })}
      icon={<CalendarClock size={18} />}
      maxWidth="560px"
      onSubmit={handleSubmit}
      footer={<EntryFormActions submitLabel={t('تبدیل به قسط')} valid={!checked.error} submitting={submitting} onCancel={onClose} />}
    >
      <div className="entry-form-body">
        {error && <AlertBanner type="error" message={error} />}

        <AmountField id="conversion-principal" label={t('مبلغی که قسط‌بندی می‌شود')} value={principal} onValueChange={setPrincipal} currency="IRT">
          <p className="expense-form-hint">{t('بدهی خارج از اقساط: {amount} تومان', { amount: formatAmount(debt) })}</p>
        </AmountField>

        <DateField label={t('تاریخ قسط‌بندی *')} value={dateShamsi} onChange={setDateShamsi} />

        <fieldset className="credit-fill">
          <legend>{t('ساخت سریع ردیف‌ها (اختیاری)')}</legend>
          <div className="credit-terms-row">
            <div className="ui-input-group">
              <label htmlFor="conversion-fill-count" className="ui-input-label">{t('تعداد اقساط')}</label>
              <div className="ui-input-wrapper">
                <NumericInput id="conversion-fill-count" value={fillCount} onValueChange={setFillCount} className="ui-input-control" />
              </div>
            </div>
            <div className="ui-input-group">
              <label htmlFor="conversion-fill-amount" className="ui-input-label">{t('مبلغ هر قسط')}</label>
              <div className="ui-input-wrapper">
                <NumericInput id="conversion-fill-amount" value={fillAmount} onValueChange={setFillAmount} className="ui-input-control" />
              </div>
            </div>
          </div>
          <ShamsiDatePicker label={t('سررسید اولین قسط')} value={fillFirst} onChange={setFillFirst} />
          <Button type="button" size="sm" variant="secondary" onClick={fillRows} disabled={!fillFirst || !(digitsOnly(fillCount) > 0)}>
            {t('ساخت ردیف‌ها (ماهانه)')}
          </Button>
        </fieldset>

        <div className="credit-rows">
          <span className="ui-input-label">{t('اقساط *')}</span>
          {rows.map((r, index) => (
            <div key={r.key} className="credit-row">
              <ShamsiDatePicker label={t('قسط {n}', { n: faPct(index + 1) })} value={r.dueShamsi} onChange={(v) => setRow(r.key, { dueShamsi: v })} />
              <div className="ui-input-group">
                <label htmlFor={`conversion-row-${r.key}`} className="ui-input-label">{t('مبلغ')}</label>
                <div className="ui-input-wrapper">
                  <NumericInput id={`conversion-row-${r.key}`} value={r.amount} onValueChange={(v) => setRow(r.key, { amount: v })} className="ui-input-control" />
                </div>
              </div>
              <button type="button" className="btn-table-action delete" title={t('حذف قسط')} onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}>
                <X size={13} />
              </button>
            </div>
          ))}
          <Button type="button" size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setRows((list) => [...list, row()])}>
            {t('افزودن قسط')}
          </Button>
        </div>

        <p className="expense-form-hint">
          {rows.length === 0
            ? t('اقساط را وارد کنید (یا با «ساخت ردیف‌ها» بسازید و بعد تغییر دهید).')
            : checked.error || t('{n} قسط، جمع {total} تومان؛ کارمزد قسط‌بندی {cost} تومان ({pct})', { n: faPct(rows.length), total: formatAmount(total), cost: formatAmount(cost), pct: `${faPct(pct)}${t('٪')}` })}
        </p>
      </div>
    </Modal>
  );
}
