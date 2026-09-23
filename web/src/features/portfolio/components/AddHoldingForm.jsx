import React, { useState, useEffect } from 'react';
import { Coins } from 'lucide-react';
import Modal from '../../../shared/ui/Modal.jsx';
import NumericInput from '../../../shared/ui/NumericInput.jsx';
import UniversalAssetSearch from '../../../components/UniversalAssetSearch.jsx';
import ShamsiDatePicker from './ShamsiDatePicker.jsx';
import ReferenceAssetInputs from './ReferenceAssetInputs.jsx';
import { parseInputNumber } from '../utils/holdingHelpers.js';
import {
  getCanonicalAssetSpec,
  getCanonicalAssetName,
  getCanonicalAssetUnit,
  resolveItemCategory,
} from '../../../utils/financialSpecs.js';
import {
  resolveAssetDisplayName,
  resolveAssetUnit,
  resolveCategory,
} from '../../../utils/sourceRegistry.js';
import {
  getItemCategory,
  getItemUnit,
} from '../../../config/displayEngine.js';
import { usePricing } from '../../market/index.js';

const formatNum = (v) => Number(v || 0).toLocaleString('fa-IR');

export default function AddHoldingForm({
  isOpen,
  onClose,
  onSubmit,
  editingHolding = null,
  submitting = false,
  rates = null,
  realPriceMap = null,
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
  const [selectedBourseSymbol, setSelectedBourseSymbol] = useState(null);
  const [referenceAsset, setReferenceAsset] = useState(null);
  const [referenceQuantity, setReferenceQuantity] = useState('');
  const [referencePriceToman, setReferencePriceToman] = useState('');

  // Initialize or reset form state on open / edit
  useEffect(() => {
    if (!isOpen) return;

    if (editingHolding) {
      setSelectedAssetId(editingHolding.assetId || 'gold_18k');
      setAmount(editingHolding.amount ? String(editingHolding.amount) : '');
      setBuyPrice(editingHolding.buyPrice ? String(editingHolding.buyPrice) : '');
      setBuyDate(editingHolding.buyDate || '');
      setNotes(editingHolding.notes || '');

      if (editingHolding.referenceAssetId && editingHolding.referenceQuantity) {
        const refId = editingHolding.referenceAssetId;
        setReferenceAsset({
          id: refId,
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

      const editCat = getItemCategory(editingHolding);
      if (editCat === 'bourse' || editCat === 'bourse_fund') {
        setSelectedBourseSymbol({
          symbol: (editingHolding.assetId || '').replace(/^bourse_/, '').replace(/^src_def_bourse__/, ''),
          name: editingHolding.assetName,
          isFund: editCat === 'bourse_fund',
          priceToman: editingHolding.customPrice || 0,
        });
      } else {
        setSelectedBourseSymbol(null);
      }
    } else {
      setSelectedAssetId('gold_18k');
      setCustomName('');
      setCustomUnit('واحد');
      setCustomCurrentPrice('');
      setAmount('');
      setBuyPrice('');
      setBuyDate('');
      setNotes('');
      setSelectedBourseSymbol(null);
      setReferenceAsset(null);
      setReferenceQuantity('');
      setReferencePriceToman('');
    }
  }, [isOpen, editingHolding]);

  const handleAssetSelect = (asset) => {
    if (!asset) return;
    const rawItem = asset.raw || asset;
    // Prefer the search result's OWN id (asset.id) — UniversalAssetSearch.jsx always constructs
    // a correct, canonical id for every item it produces. asset.raw is a thinner spread of the
    // underlying adapter/catalog record and can lack its own `.id` entirely (e.g. Emofid/Charisma
    // fund items never set raw.id), which used to silently fall back to a bare symbol like "عیار".
    const rawId = asset.id || rawItem.id || rawItem.priceType || rawItem.symbol || '';
    const cleanId = String(rawId).replace(/^src_def_/, '').replace(/^derived_/, '');
    const canonicalSpec = getCanonicalAssetSpec(cleanId || rawId || rawItem.symbol);
    const resolvedId = canonicalSpec?.id || cleanId || rawId;

    const resolvedCat = getItemCategory(rawItem);
    const resolvedUnit = getItemUnit(rawItem);
    const isCustom = resolvedCat === 'custom' || resolvedId === 'custom' || resolvedId.startsWith('custom_');
    // Only a REAL Tehran Stock Exchange symbol should get the flat "bourse_SYMBOL" id — identified
    // by its actual source, not by category: Emofid/Charisma funds also carry category
    // 'bourse_fund' but must keep their own src_def_X__symbol id, or their holdings silently split
    // into a second, differently-named duplicate every time this runs (the bare symbol "عیار" was
    // previously mistaken for the bourse stock ticker "عیار").
    const isBourse = asset.sourceId === 'src_def_bourse' || rawItem.sourceId === 'src_def_bourse';

    if (isBourse) {
      const symCode = (rawItem.symbol || rawItem.s || resolvedId.replace('bourse_', '')).trim();
      setSelectedAssetId(resolvedId.includes('__') ? resolvedId : `bourse_${symCode}`);
      setSelectedBourseSymbol({
        ...rawItem,
        symbol: symCode,
        priceToman: rawItem.priceToman || (rawItem.priceRial ? Math.round(rawItem.priceRial / 10) : rawItem.price || 0),
      });
      setCustomName(resolveAssetDisplayName(resolvedId, rawItem));
      setCustomUnit(resolvedUnit);
      const p = rawItem.priceToman || (rawItem.priceRial ? Math.round(rawItem.priceRial / 10) : rawItem.price || '');
      setCustomCurrentPrice(p ? String(p) : '');
    } else if (isCustom) {
      setSelectedAssetId('custom');
      setSelectedBourseSymbol(null);
      setCustomName(rawItem.name || '');
      setCustomUnit(resolvedUnit);
      if (rawItem.price > 0) {
        setCustomCurrentPrice(String(Math.round(rawItem.price)));
      }
    } else {
      // Canonical assets (gold, coin, forex) AND catalog items (charisma_plans__gold, ...)
      setSelectedAssetId(resolvedId);
      setSelectedBourseSymbol(null);
      setCustomName(resolveAssetDisplayName(resolvedId, rawItem));
      setCustomUnit(resolvedUnit);
      const p = rawItem.priceToman || (rawItem.priceRial ? Math.round(rawItem.priceRial / 10) : rawItem.price || '');
      if (p > 0) {
        setCustomCurrentPrice(String(Math.round(p)));
      }
    }
  };

  const handleTodayClick = () => {
    let currentPrice = null;

    // 1. If bourse asset
    if (selectedBourseSymbol?.priceToman > 0) {
      currentPrice = Math.round(selectedBourseSymbol.priceToman);
    }
    // 2. If custom current price was entered
    else if (customCurrentPrice) {
      const parsed = parseInputNumber(customCurrentPrice);
      if (parsed && parsed > 0) currentPrice = Math.round(parsed);
    }

    const cleanId = (selectedAssetId || '').replace(/^src_def_/, '').replace(/^derived_/, '').trim();

    // 3. realPriceMap if passed
    if (!currentPrice && realPriceMap) {
      const p = realPriceMap[selectedAssetId] || realPriceMap[cleanId] || realPriceMap[cleanId.toLowerCase()];
      if (p && Number(p) > 0) currentPrice = Math.round(Number(p));
    }

    // 4. pricing context
    if (!currentPrice && pricing) {
      if (typeof pricing.getAssetPrice === 'function') {
        const p = pricing.getAssetPrice(cleanId) || pricing.getAssetPrice(selectedAssetId);
        if (p && Number(p) > 0) currentPrice = Math.round(Number(p));
      }
      if (!currentPrice && pricing.priceMap) {
        const p = pricing.priceMap[cleanId] || pricing.priceMap[cleanId.toLowerCase()] || pricing.priceMap[selectedAssetId];
        if (p && Number(p) > 0) currentPrice = Math.round(Number(p));
      }
    }

    // 5. rates prop fallback
    if (!currentPrice && rates) {
      const r = rates[cleanId] || rates[cleanId.toLowerCase()] || rates[selectedAssetId];
      const p = r?.price || r?.market || r?.expected_price || r;
      if (p && Number(p) > 0) currentPrice = Math.round(Number(p));
    }

    if (currentPrice && currentPrice > 0) {
      setBuyPrice(String(currentPrice));
    }
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    const parsedAmount = parseInputNumber(amount);
    if (!parsedAmount || parsedAmount <= 0) return;

    let finalAssetId = selectedAssetId;

    if (selectedAssetId === 'custom' || selectedAssetId.startsWith('custom_')) {
      finalAssetId = editingHolding?.assetId || `custom_${Date.now()}`;
    } else if (selectedBourseSymbol || ['bourse', 'bourse_fund'].includes(getItemCategory(selectedAssetId))) {
      const sym = selectedBourseSymbol?.symbol || selectedAssetId.replace(/^bourse_/, '').replace(/^src_def_bourse__/, '');
      finalAssetId = `bourse_${sym}`;
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

    onSubmit?.({
      id: editingHolding?.id,
      assetId: finalAssetId,
      amount: parsedAmount,
      buyPrice: finalBuyPrice,
      buyDate: buyDate.trim(),
      notes: notes.trim(),
      customPrice: parseInputNumber(customCurrentPrice) || 0,
      referenceAssetId: hasReference ? referenceAsset.id : '',
      referenceQuantity: hasReference ? parsedReferenceQuantity : 0,
    });
  };

  // Proactively disable the submit button instead of alert()-ing after a click — matches
  // TransactionForm.jsx's isFormValid pattern for the sibling "add a financial item" form.
  const parsedAmountForValidation = parseInputNumber(amount);
  const isAmountValid = parsedAmountForValidation !== null && parsedAmountForValidation > 0;
  const isFormValid = isAmountValid && !submitting;

  const selectedCategory = getItemCategory(selectedAssetId);
  const cleanSelectedId = (selectedAssetId || '').replace(/^src_def_/, '').replace(/^derived_/, '');
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
    : (isModalCustom ? (customName || 'دارایی شخصی') : (resolveAssetDisplayName(cleanSelectedId, null) || customName || selectedAssetId || 'انتخاب نشده'));

  const unitLabel = getItemUnit(selectedAssetId, null, isModalFund ? 'واحد' : (isModalBourse ? 'برگ سهام' : (customUnit || 'واحد')));

  return (
    <Modal
      isOpen={isOpen}
      onClose={!submitting ? onClose : undefined}
      title={editingHolding ? 'ویرایش دارایی' : 'افزودن دارایی جدید به پورتفو'}
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
                : 'افزودن دارایی'}
          </button>
        </div>
      }
    >
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
            <strong className="summary-val" style={{ color: '#93c5fd' }}>
              {selectedAssetTitle}
            </strong>
          </div>
        </div>

        <UniversalAssetSearch
          mode="picker"
          selectedAssetId={selectedAssetId}
          showCategories={true}
          onSelect={handleAssetSelect}
          rates={rates}
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
          <label>قیمت خرید هر {unitLabel} (تومان)</label>
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
        label="تاریخ خرید (شمسی)"
      />

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
