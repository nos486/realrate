/**
 * GoalContributionForm.jsx — Modal to add to a goal: money set aside by hand (an amount in any
 * currency, a deposit or a withdrawal, its day and a short note) or a share of a portfolio's asset
 * reserved for it (a quantity or a percent of what the portfolio holds). Money becomes an entry
 * of the goal's `deposits`, an asset one of its `allocations` (utils/goalDocument.js); nothing is
 * recorded as an expense, income, sale or purchase — the asset stays in its portfolio.
 * Mounted only while open, so its state starts from props.
 */

import React, { useState } from 'react';
import { PiggyBank } from 'lucide-react';
import { intlLocale, t } from '../../../utils/i18n.js';
import { AlertBanner, FilterPills, Input, Modal } from '../../../shared/ui/index.js';
import { AmountField, DateField, EntryFormActions, PickerRow } from '../../../shared/form/index.js';
import { getTodayShamsi, shamsiToGregorian } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { GOAL_LIMITS } from '../../../utils/goalDocument.js';
import { normalizeCurrency } from '../../../utils/currencies.js';
import { todayIso } from '../../../shared/utils/dates.js';
import { newDepositId } from '../../../shared/vault/vaultGoals.js';
import { formatGoalAmount } from '../constants/goalDisplay.js';

const TYPE_OPTIONS = [{ value: 'in', label: t('واریز') }, { value: 'out', label: t('برداشت') }];
const KIND_OPTIONS = [{ value: 'cash', label: t('پول') }, { value: 'asset', label: t('از پورتفو') }];
const MODE_OPTIONS = [{ value: 'amount', label: t('مقدار') }, { value: 'percent', label: t('درصد') }];
const amountOf = (v) => Number(String(v || '').replace(/[^\d.]/g, '')) || 0;
const fa = (n) => Number(n).toLocaleString(intlLocale(), { maximumFractionDigits: 4 });

/**
 * @param {{ goal: object, assets?: Array<object>, leftOf?: (portfolioId: string, assetId: string) => number,
 *   onSubmit: (change: { deposit?: object, allocation?: object }) => Promise<unknown>, onClose: () => void,
 *   submitting?: boolean }} props
 *   assets: the portfolios' assets (usePortfolioAssets); leftOf: the quantity no goal has taken
 */
export default function GoalContributionForm({ goal, assets = [], leftOf = () => 0, onSubmit, onClose, submitting = false }) {
  const [kind, setKind] = useState('cash');
  const [type, setType] = useState('in');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(normalizeCurrency(goal.currency));
  const [dateShamsi, setDateShamsi] = useState(getTodayShamsi());
  const [note, setNote] = useState('');
  const [assetKey, setAssetKey] = useState('');
  const [mode, setMode] = useState('amount');
  const [share, setShare] = useState('');
  const [error, setError] = useState('');

  const asset = assets.find((a) => a.key === assetKey) || null;
  const left = asset ? leftOf(asset.portfolioId, asset.assetId) : 0;
  const amountNum = amountOf(amount);
  const shareNum = amountOf(share);
  const iso = shamsiToGregorian(dateShamsi);
  const quantity = asset ? (mode === 'percent' ? (asset.amount * shareNum) / 100 : shareNum) : 0;
  const shareValid = shareNum > 0 && (mode === 'amount' || shareNum <= 100);
  // An asset's quantity can't go to goals beyond what the portfolio holds: only the free part can be reserved
  const overAllocated = kind === 'asset' && Boolean(asset) && quantity > left + 1e-9;
  const isValid = !submitting && (kind === 'cash' ? amountNum > 0 && Boolean(iso) : Boolean(asset) && shareValid && !overAllocated);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!isValid) return;
    setError('');
    try {
      if (overAllocated) throw new Error(t('مقدار اختصاص از موجودی آزاد دارایی بیشتر است.'));
      if (kind === 'cash') {
        await onSubmit({ deposit: { id: newDepositId(), date: iso, amount: type === 'out' ? -amountNum : amountNum, currency, note: note.trim() } });
      } else {
        await onSubmit({
          allocation: {
            id: newDepositId().replace('dep_', 'alc_'), date: todayIso(),
            portfolioId: asset.portfolioId, assetId: asset.assetId, assetName: asset.assetName, unit: asset.unit, mode, value: shareNum,
          },
        });
      }
      onClose();
    } catch (err) {
      setError(err.message || t('ثبت واریز ممکن نشد.'));
    }
  };

  const submitLabel = kind === 'asset' ? t('اختصاص به هدف') : type === 'out' ? t('ثبت برداشت') : t('ثبت واریز');
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('افزودن به «{name}»', { name: goal.name })}
      icon={<PiggyBank size={18} />}
      maxWidth="480px"
      onSubmit={handleSubmit}
      footer={<EntryFormActions submitLabel={submitLabel} valid={isValid} submitting={submitting} onCancel={onClose} />}
    >
      <div className="entry-form-body">
        {error && <AlertBanner type="error" message={error} />}
        <div className="ui-input-group">
          <FilterPills variant="segmented" size="sm" options={KIND_OPTIONS} activeValue={kind} onChange={setKind} />
        </div>

        {kind === 'cash' ? (
          <>
            <AmountField id="goal-deposit-amount" value={amount} onValueChange={setAmount} currency={currency} onCurrencyChange={setCurrency} autoFocus />
            <div className="ui-input-group">
              <FilterPills variant="segmented" size="sm" options={TYPE_OPTIONS} activeValue={type} onChange={setType} />
            </div>
            <DateField label={t('روز')} value={dateShamsi} onChange={setDateShamsi} />
            <Input id="goal-deposit-note" label={t('یادداشت')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={GOAL_LIMITS.noteLength} />
          </>
        ) : assets.length === 0 ? (
          <p className="expense-form-hint">{t('هنوز دارایی‌ای در پورتفوهایتان نیست. دارایی را در پورتفو اضافه کنید، بعد اینجا بخشی از آن را به هدف اختصاص دهید.')}</p>
        ) : (
          <>
            <PickerRow
              label={t('دارایی')}
              value={assetKey}
              options={assets.map((a) => ({
                value: a.key,
                label: `${a.assetName} · ${a.portfolioName}`,
                hint: t('{amount} {unit} آزاد', { amount: fa(leftOf(a.portfolioId, a.assetId)), unit: a.unit }),
              }))}
              onChange={setAssetKey}
              placeholder={t('انتخاب کنید')}
            />
            <div className="ui-input-group">
              <FilterPills variant="segmented" size="sm" options={MODE_OPTIONS} activeValue={mode} onChange={setMode} />
            </div>
            <AmountField
              id="goal-allocation-share"
              label={mode === 'percent' ? t('درصد از دارایی') : t('مقدار')}
              unit={mode === 'percent' ? '٪' : asset?.unit || t('واحد')}
              value={share}
              onValueChange={setShare}
            />
            {asset && (
              <p className="expense-form-hint">
                {t('{amount} {unit} ≈ {value}', { amount: fa(quantity), unit: asset.unit, value: formatGoalAmount(quantity * asset.unitPrice, 'IRT') })}
              </p>
            )}
            {asset && (
              <p className={`expense-form-hint ${overAllocated ? 'is-error' : ''}`} role={overAllocated ? 'alert' : undefined}>
                {overAllocated
                  ? t('بیشتر از موجودی آزاد است: از {total} {unit} این دارایی، {reserved} {unit} برای هدف‌ها کنار گذاشته شده و فقط {amount} {unit} آزاد است.', { total: fa(asset.amount), reserved: fa(asset.amount - left), amount: fa(left), unit: asset.unit })
                  : t('آزاد برای اختصاص: {amount} {unit}', { amount: fa(left), unit: asset.unit })}
              </p>
            )}
            <p className="expense-form-hint">{t('دارایی در پورتفو می‌ماند و فروخته یا خرج نمی‌شود؛ با قیمت روز در هدف حساب می‌شود، پس ارزشش با بازار بالا و پایین می‌رود. هر مقدار دارایی فقط به یک هدف می‌رسد.')}</p>
          </>
        )}
      </div>
    </Modal>
  );
}
