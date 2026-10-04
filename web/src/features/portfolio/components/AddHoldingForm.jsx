/**
 * AddHoldingForm.jsx — «ثبت خرید»: the buy side of the portfolio's one entry form
 *
 * An asset, a quantity, and — optional — its buy price and date: without a price it is a holding of
 * unknown cost (counted in the quantity, not in P&L); without a date it opens the asset's ledger
 * (the opening balance). Paid with another asset, compared with another, funded by a loan, a
 * personal asset's own price: all here. «فروش» at the top switches to the sell side
 * (TransactionForm, `onSwitchToSell`) for the same asset. Stored as a holding record; the ledger
 * (utils/assetLedger.js) reads it with the transactions.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Coins, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import Modal from '../../../shared/ui/Modal.jsx';
import NumericInput from '../../../shared/ui/NumericInput.jsx';
import UniversalAssetSearch from '../../../components/UniversalAssetSearch.jsx';
import ShamsiDatePicker from './ShamsiDatePicker.jsx';
import ReferenceAssetInputs from './ReferenceAssetInputs.jsx';
import CompareAssetInputs from './CompareAssetInputs.jsx';
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
import FilterPills from '../../../shared/ui/FilterPills.jsx';
import { useOptionalLoans } from '../../loans/context/LoansContext.jsx';
import { fundingLoanOptions } from '../../../utils/loanFunding.js';

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
  // «تأمین از»: bought with the user's own money ('') or with a loan (utils/loanFunding.js)
  const [loanId, setLoanId] = useState('');
  const fundingLoans = fundingLoanOptions(useOptionalLoans(), editingHolding?.loanId);
  const [selectedBourseSymbol, setSelectedBourseSymbol] = useState(null);
  const [referenceAsset, setReferenceAsset] = useState(null);
  const [referenceQuantity, setReferenceQuantity] = useState('');
  const [referencePriceToman, setReferencePriceToman] = useState('');
  // "What if I had bought this instead" (comparison only, nothing paid with it)
  const [compareAsset, setCompareAsset] = useState(null);
  const [comparePriceToman, setComparePriceToman] = useState('');

  // Read when the form opens, not a reason to reset it (prices refresh in the background)
  const getAssetRef = useRef(null);
  useEffect(() => {
    getAssetRef.current = pricing?.getAsset;
  });

  // Initialize or reset form state on open / edit
  useEffect(() => {
    if (!isOpen) return;

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

      if (editingHolding.compareAssetId && Number(editingHolding.comparePriceToman) > 0) {
        const cmpId = editingHolding.compareAssetId;
        setCompareAsset({
          id: toPriceId(cmpId),
          name: resolveAssetDisplayName(cmpId) || cmpId,
          unit: resolveAssetUnit(cmpId) || 'واحد',
          category: getItemCategory(cmpId),
        });
        setComparePriceToman(String(editingHolding.comparePriceToman));
      } else {
        setCompareAsset(null);
        setComparePriceToman('');
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
      setCompareAsset(null);
      setComparePriceToman('');
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

  const handleSubmit = (e) => {
    e?.preventDefault();
    const parsedAmount = parseInputNumber(amount);
    if (!parsedAmount || parsedAmount <= 0) return;

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

    const parsedComparePrice = parseInputNumber(comparePriceToman);
    const hasCompare = Boolean(compareAsset) && parsedComparePrice > 0;

    onSubmit?.({
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
      compareAssetId: hasCompare ? compareAsset.id : '',
      comparePriceToman: hasCompare ? Math.round(parsedComparePrice) : 0,
    });
  };

  // Proactively disable the submit button instead of alert()-ing after a click — matches
  // TransactionForm.jsx's isFormValid pattern for the sibling "add a financial item" form.
  const parsedAmountForValidation = parseInputNumber(amount);
  const isAmountValid = parsedAmountForValidation !== null && parsedAmountForValidation > 0;
  const isFormValid = isAmountValid && !submitting;

  // The purchase's Toman cost, as it will be saved (for the comparison preview)
  const previewCostToman = (() => {
    const amountNum = parseInputNumber(amount) || 0;
    const refQty = parseInputNumber(referenceQuantity) || 0;
    const refPrice = parseInputNumber(referencePriceToman) || 0;
    if (referenceAsset && refQty > 0 && refPrice > 0) return Math.round(refQty * refPrice);
    return Math.round(amountNum * (parseInputNumber(buyPrice) || 0));
  })();

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
        <div className="modal-actions">
          <button
            type="button"
            className="btn-cancel"
            disabled={submitting}
            onClick={onClose}
          >
            انصراف
          </button>
          <button type="submit" className="btn-primary" disabled={!isFormValid}>
            {submitting
              ? 'در حال ذخیره...'
              : editingHolding
                ? 'ذخیره تغییرات'
                : 'ثبت خرید'}
          </button>
        </div>
      }
    >
      {/* The one entry form: buy here, sell in the transaction form */}
      {!editingHolding && onSwitchToSell && (
        <div className="form-item">
          <div className="tx-type-toggle-bar">
            <button type="button" className="tx-type-btn buy active">
              <ArrowDownLeft size={16} style={{ verticalAlign: 'middle', marginLeft: '6px' }} />
              خرید / موجودی
            </button>
            <button
              type="button"
              className="tx-type-btn sell"
              onClick={() => onSwitchToSell(isModalCustom ? null : {
                assetId: toPriceId(selectedAssetId),
                assetName: selectedAssetTitle,
                unit: unitLabel,
              })}
            >
              <ArrowUpRight size={16} style={{ verticalAlign: 'middle', marginLeft: '6px' }} />
              فروش
            </button>
          </div>
        </div>
      )}

      {/* Unified Asset Selector Component */}
      <div
        className="unified-asset-picker-card"
        style={{
          padding: '14px',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          marginBottom: '16px',
        }}
      >
        <div
          className="unified-picker-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '10px',
          }}
        >
          <span
            className="unified-picker-title"
            style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-heading)' }}
          >
            نوع و مشخصات دارایی:
          </span>
          <div
            className="active-asset-summary-pill"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              background: 'rgba(59,130,246,0.1)',
              border: '1px solid rgba(59,130,246,0.25)',
              padding: '3px 10px',
              borderRadius: '16px',
            }}
          >
            <span className="summary-label" style={{ color: 'var(--text-muted)' }}>
              انتخاب‌شده:
            </span>
            <strong className="summary-val" style={{ color: 'var(--color-primary-text)' }}>
              {selectedAssetTitle}
            </strong>
          </div>
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

      {/* Custom Asset Specific Fields */}
      {isModalCustom && (
        <div className="form-row-dual">
          <div className="form-item flex-1">
            <label>نام دارایی شخصی</label>
            <input
              type="text"
              placeholder="مثلاً زمین دماوند، خودرو، نقاشی..."
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="form-input"
              required
            />
          </div>
          <div className="form-item flex-1">
            <label>واحد شمارش</label>
            <input
              type="text"
              placeholder="مثلاً متر، عدد، تن، سهم..."
              value={customUnit}
              onChange={(e) => setCustomUnit(e.target.value)}
              className="form-input"
              required
            />
          </div>
        </div>
      )}

      {/* Amount Input */}
      <div className="form-item">
        <label>مقدار ({unitLabel})</label>
        <input
          type="text"
          className="form-input"
          placeholder={`مثلاً ${isModalBourse ? (isModalFund ? '۵۰۰' : '۱۰۰۰') : unitLabel === 'گرم' ? '۱۵.۵' : '۲'}`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </div>

      {/* Buy Price Input — Toman (default), unless paid/swapped with another asset */}
      {!referenceAsset && (
        <div className="form-item">
          <label>قیمت خرید هر {unitLabel} (تومان، اختیاری)</label>
          <NumericInput
            placeholder={
              isModalBourse
                ? 'قیمت خرید هر سهم به تومان (اختیاری)...'
                : 'مبلغ هر واحد به تومان (اختیاری)...'
            }
            value={buyPrice}
            onValueChange={setBuyPrice}
            onChange={(e) => setBuyPrice(e.target.value)}
            className="form-input"
            allowDecimals={false}
          />
        </div>
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

      <CompareAssetInputs
        compareAsset={compareAsset}
        onCompareAssetChange={setCompareAsset}
        comparePriceToman={comparePriceToman}
        onComparePriceChange={setComparePriceToman}
        totalCostToman={previewCostToman}
        autoFillPrice={!editingHolding}
        tradeDate={buyDate}
      />

      {/* Custom or Bourse Asset: Current Market Price field */}
      {(isModalCustom || isModalBourse) && (
        <div className="form-item">
          <label>قیمت روز واحد (تومان)</label>
          <NumericInput
            placeholder="جهت محاسبه زنده ارزش و سود/زیان"
            value={customCurrentPrice}
            onValueChange={setCustomCurrentPrice}
            onChange={(e) => setCustomCurrentPrice(e.target.value)}
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

      {/* Date */}
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

      {fundingLoans.length > 0 && (
        <div className="form-item">
          <label>تأمین از</label>
          <FilterPills
            options={[
              { value: '', label: 'پول خودم' },
              ...fundingLoans.map((l) => ({ value: l.id, label: l.title })),
            ]}
            activeValue={loanId}
            onChange={setLoanId}
            size="sm"
            className="income-category-picker"
          />
        </div>
      )}

      {/* Notes */}
      <div className="form-item">
        <label>یادداشت یا توضیحات</label>
        <input
          type="text"
          placeholder="مثلاً خرید از بورس یا بازار تهران..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="form-input"
        />
      </div>
    </Modal>
  );
}
