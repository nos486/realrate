import React, { useState, useEffect } from 'react';
import { Coins } from 'lucide-react';
import Modal from '../../../shared/ui/Modal.jsx';
import NumericInput from '../../../shared/ui/NumericInput.jsx';
import UniversalAssetSearch from '../../../components/UniversalAssetSearch.jsx';
import ShamsiDatePicker from './ShamsiDatePicker.jsx';
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

  // Initialize or reset form state on open / edit
  useEffect(() => {
    if (!isOpen) return;

    if (editingHolding) {
      setSelectedAssetId(editingHolding.assetId || 'gold_18k');
      setAmount(editingHolding.amount ? String(editingHolding.amount) : '');
      setBuyPrice(editingHolding.buyPrice ? String(editingHolding.buyPrice) : '');
      setBuyDate(editingHolding.buyDate || '');
      setNotes(editingHolding.notes || '');

      if (editingHolding.category === 'custom' || editingHolding.assetType === 'custom') {
        setCustomName(editingHolding.assetName || editingHolding.name || '');
        setCustomUnit(editingHolding.unit || 'واحد');
        setCustomCurrentPrice(editingHolding.customPrice ? String(editingHolding.customPrice) : '');
      } else {
        setCustomName('');
        setCustomUnit('واحد');
        setCustomCurrentPrice('');
      }

      if (
        editingHolding.assetType === 'bourse' ||
        editingHolding.assetType === 'bourse_fund' ||
        editingHolding.assetId?.startsWith('bourse_')
      ) {
        setSelectedBourseSymbol({
          symbol: editingHolding.assetId.replace('bourse_', ''),
          name: editingHolding.assetName,
          isFund: editingHolding.assetType === 'bourse_fund',
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
    }
  }, [isOpen, editingHolding]);

  const handleAssetSelect = (asset) => {
    if (!asset) return;
    const rawItem = asset.raw || asset;
    const rawId = rawItem.id || rawItem.priceType || rawItem.symbol || '';
    const cleanId = String(rawId).replace(/^src_def_/, '').replace(/^derived_/, '');
    const canonicalSpec = getCanonicalAssetSpec(cleanId || rawId || rawItem.symbol);
    const resolvedId = canonicalSpec?.id || cleanId || rawId;

    const resolvedCat = resolveItemCategory(rawItem);
    const isPlan = resolvedId.startsWith('charisma_plans') || rawItem.category === 'charisma_plans' || rawItem.badge === 'طرح';
    const isBourse = !isPlan && (resolvedCat === 'bourse' || resolvedCat === 'bourse_fund' || resolvedId.startsWith('bourse_'));
    const isCustom = resolvedCat === 'custom' || resolvedId === 'custom' || resolvedId.startsWith('custom_');

    if (isBourse) {
      const symCode = (rawItem.symbol || rawItem.s || resolvedId.replace('bourse_', '')).trim();
      const isFund = Boolean(
        rawItem.isFund ||
        rawItem.f === 1 ||
        resolvedCat === 'bourse_fund' ||
        rawItem.category === 'bourse_fund' ||
        rawItem.category?.includes('صندوق') ||
        rawItem.name?.includes('صندوق') ||
        rawItem.title?.includes('صندوق')
      );
      setSelectedAssetId(`bourse_${symCode}`);
      setSelectedBourseSymbol({
        ...rawItem,
        symbol: symCode,
        isFund,
        priceToman: rawItem.priceToman || (rawItem.priceRial ? Math.round(rawItem.priceRial / 10) : rawItem.price || 0),
      });
      setCustomName(rawItem.name || (isFund ? `صندوق ${symCode}` : `سهام ${symCode}`));
      setCustomUnit(isFund ? 'واحد' : 'برگ سهم');
      const p = rawItem.priceToman || (rawItem.priceRial ? Math.round(rawItem.priceRial / 10) : rawItem.price || '');
      setCustomCurrentPrice(p ? String(p) : '');
    } else if (isCustom) {
      setSelectedAssetId('custom');
      setSelectedBourseSymbol(null);
      setCustomName(rawItem.name || '');
      setCustomUnit(rawItem.unit || 'واحد');
      if (rawItem.price > 0) {
        setCustomCurrentPrice(String(Math.round(rawItem.price)));
      }
    } else {
      // Canonical assets (gold, coin, forex) AND catalog items (charisma_plans__gold, ...)
      setSelectedAssetId(resolvedId);
      setSelectedBourseSymbol(null);
      setCustomName(resolveAssetDisplayName(resolvedId, rawItem));
      setCustomUnit(resolveAssetUnit(resolvedId, rawItem));
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
    if (!parsedAmount || parsedAmount <= 0) {
      alert('لطفاً مقدار دارایی را به درستی وارد کنید.');
      return;
    }

    const parsedBuyPrice = parseInputNumber(buyPrice);

    let finalAssetId = selectedAssetId;
    let finalAssetName = '';
    let finalUnit = 'واحد';
    let finalAssetType = 'gold';

    if (selectedAssetId === 'custom' || selectedAssetId.startsWith('custom_')) {
      finalAssetId = editingHolding?.assetId || `custom_${Date.now()}`;
      finalAssetName = customName.trim() || 'دارایی شخصی';
      finalUnit = customUnit.trim() || 'واحد';
      finalAssetType = 'custom';
    } else if (selectedBourseSymbol || selectedAssetId.startsWith('bourse_')) {
      const sym = selectedBourseSymbol?.symbol || selectedAssetId.replace('bourse_', '');
      finalAssetId = `bourse_${sym}`;
      finalAssetName = selectedBourseSymbol?.name || sym;
      finalAssetType = selectedBourseSymbol?.isFund ? 'bourse_fund' : 'bourse';
      finalUnit = selectedBourseSymbol?.isFund ? 'واحد' : 'برگ سهم';
    } else {
      finalAssetType = resolveCategory(selectedAssetId);
      finalAssetName = resolveAssetDisplayName(selectedAssetId) || customName;
      finalUnit = resolveAssetUnit(selectedAssetId) || customUnit || 'واحد';
    }

    onSubmit?.({
      id: editingHolding?.id,
      assetId: finalAssetId,
      assetName: finalAssetName,
      assetType: finalAssetType,
      category: finalAssetType,
      unit: finalUnit,
      amount: parsedAmount,
      buyPrice: parsedBuyPrice !== null ? parsedBuyPrice : 0,
      buyDate: buyDate.trim(),
      notes: notes.trim(),
      customPrice: parseInputNumber(customCurrentPrice) || 0,
    });
  };

  const cleanSelectedId = (selectedAssetId || '').replace(/^src_def_/, '').replace(/^derived_/, '');
  const isModalBourse =
    selectedAssetId?.startsWith('bourse_') ||
    selectedBourseSymbol !== null ||
    selectedAssetId === 'bourse' ||
    selectedAssetId === 'bourse_fund';
  const isModalFund = Boolean(
    selectedBourseSymbol?.isFund ||
    selectedAssetId === 'bourse_fund' ||
    (selectedAssetId?.startsWith('bourse_') && selectedBourseSymbol?.isFund)
  );
  const isModalCustom = cleanSelectedId === 'custom' || selectedAssetId?.startsWith('custom_');

  const selectedAssetTitle = isModalBourse
    ? (selectedBourseSymbol?.symbol ? `${selectedBourseSymbol.symbol} (${selectedBourseSymbol.name || 'سهام بورس'})` : customName || 'سهام بورس')
    : (isModalCustom ? (customName || 'دارایی شخصی') : (resolveAssetDisplayName(cleanSelectedId, null) || customName || selectedAssetId || 'انتخاب نشده'));

  const unitLabel = isModalBourse
    ? (isModalFund ? 'واحد' : 'برگ سهام')
    : (isModalCustom ? (customUnit || 'واحد') : (resolveAssetUnit(cleanSelectedId, null) || 'واحد'));

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
          <button type="submit" className="btn-primary" disabled={submitting}>
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

      {/* Buy Price Input */}
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
