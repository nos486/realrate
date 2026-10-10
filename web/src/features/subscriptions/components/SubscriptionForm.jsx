/**
 * SubscriptionForm.jsx — Modal to add or edit a subscription: what it is, what it costs (tomans
 * or dollars) and how often, when it started (its first payment), whether it renews by itself or
 * by hand (then: until when it runs), an optional end day, the account it is paid from (only the
 * accounts holding its currency), and its reminders (utils/subscriptionDocument.js). Its payments
 * are recorded in the expenses when it is saved (useSubscriptions: a new one's first payment).
 * Mounted only while open, so its state starts from props.
 */

import React, { useState } from 'react';
import { CalendarSync } from 'lucide-react';
import { AlertBanner, Button, FilterPills, Input, Modal, NumericInput } from '../../../shared/ui/index.js';
import ShamsiDatePicker, { getTodayShamsi, gregorianToShamsi, shamsiToGregorian } from '../../portfolio/components/ShamsiDatePicker.jsx';
import {
  SUBSCRIPTION_CATEGORIES, SUBSCRIPTION_CYCLES, SUBSCRIPTION_LIMITS, renewalAt,
} from '../../../utils/subscriptionDocument.js';
import { accountLabel } from '../../accounts/constants/accountDisplay.js';
import { accountsForCurrency } from '../../../utils/accountDocument.js';
import { subscriptionIcon } from '../constants/subscriptionDisplay.js';

const CATEGORY_OPTIONS = SUBSCRIPTION_CATEGORIES.map(({ value, label }) => {
  const Icon = subscriptionIcon(value);
  return { value, label, icon: <Icon size={14} strokeWidth={2} /> };
});
const CYCLE_OPTIONS = SUBSCRIPTION_CYCLES.map(({ months, label }) => ({ value: String(months), label }));
const CURRENCY_OPTIONS = [{ value: 'IRT', label: 'تومان' }, { value: 'USD', label: 'دلار' }];
const RENEW_OPTIONS = [{ value: 'auto', label: 'خودکار تمدید می‌شود' }, { value: 'manual', label: 'دستی تمدید می‌کنم' }];
const amountOf = (v) => Number(String(v || '').replace(/[^\d.]/g, '')) || 0;
const shamsiOf = (iso) => (iso ? gregorianToShamsi(`${iso}T00:00:00`) : '');

/**
 * @param {{ subscription?: object|null, accounts?: object[], onSubmit: (input: object) => Promise<unknown>,
 *   onClose: () => void, submitting?: boolean }} props
 */
export default function SubscriptionForm({ subscription = null, accounts = [], onSubmit, onClose, submitting = false }) {
  const s = subscription;
  const [name, setName] = useState(s?.name || '');
  const [category, setCategory] = useState(s?.category || 'video');
  const [amount, setAmount] = useState(s ? String(s.amount) : '');
  const [currency, setCurrency] = useState(s?.currency || 'IRT');
  const [cycle, setCycle] = useState(String(s?.cycleMonths || 1));
  const [startShamsi, setStartShamsi] = useState(() => (s ? shamsiOf(s.startDate) : getTodayShamsi()));
  const [renewMode, setRenewMode] = useState(s && !s.autoRenew ? 'manual' : 'auto');
  const [renewShamsi, setRenewShamsi] = useState(() => shamsiOf(s?.renewOn));
  const [endShamsi, setEndShamsi] = useState(() => shamsiOf(s?.endDate));
  const [accountId, setAccountId] = useState(s?.accountId || '');
  const [url, setUrl] = useState(s?.url || '');
  const [notes, setNotes] = useState(s?.notes || '');
  const [muted, setMuted] = useState(Boolean(s?.remindersMuted));
  const [error, setError] = useState('');

  const startIso = shamsiToGregorian(startShamsi);
  const amountNum = amountOf(amount);
  const manual = renewMode === 'manual';
  // Renewed by hand: it runs until the first renewal after the start, unless set
  const defaultRenewOn = startIso ? renewalAt(startIso, Number(cycle), 1) : '';
  const isValid = Boolean(name.trim()) && amountNum > 0 && Boolean(startIso) && !submitting;
  // Paid from an account that holds its currency (the one it already names stays listed)
  const payAccounts = accountsForCurrency(accounts, currency, s?.accountId);
  const effectiveAccountId = payAccounts.some((a) => a.id === accountId) ? accountId : '';

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!isValid) return;
    setError('');
    try {
      await onSubmit({
        name: name.trim(),
        category,
        amount: amountNum,
        currency,
        cycleMonths: Number(cycle),
        startDate: startIso,
        autoRenew: !manual,
        renewOn: manual ? (shamsiToGregorian(renewShamsi) || defaultRenewOn) : '',
        endDate: shamsiToGregorian(endShamsi) || '',
        accountId: effectiveAccountId,
        url: url.trim(),
        notes: notes.trim(),
        remindersMuted: muted,
        status: s?.status || 'active',
      });
      onClose();
    } catch (err) {
      setError(err.message || 'ذخیره‌ی اشتراک ممکن نشد.');
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={s ? 'ویرایش اشتراک' : 'اشتراک جدید'}
      subtitle="هزینه، دوره‌ی تمدید و یادآوری قبل از تمدید"
      icon={<CalendarSync size={18} />}
      maxWidth="560px"
      onSubmit={handleSubmit}
      footer={(
        <div className="modal-actions">
          <Button variant="secondary" block disabled={submitting} onClick={onClose}>انصراف</Button>
          <Button type="submit" block loading={submitting} disabled={!isValid}>{s ? 'ذخیره تغییرات' : 'افزودن اشتراک'}</Button>
        </div>
      )}
    >
      <div className="income-form-body">
        {error && <AlertBanner type="error" message={error} />}

        <Input id="sub-name" label="نام اشتراک *" placeholder="مثلاً: نتفلیکس، ChatGPT، فیلیمو، اینترنت خانه" value={name}
          onChange={(e) => setName(e.target.value)} maxLength={SUBSCRIPTION_LIMITS.nameLength} required />

        <div className="ui-input-group">
          <span className="ui-input-label">دسته</span>
          <FilterPills options={CATEGORY_OPTIONS} activeValue={category} onChange={setCategory} size="sm" className="income-category-picker" />
        </div>

        <div className="sub-form-row">
          <div className="ui-input-group">
            <label htmlFor="sub-amount" className="ui-input-label">هزینه‌ی هر دوره *</label>
            <div className="ui-input-wrapper">
              <NumericInput id="sub-amount" value={amount} onValueChange={setAmount} allowDecimals={currency === 'USD'} className="ui-input-control" required />
            </div>
          </div>
          <div className="ui-input-group">
            <span className="ui-input-label">ارز</span>
            <FilterPills options={CURRENCY_OPTIONS} activeValue={currency} onChange={setCurrency} size="sm" />
          </div>
        </div>

        <div className="ui-input-group">
          <span className="ui-input-label">دوره‌ی تمدید</span>
          <FilterPills options={CYCLE_OPTIONS} activeValue={cycle} onChange={setCycle} size="sm" />
        </div>

        <ShamsiDatePicker label="شروع (اولین پرداخت) *" value={startShamsi} onChange={setStartShamsi} />
        <p className="expense-form-hint">تمدیدها هر دوره در همین روزِ ماه هستند. برای دوره‌ی آزمایشی، اولین پرداخت را روز پایان آزمایش بگذارید.</p>

        <div className="ui-input-group">
          <span className="ui-input-label">تمدید</span>
          <FilterPills options={RENEW_OPTIONS} activeValue={renewMode} onChange={setRenewMode} size="sm" />
        </div>
        {manual && (
          <>
            <ShamsiDatePicker label="اعتبار تا (تمدید بعدی)" value={renewShamsi || shamsiOf(defaultRenewOn)} onChange={setRenewShamsi} />
            <p className="expense-form-hint">با ثبت پرداخت تمدید، این تاریخ یک دوره جلو می‌رود؛ اگر بگذرد و تمدید نکنید، اشتراک «تمام شده» نشان داده می‌شود.</p>
          </>
        )}

        <ShamsiDatePicker label="پایان (اختیاری)" value={endShamsi} onChange={setEndShamsi} />
        <p className="expense-form-hint">اگر تا تاریخ مشخصی است یا لغوش کرده‌اید و تا پایان دوره فعال است؛ بعد از آن تمدیدی حساب نمی‌شود.</p>

        {payAccounts.length > 0 && (
          <div className="ui-input-group">
            <span className="ui-input-label">پرداخت از (اختیاری)</span>
            <FilterPills
              options={[{ value: '', label: 'نامشخص' }, ...payAccounts.map((a) => ({ value: a.id, label: accountLabel(a) }))]}
              activeValue={effectiveAccountId}
              onChange={setAccountId}
              size="sm"
              className="income-category-picker"
            />
          </div>
        )}

        <Input id="sub-url" label="سایت (اختیاری)" placeholder="https://" value={url} dir="ltr" onChange={(e) => setUrl(e.target.value)} maxLength={SUBSCRIPTION_LIMITS.urlLength} />
        <Input id="sub-notes" as="textarea" label="یادداشت (اختیاری)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={SUBSCRIPTION_LIMITS.notesLength} rows={2} />

        {!s && (
          <p className="expense-form-hint">پرداخت این اشتراک (و هر تمدید خودکارش، سر موعد) در «هزینه‌ها» ثبت می‌شود، با همین مبلغ، ارز و حساب.</p>
        )}

        <label className="sub-form-check">
          <input type="checkbox" checked={!muted} onChange={(e) => setMuted(!e.target.checked)} />
          <span>یادآوری قبل از تمدید (اعلان و ایمیل، طبق تنظیمات یادآوری)</span>
        </label>
      </div>
    </Modal>
  );
}
