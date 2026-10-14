/**
 * TransactionForm.jsx — Modal form to create or edit a buy/sell transaction
 *
 * Laid out as an entry form (shared/form/, docs/en/DESIGN.md «Entry forms»): «خرید / فروش» as a
 * segmented switch (on a new entry «خرید / موجودی» goes to the buy form, `onSwitchToBuy`), the
 * asset, the quantity large in the asset's own unit (AmountField with the asset's unit), the price of one unit in
 * tomans (AmountField; or paid / settled with another asset), the trade's total and the oversell
 * warning, the day («امروز»/«دیروز»/«روز دیگر»), and the note folded under «جزئیات بیشتر». A new
 * transaction can be saved with «ثبت و بعدی»: the form stays open, keeping the asset, side, price
 * and day (the caller is asked not to close it: `onSubmit(tx, { next })` resolves truthy once
 * saved).
 */

import { intlLocale, t } from '../../../utils/i18n.js';
import React, { useState, useEffect } from 'react';
import { Receipt, AlertTriangle } from 'lucide-react';
import { FilterPills, Input, Modal } from '../../../shared/ui/index.js';
import { AmountField, DateField, EntryFormActions, MoreDetails } from '../../../shared/form/index.js';
import UniversalAssetSearch from '../../../components/UniversalAssetSearch.jsx';
import { getTodayShamsi } from '../../portfolio/components/ShamsiDatePicker.jsx';
import ReferenceAssetInputs from '../../portfolio/components/ReferenceAssetInputs.jsx';
import { parseInputNumber } from '../../portfolio/utils/holdingHelpers.js';
import { toPriceId, isCustomAssetId } from '../../../utils/priceIds.js';
import {
  resolveAssetDisplayName,
  resolveAssetUnit,
} from '../../../config/sourceRegistry.js';
import { getItemCategory } from '../../../config/displayEngine.js';
import { BASE_CURRENCY } from '../../../utils/currencies.js';

export default function TransactionForm({
  isOpen,
  onClose,
  onSubmit,
  editingTransaction = null,
  submitting = false,
  currentHoldingsMap = {}, // assetId -> { amount, unit } for sell warnings
  // A new transaction of a known asset (an asset row's «خرید» / «فروش»):
  // { assetId, assetName, unit, transactionType, unitPrice? }
  preset = null,
  // A new entry's «خرید» goes to the buy form (AddHoldingForm) for the asset chosen here
  onSwitchToBuy = null,
}) {
  const [assetId, setAssetId] = useState('gold_18k');
  const [assetName, setAssetName] = useState(t('طلای ۱۸ عیار'));
  const [unit, setUnit] = useState(t('گرم'));
  const [transactionType, setTransactionType] = useState('buy'); // 'buy' | 'sell'
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [transactionDate, setTransactionDate] = useState(() => getTodayShamsi());
  const [notes, setNotes] = useState('');
  const [referenceAsset, setReferenceAsset] = useState(null);
  const [referenceQuantity, setReferenceQuantity] = useState('');
  const [referencePriceToman, setReferencePriceToman] = useState('');
  // «ثبت و بعدی»: what was just saved (the status line), and a new round for the next one
  const [saved, setSaved] = useState('');
  const [round, setRound] = useState(0);
  // Counts each opening: the day and «جزئیات بیشتر» start from the opened record
  const [opened, setOpened] = useState(0);

  // Reset or populate on open/edit
  useEffect(() => {
    if (!isOpen) return;
    setSaved('');
    setOpened((n) => n + 1);

    if (editingTransaction) {
      setAssetId(editingTransaction.assetId || 'gold_18k');
      setAssetName(editingTransaction.assetName || resolveAssetDisplayName(editingTransaction.assetId) || t('دارایی'));
      setUnit(editingTransaction.unit || t('واحد'));
      setTransactionType(editingTransaction.transactionType || 'buy');
      setQuantity(editingTransaction.quantity !== undefined ? String(editingTransaction.quantity) : '');
      setUnitPrice(editingTransaction.unitPrice !== undefined ? String(editingTransaction.unitPrice) : '');
      setTransactionDate(editingTransaction.transactionDate || getTodayShamsi());
      setNotes(editingTransaction.notes || '');

      if (editingTransaction.referenceAssetId && editingTransaction.referenceQuantity) {
        const refId = editingTransaction.referenceAssetId;
        setReferenceAsset({
          id: refId,
          name: resolveAssetDisplayName(refId) || refId,
          unit: resolveAssetUnit(refId) || t('واحد'),
          category: getItemCategory(refId),
        });
        setReferenceQuantity(String(editingTransaction.referenceQuantity));
        const totalToman = Number(editingTransaction.unitPrice) * Number(editingTransaction.quantity);
        const reconstructedPrice = totalToman / Number(editingTransaction.referenceQuantity);
        setReferencePriceToman(reconstructedPrice > 0 ? String(Math.round(reconstructedPrice)) : '');
      } else {
        setReferenceAsset(null);
        setReferenceQuantity('');
        setReferencePriceToman('');
      }
    } else {
      setAssetId(preset?.assetId || 'gold_18k');
      setAssetName(preset?.assetName || t('طلای ۱۸ عیار'));
      setUnit(preset?.unit || t('گرم'));
      setTransactionType(preset?.transactionType === 'sell' ? 'sell' : 'buy');
      setQuantity('');
      setUnitPrice(preset?.unitPrice > 0 ? String(Math.round(preset.unitPrice)) : '');
      setTransactionDate(getTodayShamsi());
      setNotes('');
      setReferenceAsset(null);
      setReferenceQuantity('');
      setReferencePriceToman('');
    }
  }, [isOpen, editingTransaction, preset]);

  // Asset selection handler
  const handleAssetSelect = (asset) => {
    if (!asset) return;
    if (asset.category === 'custom' || isCustomAssetId(asset.id)) {
      setAssetId(isCustomAssetId(asset.id) && asset.id !== 'custom' ? asset.id : `custom_${Date.now()}`);
      setAssetName(asset.name || t('دارایی شخصی'));
      setUnit(asset.unit || t('واحد'));
      return;
    }
    // Picked from the price book: its id is what gets stored, its price is today's
    setAssetId(toPriceId(asset.id));
    setAssetName(asset.name || '');
    setUnit(asset.unit || t('واحد'));
    if (!unitPrice && asset.price > 0) setUnitPrice(String(Math.round(asset.price)));
  };

  // Validation logic
  const quantityNum = parseInputNumber(quantity);
  const hasReference = Boolean(referenceAsset);
  const parsedReferenceQuantity = parseInputNumber(referenceQuantity);
  const parsedReferencePrice = parseInputNumber(referencePriceToman);
  // The Toman unit price the rest of the app relies on: either typed directly, or — when
  // paid/settled with another asset — derived as (total reference quantity × its Toman
  // price at trade time) ÷ this transaction's quantity.
  const finalUnitPriceNum = hasReference
    ? (parsedReferenceQuantity > 0 && parsedReferencePrice > 0 && quantityNum > 0
        ? Math.round((parsedReferenceQuantity * parsedReferencePrice) / quantityNum)
        : null)
    : parseInputNumber(unitPrice);
  const isDateValid = Boolean(transactionDate && transactionDate.trim().length >= 8);
  const isQuantityValid = quantityNum !== null && quantityNum > 0;
  const isUnitPriceValid = finalUnitPriceNum !== null && finalUnitPriceNum > 0;
  const isValid = isDateValid && isQuantityValid && isUnitPriceValid;

  // Total calculated value
  const totalValue = isQuantityValid && isUnitPriceValid ? quantityNum * finalUnitPriceNum : 0;

  // Sell warning: check available balance for asset
  const availableBalance = currentHoldingsMap[assetId]?.amount || 0;
  const isSellingOverBalance = transactionType === 'sell' && isQuantityValid && quantityNum > availableBalance;

  // «ثبت و بعدی»: the next one keeps the asset, side, price and day
  const startNext = () => {
    setQuantity('');
    setNotes('');
    setReferenceQuantity('');
    setSaved(assetName);
    // The quantity field again, focused
    setRound((r) => r + 1);
  };

  const handleSubmit = async (e, next = false) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!isValid || submitting) return;
    setSaved('');

    const tx = {
      id: editingTransaction?.id,
      assetId,
      transactionType,
      quantity: quantityNum,
      unitPrice: finalUnitPriceNum,
      transactionDate: transactionDate.trim(),
      notes: notes.trim(),
      createdAt: editingTransaction?.createdAt,
      referenceAssetId: hasReference ? referenceAsset.id : '',
      referenceQuantity: hasReference ? parsedReferenceQuantity : 0,
    };
    if (!next) {
      onSubmit(tx);
      return;
    }
    // The caller keeps the form open and answers whether it was saved
    if (await onSubmit(tx, { next: true })) startNext();
  };

  // On a new entry «خرید» is the buy form's (AddHoldingForm), for the asset chosen here
  const switchesToBuy = Boolean(onSwitchToBuy && !editingTransaction);
  const sideOptions = [
    { value: 'buy', label: switchesToBuy ? t('خرید / موجودی') : t('خرید (ورود دارایی)') },
    { value: 'sell', label: t('فروش (خروج دارایی)') },
  ];
  const changeSide = (side) => {
    if (side === 'buy' && switchesToBuy) onSwitchToBuy({ assetId, assetName, unit });
    else setTransactionType(side);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingTransaction ? t('ویرایش تراکنش') : t('ثبت تراکنش جدید')}
      icon={<Receipt size={18} />}
      maxWidth="540px"
      onSubmit={handleSubmit}
      footer={
        <EntryFormActions
          submitLabel={editingTransaction ? t('به‌روزرسانی تراکنش') : t('ثبت تراکنش')}
          valid={isValid}
          submitting={submitting}
          onCancel={onClose}
          onNext={editingTransaction ? null : () => handleSubmit(null, true)}
        />
      }
    >
      <div className="entry-form-body portfolio-entry-form">
        {saved && <p className="entry-form-saved" role="status">{t('«{saved}» ثبت شد؛ تراکنش بعدی را وارد کنید.', { saved })}</p>}

        <FilterPills variant="segmented" options={sideOptions} activeValue={transactionType} onChange={changeSide} />

        <div className="ui-input-group portfolio-entry-asset">
          <div className="portfolio-entry-asset-head">
            <span className="ui-input-label">{t('دارایی *')}</span>
            <span className="portfolio-entry-asset-chosen">
              {assetName} <span className="portfolio-entry-asset-unit">({unit})</span>
            </span>
          </div>
          <UniversalAssetSearch
            mode="picker"
            selectedAssetId={assetId}
            onSelect={handleAssetSelect}
            placeholder={t('جستجو و انتخاب دارایی...')}
          />
        </div>

        <AmountField
          key={`quantity-${round}`}
          id="tx-quantity"
          label={t('مقدار')}
          unit={unit}
          value={quantity}
          onValueChange={setQuantity}
          placeholder={t('مثلاً ۱.۵ یا ۱۰۰')}
          autoFocus={!editingTransaction}
        />

        {!hasReference && (
          <AmountField
            id="tx-unit-price"
            label={t('قیمت هر {unit}', { unit })}
            value={unitPrice}
            onValueChange={setUnitPrice}
            currency={BASE_CURRENCY}
            placeholder={t('قیمت هر واحد در لحظه معامله')}
          />
        )}

        {/* Paid / settled with another asset (a currency, gold, a stock, ...) instead of Toman */}
        <ReferenceAssetInputs
          referenceAsset={referenceAsset}
          onReferenceAssetChange={setReferenceAsset}
          referenceQuantity={referenceQuantity}
          onReferenceQuantityChange={setReferenceQuantity}
          referencePriceToman={referencePriceToman}
          onReferencePriceChange={setReferencePriceToman}
          newAssetAmount={quantityNum || 0}
          newAssetUnitLabel={unit}
          autoFillPrice={!editingTransaction}
          tradeDate={transactionDate}
        />

        {totalValue > 0 && (
          <div className="tx-summary-preview-box">
            <span className="tx-summary-label">{t('ارزش کل معامله:')}</span>
            <strong className="tx-summary-value">{t('{count} تومان', { count: Math.round(totalValue).toLocaleString(intlLocale()) })}</strong>
          </div>
        )}

        {isSellingOverBalance && (
          <div className="tx-warning-banner">
            <AlertTriangle size={15} style={{ verticalAlign: 'middle', marginInlineEnd: '6px', flexShrink: 0 }} />
            <span>{t('توجه: مقدار فروش ({count} {unit}) بیشتر از موجودی محاسبه‌شده فعلی این دارایی ({available} {unit}) است. (غیرمسدودکننده)', { count: Number(quantityNum).toLocaleString(intlLocale()), unit, available: Number(availableBalance).toLocaleString(intlLocale()) })}</span>
          </div>
        )}

        <DateField key={`day-${opened}`} label={t('تاریخ معامله *')} value={transactionDate} onChange={setTransactionDate} />

        <MoreDetails key={`details-${opened}`} filled={notes.trim() ? [t('یادداشت')] : []}>
          <Input
            id="tx-notes"
            label={t('یادداشت')}
            placeholder={t('مثلاً: خرید پله‌ای، صرافی فلان، کارمزد و...')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </MoreDetails>
      </div>
    </Modal>
  );
}
