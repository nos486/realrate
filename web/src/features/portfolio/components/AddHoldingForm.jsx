/**
 * AddHoldingForm.jsx — «ثبت خرید»: the buy side of the portfolio's one entry form
 *
 * An asset, a quantity, and — optional — its buy price and date: without a price it is a holding of
 * unknown cost (counted in the quantity, not in P&L); without a date it opens the asset's ledger
 * (the opening balance). Paid with another asset, funded by a loan, a personal asset's own price:
 * all here. «فروش» at the top switches to the sell side
 * (TransactionForm, `onSwitchToSell`) for the same asset. Stored as a holding record; the ledger
 * (utils/assetLedger.js) reads it with the transactions.
 *
 * Laid out as an entry form (shared/form/, docs/en/DESIGN.md «Entry forms»): «خرید / فروش» as a
 * segmented switch, the asset, its quantity large (UnitAmountField), the buy price per unit (or
 * paid with another asset), a personal or bourse asset's price of today, the day (optional, so the
 * full picker with its «امروز» that also fills today's price), and «تأمین از» and the note folded
 * under «جزئیات بیشتر». A new buy can be saved with «ثبت و بعدی»: the form stays open, keeping the
 * asset, price, day and loan (the caller is asked not to close it: `onSubmit(holding, { next })`
 * resolves truthy once saved).
 */

import React, { useState, useEffect, useRef } from 'react';
import { Coins } from 'lucide-react';
import { FilterPills, Input, Modal, NumericInput } from '../../../shared/ui/index.js';
import { EntryFormActions, MoreDetails, PickerRow } from '../../../shared/form/index.js';
import UniversalAssetSearch from '../../../components/UniversalAssetSearch.jsx';
import ShamsiDatePicker from './ShamsiDatePicker.jsx';
import ReferenceAssetInputs from './ReferenceAssetInputs.jsx';
import UnitAmountField from './UnitAmountField.jsx';
import { parseInputNumber } from '../utils/holdingHelpers.js';
import { toPriceId, isCustomAssetId } from '../../../utils/priceIds.js';
import {
  resolveAssetDisplayName,
  resolveAssetUnit,
} from '../../../config/sourceRegistry.js';
import {
  getItemCategory,
  getItemUnit,
} from '../../../config/displayEngine.js';
import { usePricing } from '../../market/index.js';
import { useOptionalLoans } from '../../loans/context/LoansContext.jsx';
import { fundingLoanOptions } from '../../../utils/loanFunding.js';

/** «خرید / موجودی» here, «فروش» in the transaction form */
const SIDE_OPTIONS = [
  { value: 'buy', label: 'خرید / موجودی' },
  { value: 'sell', label: 'فروش' },
];

const formatNum = (v) => Number(v || 0).toLocaleString('fa-IR');

export default function AddHoldingForm({
  isOpen,
  onClose,
  onSubmit,
  editingHolding = null,
  submitting = false,
  // A new buy of a known asset (an asset row's «خرید»): { assetId }
  presetAsset = null,
  // «فروش» on a new entry: the sell form for the asset chosen here
  onSwitchToSell = null,
}) {
  const pricing = usePricing();
  const [selectedAssetId, setSelectedAssetId] = useState('gold_18k');
  const [customName, setCustomName] = useState('');
  const [customUnit, setCustomUnit] = useState('واحد');
  const [customCurrentPrice, setCustomCurrentPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [buyDate, setBuyDate] = useState('');
  const [notes, setNotes] = useState('');
  // «ثبت و بعدی»: what was just saved (the status line), and a new round for the next one
  const [saved, setSaved] = useState('');
  const [round, setRound] = useState(0);
  // Counts each opening: «جزئیات بیشتر» starts open from what the opened record has filled
  const [opened, setOpened] = useState(0);
  // «تأمین از»: bought with the user's own money ('') or with a loan (utils/loanFunding.js)
  const [loanId, setLoanId] = useState('');
  const fundingLoans = fundingLoanOptions(useOptionalLoans(), editingHolding?.loanId);
  const [selectedBourseSymbol, setSelectedBourseSymbol] = useState(null);
  const [referenceAsset, setReferenceAsset] = useState(null);
  const [referenceQuantity, setReferenceQuantity] = useState('');
  const [referencePriceToman, setReferencePriceToman] = useState('');
  // "What if I had bought this instead" (comparison only, nothing paid with it)

  // Read when the form opens, not a reason to reset it (prices refresh in the background)
  const getAssetRef = useRef(null);
  useEffect(() => {
    getAssetRef.current = pricing?.getAsset;
  });

  // Initialize or reset form state on open / edit
  useEffect(() => {
    if (!isOpen) return;
    setSaved('');
    setOpened((n) => n + 1);

    if (editingHolding) {
      setSelectedAssetId(editingHolding.assetId || 'gold_18k');
      setAmount(editingHolding.amount ? String(editingHolding.amount) : '');
      setBuyPrice(editingHolding.buyPrice ? String(editingHolding.buyPrice) : '');
      setBuyDate(editingHolding.buyDate || '');
      setNotes(editingHolding.notes || '');
      setLoanId(editingHolding.loanId || '');

      if (editingHolding.referenceAssetId && editingHolding.referenceQuantity) {
        const refId = editingHolding.referenceAssetId;
        setReferenceAsset({
          id: toPriceId(refId),
          name: resolveAssetDisplayName(refId) || refId,
          unit: resolveAssetUnit(refId) || 'واحد',
          category: getItemCategory(refId),
        });
        setReferenceQuantity(String(editingHolding.referenceQuantity));
        // Reconstruct the reference asset's Toman price AT TRADE TIME from the two stored
        // totals, so re-opening the edit form shows the original price, not today's.
        const totalToman = Number(editingHolding.buyPrice) * Number(editingHolding.amount);
        const reconstructedPrice = totalToman / Number(editingHolding.referenceQuantity);
        setReferencePriceToman(reconstructedPrice > 0 ? String(Math.round(reconstructedPrice)) : '');
      } else {
        setReferenceAsset(null);
        setReferenceQuantity('');
        setReferencePriceToman('');
      }

      if (editingHolding.category === 'custom' || editingHolding.assetType === 'custom') {
        setCustomName(editingHolding.assetName || editingHolding.name || '');
        setCustomUnit(editingHolding.unit || 'واحد');
        setCustomCurrentPrice(editingHolding.customPrice ? String(editingHolding.customPrice) : '');
      } else {
        setCustomName('');
        setCustomUnit('واحد');
        setCustomCurrentPrice('');
      }

      // The book knows whether a symbol is a share or a fund; the id alone can't tell
      const editCat = getAssetRef.current?.(editingHolding.assetId)?.category || getItemCategory(editingHolding);
      if (editCat === 'bourse' || editCat === 'bourse_fund') {
        setSelectedBourseSymbol({
          // The symbol after the market ("bourse__فولاد"), whatever form the id was stored in
          symbol: toPriceId(editingHolding.assetId || '').split('__').pop(),
          name: editingHolding.assetName,
          isFund: editCat === 'bourse_fund',
          priceToman: editingHolding.customPrice || 0,
        });
      } else {
        setSelectedBourseSymbol(null);
      }
    } else {
      const presetId = presetAsset?.assetId && !isCustomAssetId(presetAsset.assetId) ? presetAsset.assetId : '';
      setSelectedAssetId(presetId || 'gold_18k');
      setCustomName('');
      setCustomUnit('واحد');
      setCustomCurrentPrice('');
      setAmount('');
      setBuyPrice('');
      setBuyDate('');
      setNotes('');
      setLoanId('');
      const presetCat = presetId ? (getAssetRef.current?.(presetId)?.category || getItemCategory(presetId)) : '';
      setSelectedBourseSymbol(presetCat === 'bourse' || presetCat === 'bourse_fund'
        ? { symbol: toPriceId(presetId).split('__').pop(), name: presetAsset.assetName, isFund: presetCat === 'bourse_fund', priceToman: 0 }
        : null);
      setReferenceAsset(null);
      setReferenceQuantity('');
      setReferencePriceToman('');
    }
  }, [isOpen, editingHolding, presetAsset]);

  const handleAssetSelect = (asset) => {
    if (!asset) return;
    if (asset.category === 'custom' || isCustomAssetId(asset.id)) {
      setSelectedAssetId('custom');
      setSelectedBourseSymbol(null);
      setCustomName(asset.name || '');
      setCustomUnit(asset.unit || 'واحد');
      if (asset.price > 0) setCustomCurrentPrice(String(Math.round(asset.price)));
      return;
    }
    // Picked from the price book: its id is what gets stored
    setSelectedAssetId(toPriceId(asset.id));
    const isBourse = ['bourse', 'bourse_fund'].includes(asset.category);
    setSelectedBourseSymbol(isBourse
      ? { symbol: asset.symbol, name: asset.name, priceToman: asset.price, isFund: Boolean(asset.isFund) }
      : null);
    setCustomName(asset.name || '');
    setCustomUnit(asset.unit || 'واحد');
    setCustomCurrentPrice(asset.price > 0 ? String(Math.round(asset.price)) : '');
  };

  const handleTodayClick = () => {
    // Today's price: the one entered for a personal asset, else the price book's
    const entered = parseInputNumber(customCurrentPrice);
    const currentPrice = entered > 0 ? entered : (pricing?.getAssetPrice?.(selectedAssetId) || 0);
    if (currentPrice > 0) setBuyPrice(String(Math.round(currentPrice)));
  };

  // «ثبت و بعدی»: saved, and the form stays open for the next buy of the same asset, day and loan
  const startNext = (savedTitle) => {
    setAmount('');
    setNotes('');
    setReferenceQuantity('');
    setSaved(savedTitle);
    // The quantity field again, focused
    setRound((r) => r + 1);
  };

  const handleSubmit = async (e, next = false) => {
    e?.preventDefault?.();
    const parsedAmount = parseInputNumber(amount);
    if (!parsedAmount || parsedAmount <= 0) return;
    setSaved('');

    let finalAssetId = selectedAssetId;

    if (isCustomAssetId(selectedAssetId)) {
      finalAssetId = editingHolding?.assetId || `custom_${Date.now()}`;
    } else {
      finalAssetId = toPriceId(selectedAssetId, pricing?.priceMap);
    }

    // Paid/swapped with a reference asset: the Toman price the rest of the app relies on
    // is always (total reference quantity × its Toman price at trade time) ÷ this asset's
    // amount — never a manually-typed Toman figure.
    const parsedReferenceQuantity = parseInputNumber(referenceQuantity);
    const parsedReferencePrice = parseInputNumber(referencePriceToman);
    const hasReference = Boolean(referenceAsset) && parsedReferenceQuantity > 0 && parsedReferencePrice > 0;
    const finalBuyPrice = hasReference
      ? Math.round((parsedReferenceQuantity * parsedReferencePrice) / parsedAmount)
      : (parseInputNumber(buyPrice) || 0);

    const holding = {
      id: editingHolding?.id,
      assetId: finalAssetId,
      amount: parsedAmount,
      buyPrice: finalBuyPrice,
      buyDate: buyDate.trim(),
      notes: notes.trim(),
      loanId: fundingLoans.some((l) => l.id === loanId) ? loanId : '',
      customPrice: parseInputNumber(customCurrentPrice) || 0,
      referenceAssetId: hasReference ? referenceAsset.id : '',
      referenceQuantity: hasReference ? parsedReferenceQuantity : 0,
    };
    if (!next) {
      onSubmit?.(holding);
      return;
    }
    // The caller keeps the form open and answers whether it was saved
    if (await onSubmit?.(holding, { next: true })) startNext(selectedAssetTitle);
  };

  // The submit buttons stay disabled until a quantity is typed (and while saving: EntryFormActions)
  const parsedAmountForValidation = parseInputNumber(amount);
  const isAmountValid = parsedAmountForValidation !== null && parsedAmountForValidation > 0;

  const selectedBookAsset = pricing?.getAsset?.(selectedAssetId) || null;
  const selectedCategory = selectedBookAsset?.category || getItemCategory(selectedAssetId);
  const isModalBourse =
    ['bourse', 'bourse_fund'].includes(selectedCategory) ||
    selectedBourseSymbol !== null;
  const isModalFund = Boolean(
    selectedCategory === 'bourse_fund' ||
    selectedBourseSymbol?.isFund
  );
  const isModalCustom = selectedCategory === 'custom' || selectedAssetId?.startsWith('custom_');

  const selectedAssetTitle = isModalBourse
    ? (selectedBourseSymbol?.symbol ? `${selectedBourseSymbol.symbol} (${selectedBourseSymbol.name || 'سهام بورس'})` : customName || 'سهام بورس')
    : (isModalCustom ? (customName || 'دارایی شخصی') : (selectedBookAsset?.name || customName || selectedAssetId || 'انتخاب نشده'));

  const unitLabel = selectedBookAsset?.unit || getItemUnit(selectedAssetId, null, isModalFund ? 'واحد' : (isModalBourse ? 'برگ سهام' : (customUnit || 'واحد')));

  const detailsFilled = [
    ...(fundingLoans.some((l) => l.id === loanId) ? ['وام'] : []),
    ...(notes.trim() ? ['یادداشت'] : []),
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={!submitting ? onClose : undefined}
      title={editingHolding ? 'ویرایش خرید' : 'ثبت در پورتفو'}
      icon={<Coins size={18} />}
      maxWidth="500px"
      className="asset-modal-box"
      onSubmit={handleSubmit}
      footer={
        <EntryFormActions
          submitLabel={editingHolding ? 'ذخیره تغییرات' : 'ثبت خرید'}
          valid={isAmountValid}
          submitting={submitting}
          onCancel={onClose}
          onNext={editingHolding ? null : () => handleSubmit(null, true)}
        />
      }
    >
      <div className="entry-form-body portfolio-entry-form">
        {saved && <p className="entry-form-saved" role="status">«{saved}» ثبت شد؛ خرید بعدی را وارد کنید.</p>}

        {/* The one entry form: buy here, sell in the transaction form */}
        {!editingHolding && onSwitchToSell && (
          <FilterPills
            variant="segmented"
            options={SIDE_OPTIONS}
            activeValue="buy"
            onChange={(side) => {
              if (side !== 'sell') return;
              onSwitchToSell(isModalCustom ? null : {
                assetId: toPriceId(selectedAssetId),
                assetName: selectedAssetTitle,
                unit: unitLabel,
              });
            }}
          />
        )}

        <div className="ui-input-group portfolio-entry-asset">
          <div className="portfolio-entry-asset-head">
            <span className="ui-input-label">دارایی</span>
            <span className="portfolio-entry-asset-chosen">{selectedAssetTitle}</span>
          </div>
          <UniversalAssetSearch
            mode="picker"
            selectedAssetId={selectedAssetId}
            showCategories={true}
            onSelect={handleAssetSelect}
          />
        </div>

        {/* Selected Bourse Stock Highlight Card */}
        {isModalBourse && (
          <div className="selected-bourse-preview-card">
            <div className="preview-card-header">
              <div className="preview-symbol-info">
                <span className={`bourse-active-badge ${isModalFund ? 'fund-active-badge' : ''}`}>
                  {isModalFund ? 'بورس اوراق بهادار تهران (صندوق)' : 'بورس اوراق بهادار تهران (سهام)'}
                </span>
                <strong className="preview-symbol-code">
                  {selectedBourseSymbol?.symbol ||
                    (selectedAssetId === 'bourse_fund'
                      ? 'صندوق'
                      : selectedAssetId === 'bourse'
                        ? 'سهام'
                        : selectedAssetId.replace('bourse_', ''))}
                </strong>
                <span className="preview-company-name">
                  {selectedBourseSymbol?.name ||
                    customName ||
                    (isModalFund ? 'صندوق‌های سرمایه‌گذاری بورس' : 'سهام بورس ایران')}
                </span>
              </div>
              <button
                type="button"
                className="btn-change-selected-stock"
                onClick={() => {
                  setSelectedAssetId('gold_18k');
                  setSelectedBourseSymbol(null);
                  setCustomName('');
                  setCustomUnit('گرم');
                  setCustomCurrentPrice('');
                }}
              >
                تغییر دارایی
              </button>
            </div>
            {selectedBourseSymbol?.priceToman > 0 && (
              <div className="preview-card-footer">
                <span className="preview-price-label">آخرین قیمت معامله:</span>
                <strong className="preview-price-num">
                  {formatNum(selectedBourseSymbol.priceToman)} تومان
                </strong>
                <span className="preview-price-rial">
                  ({Number(selectedBourseSymbol.priceToman * 10).toLocaleString('fa-IR')} ریال)
                </span>
              </div>
            )}
          </div>
        )}

        {/* A personal asset: its name and unit */}
        {isModalCustom && (
          <div className="form-row-dual">
            <Input
              id="holding-custom-name"
              className="flex-1"
              label="نام دارایی شخصی"
              placeholder="مثلاً زمین دماوند، خودرو، نقاشی..."
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              required
            />
            <Input
              id="holding-custom-unit"
              className="flex-1"
              label="واحد شمارش"
              placeholder="مثلاً متر، عدد، تن، سهم..."
              value={customUnit}
              onChange={(e) => setCustomUnit(e.target.value)}
              required
            />
          </div>
        )}

        <UnitAmountField
          key={`amount-${round}`}
          id="holding-amount"
          label="مقدار"
          unit={unitLabel}
          value={amount}
          onValueChange={setAmount}
          placeholder={`مثلاً ${isModalBourse ? (isModalFund ? '۵۰۰' : '۱۰۰۰') : unitLabel === 'گرم' ? '۱۵.۵' : '۲'}`}
          autoFocus={!editingHolding}
        />

        {/* Buy price — Toman (default), unless paid/swapped with another asset */}
        {!referenceAsset && (
          <UnitAmountField
            id="holding-buy-price"
            label={`قیمت خرید هر ${unitLabel} (تومان، اختیاری)`}
            unit="تومان"
            value={buyPrice}
            onValueChange={setBuyPrice}
            allowDecimals={false}
            required={false}
            placeholder={isModalBourse ? 'قیمت خرید هر سهم' : 'مبلغ هر واحد'}
          />
        )}

        <ReferenceAssetInputs
          referenceAsset={referenceAsset}
          onReferenceAssetChange={setReferenceAsset}
          referenceQuantity={referenceQuantity}
          onReferenceQuantityChange={setReferenceQuantity}
          referencePriceToman={referencePriceToman}
          onReferencePriceChange={setReferencePriceToman}
          newAssetAmount={parseInputNumber(amount) || 0}
          newAssetUnitLabel={unitLabel}
          autoFillPrice={!editingHolding}
          tradeDate={buyDate}
        />

        {/* Custom or Bourse Asset: Current Market Price field */}
        {(isModalCustom || isModalBourse) && (
          <div className="ui-input-group">
            <label htmlFor="holding-current-price" className="ui-input-label">قیمت روز واحد (تومان)</label>
            <NumericInput
              id="holding-current-price"
              placeholder="جهت محاسبه زنده ارزش و سود/زیان"
              value={customCurrentPrice}
              onValueChange={setCustomCurrentPrice}
              className="form-input"
              allowDecimals={false}
            />
            <span className="field-sub-note">
              {isModalBourse
                ? 'به صورت خودکار با آخرین قیمت معاملات بازار بورس هماهنگ می‌شود.'
                : 'اختیاری؛ در صورت خالی بودن، برابر با قیمت خرید در نظر گرفته می‌شود.'}
            </span>
          </div>
        )}

        {/* The day: optional (none opens the ledger), «امروز» also fills today's price */}
        <div className="ui-input-group">
          <ShamsiDatePicker
            value={buyDate}
            onChange={setBuyDate}
            onTodayClick={handleTodayClick}
            label="تاریخ خرید (شمسی، اختیاری)"
          />
          {!(parseInputNumber(buyPrice) > 0) && !referenceAsset && (
            <span className="field-sub-note">
              بدون قیمت خرید، موجودی ثبت می‌شود و در سود/زیان حساب نمی‌شود؛ بدون تاریخ، «موجودی اولیه» است و فروش‌ها اول از آن کم می‌شوند.
            </span>
          )}
        </div>

        <MoreDetails key={`details-${opened}`} filled={detailsFilled}>
          {fundingLoans.length > 0 && (
            <PickerRow
              label="تأمین از"
              value={loanId}
              options={[
                { value: '', label: 'پول خودم' },
                ...fundingLoans.map((l) => ({ value: l.id, label: l.title })),
              ]}
              onChange={setLoanId}
              placeholder="پول خودم"
            />
          )}
          <Input
            id="holding-notes"
            label="یادداشت یا توضیحات"
            placeholder="مثلاً خرید از بورس یا بازار تهران..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </MoreDetails>
      </div>
    </Modal>
  );
}
