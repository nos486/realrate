/**
 * SubscriptionForm.jsx — Modal to add or edit a subscription: what it is, what it costs (tomans
 * or dollars) and how often, when it started (its first payment), whether it renews by itself or
 * by hand (then: until when it runs), an optional end day, the account it is paid from (only the
 * accounts holding its currency), and its reminders (utils/subscriptionDocument.js). Its payments
 * are recorded in the expenses when it is saved (useSubscriptions: a new one's first payment).
 *
 * Laid out as an entry form (shared/form/, like the expense and income forms): the cost per
 * period first (its currency beside it, in words under it), the name, the category as icon
 * tiles, the cycle and the renewal as segmented choices, the start (and, renewed by hand, until
 * when — both may be ahead, so the full Shamsi picker), the account as a picker row, and the
 * rarely needed — the end day, the site, the note — folded under «جزئیات بیشتر».
 * Mounted only while open, so its state starts from props.
 */

import React, { useState } from 'react';
import { CalendarSync } from 'lucide-react';
import { t } from '../../../utils/i18n.js';
import { AlertBanner, FilterPills, Input, Modal } from '../../../shared/ui/index.js';
import { AmountField, CategoryGrid, EntryFormActions, MoreDetails, PickerRow } from '../../../shared/form/index.js';
import ShamsiDatePicker, { getTodayShamsi, gregorianToShamsi, shamsiToGregorian } from '../../portfolio/components/ShamsiDatePicker.jsx';
import {
  SUBSCRIPTION_CATEGORIES, SUBSCRIPTION_CYCLES, SUBSCRIPTION_LIMITS, renewalAt,
} from '../../../utils/subscriptionDocument.js';
import { accountLabel } from '../../accounts/constants/accountDisplay.js';
import { accountsForCurrency } from '../../../utils/accountDocument.js';
import { normalizeCurrency } from '../../../utils/currencies.js';
import { subscriptionIcon } from '../constants/subscriptionDisplay.js';

const CATEGORY_OPTIONS = SUBSCRIPTION_CATEGORIES.map(({ value, label }) => ({ value, label: t(label), Icon: subscriptionIcon(value) }));
const CYCLE_OPTIONS = SUBSCRIPTION_CYCLES.map(({ months, label }) => ({ value: String(months), label: t(label) }));
const RENEW_OPTIONS = [{ value: 'auto', label: t('خودکار تمدید می‌شود') }, { value: 'manual', label: t('دستی تمدید می‌کنم') }];
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
  const [currency, setCurrency] = useState(normalizeCurrency(s?.currency));
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
      setError(err.message || t('ذخیره‌ی اشتراک ممکن نشد.'));
    }
  };

  const detailsFilled = [
    ...(endShamsi ? [t('پایان')] : []),
    ...(url.trim() ? [t('سایت')] : []),
    ...(notes.trim() ? [t('یادداشت')] : []),
  ];

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={s ? t('ویرایش اشتراک') : t('اشتراک جدید')}
      subtitle={t('هزینه، دوره‌ی تمدید و یادآوری قبل از تمدید')}
      icon={<CalendarSync size={18} />}
      maxWidth="560px"
      onSubmit={handleSubmit}
      footer={(
        <EntryFormActions
          submitLabel={s ? t('ذخیره تغییرات') : t('افزودن اشتراک')}
          valid={isValid}
          submitting={submitting}
          onCancel={onClose}
        />
      )}
    >
      <div className="entry-form-body">
        {error && <AlertBanner type="error" message={error} />}

        <AmountField
          id="sub-amount"
          label={t('هزینه‌ی هر دوره')}
          value={amount}
          onValueChange={setAmount}
          currency={currency}
          onCurrencyChange={setCurrency}
          autoFocus={!s}
        />

        <Input id="sub-name" label={t('نام اشتراک *')} placeholder={t('مثلاً: نتفلیکس، ChatGPT، فیلیمو، اینترنت خانه')} value={name}
          onChange={(e) => setName(e.target.value)} maxLength={SUBSCRIPTION_LIMITS.nameLength} required />

        <CategoryGrid kind="subscription" label={t('دسته')} options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />

        <div className="ui-input-group">
          <span className="ui-input-label">{t('دوره‌ی تمدید')}</span>
          <FilterPills variant="segmented" size="sm" options={CYCLE_OPTIONS} activeValue={cycle} onChange={setCycle} />
        </div>

        <div className="entry-form-section">
          <ShamsiDatePicker label={t('شروع (اولین پرداخت) *')} value={startShamsi} onChange={setStartShamsi} />
          <p className="expense-form-hint">{t('تمدیدها هر دوره در همین روزِ ماه هستند. برای دوره‌ی آزمایشی، اولین پرداخت را روز پایان آزمایش بگذارید.')}</p>
        </div>

        <div className="entry-form-section">
          <div className="ui-input-group">
            <span className="ui-input-label">{t('تمدید')}</span>
            <FilterPills variant="segmented" size="sm" options={RENEW_OPTIONS} activeValue={renewMode} onChange={setRenewMode} />
          </div>
          {manual && (
            <>
              <ShamsiDatePicker label={t('اعتبار تا (تمدید بعدی)')} value={renewShamsi || shamsiOf(defaultRenewOn)} onChange={setRenewShamsi} />
              <p className="expense-form-hint">{t('با ثبت پرداخت تمدید، این تاریخ یک دوره جلو می‌رود؛ اگر بگذرد و تمدید نکنید، اشتراک «تمام شده» نشان داده می‌شود.')}</p>
            </>
          )}
        </div>

        {payAccounts.length > 0 && (
          <PickerRow
            label={t('پرداخت از')}
            value={effectiveAccountId}
            options={[{ value: '', label: t('نامشخص') }, ...payAccounts.map((a) => ({ value: a.id, label: accountLabel(a) }))]}
            onChange={setAccountId}
            placeholder={t('نامشخص')}
          />
        )}

        <MoreDetails filled={detailsFilled}>
          <div className="entry-form-section">
            <ShamsiDatePicker label={t('پایان')} value={endShamsi} onChange={setEndShamsi} />
            <p className="expense-form-hint">{t('اگر تا تاریخ مشخصی است یا لغوش کرده‌اید و تا پایان دوره فعال است؛ بعد از آن تمدیدی حساب نمی‌شود.')}</p>
          </div>
          <Input id="sub-url" label={t('سایت')} placeholder="https://" value={url} dir="ltr" onChange={(e) => setUrl(e.target.value)} maxLength={SUBSCRIPTION_LIMITS.urlLength} />
          <Input id="sub-notes" as="textarea" label={t('یادداشت')} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={SUBSCRIPTION_LIMITS.notesLength} rows={2} />
        </MoreDetails>

        {!s && (
          <p className="expense-form-hint">{t('پرداخت این اشتراک (و هر تمدید خودکارش، سر موعد) در «هزینه‌ها» ثبت می‌شود، با همین مبلغ، ارز و حساب.')}</p>
        )}

        <label className="sub-form-check">
          <input type="checkbox" checked={!muted} onChange={(e) => setMuted(!e.target.checked)} />
          <span>{t('یادآوری قبل از تمدید (اعلان و ایمیل، طبق تنظیمات یادآوری)')}</span>
        </label>
      </div>
    </Modal>
  );
}
