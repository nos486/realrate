import React, { useState, useEffect } from 'react';
import Modal from '../../../shared/ui/Modal.jsx';
import NumericInput from '../../../shared/ui/NumericInput.jsx';
import UniversalAssetSearch from '../../../components/UniversalAssetSearch.jsx';
import ShamsiDatePicker from './ShamsiDatePicker.jsx';
import { parseInputNumber } from '../utils/holdingHelpers.js';
import { resolveItemCategory } from '../../../utils/financialSpecs.js';

export default function AddHoldingForm({
  isOpen,
  onClose,
  onSubmit,
  editingHolding = null,
  submitting = false,
  rates = null,
}) {
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

      if (editingHolding.assetType === 'bourse' || editingHolding.assetType === 'bourse_fund' || editingHolding.assetId?.startsWith('bourse_')) {
        setSelectedBourseSymbol({
          symbol: editingHolding.assetId.replace('bourse_', ''),
          name: editingHolding.assetName,
          isFund: editingHolding.assetType === 'bourse_fund',
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
    setSelectedAssetId(asset.id);
    if (asset.category === 'custom') {
      setCustomName(asset.name || '');
      setCustomUnit(asset.unit || 'واحد');
    }
    if (asset.category === 'bourse' || asset.category === 'bourse_fund') {
      setSelectedBourseSymbol({
        symbol: asset.id.replace('bourse_', ''),
        name: asset.name,
        isFund: asset.category === 'bourse_fund',
      });
    } else {
      setSelectedBourseSymbol(null);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
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
      finalAssetType = resolveItemCategory(selectedAssetId);
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingHolding ? 'ویرایش دارایی' : 'افزودن دارایی جدید به پورتفو'}
    >
      <form onSubmit={handleSubmit} className="holding-modal-form">
        {/* Universal Asset Picker */}
        <div className="form-item">
          <label>نوع و مشخصات دارایی</label>
          <UniversalAssetSearch
            value={selectedAssetId}
            onSelect={handleAssetSelect}
            rates={rates}
          />
        </div>

        {/* Custom Asset Specific Fields */}
        {(selectedAssetId === 'custom' || selectedAssetId.startsWith('custom_')) && (
          <div className="custom-fields-grid">
            <div className="form-item">
              <label>نام دارایی شخصی</label>
              <input
                type="text"
                className="form-input"
                placeholder="مثلاً زمین دماوند، خودرو، نقاشی..."
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                required
              />
            </div>
            <div className="form-item">
              <label>واحد اندازه‌گیری</label>
              <input
                type="text"
                className="form-input"
                placeholder="متر، عدد، تن..."
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="form-grid-2">
          {/* Amount Input */}
          <div className="form-item">
            <label>مقدار / تعداد دارایی</label>
            <NumericInput
              value={amount}
              onChange={setAmount}
              placeholder="مثلاً ۱.۵ یا ۱۰"
              allowDecimals={true}
              required
            />
          </div>

          {/* Buy Price Input */}
          <div className="form-item">
            <label>قیمت خرید واحد (اختیاری)</label>
            <NumericInput
              value={buyPrice}
              onChange={setBuyPrice}
              placeholder="مبلغ هر واحد به تومان..."
              allowDecimals={false}
              affix="تومان"
            />
          </div>
        </div>

        <div className="form-grid-2">
          {/* Shamsi Date Picker */}
          <ShamsiDatePicker
            value={buyDate}
            onChange={setBuyDate}
            label="تاریخ خرید (شمسی)"
          />

          {/* Notes Input */}
          <div className="form-item">
            <label>یادداشت یا توضیحات</label>
            <input
              type="text"
              className="form-input"
              placeholder="مثلاً خرید از بورس یا بازار تهران..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="modal-actions-row">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
            انصراف
          </button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'در حال ثبت...' : (editingHolding ? 'ذخیره تغییرات' : 'افزودن دارایی')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
