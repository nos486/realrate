/**
 * TransactionForm.jsx — Modal form to create or edit a buy/sell transaction
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  AlertTriangle,
  Info,
} from 'lucide-react';
import Modal from '../../../shared/ui/Modal.jsx';
import NumericInput from '../../../shared/ui/NumericInput.jsx';
import UniversalAssetSearch from '../../../components/UniversalAssetSearch.jsx';
import ShamsiDatePicker, { getTodayShamsi } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { parseInputNumber } from '../../portfolio/utils/holdingHelpers.js';
import {
  getCanonicalAssetSpec,
  resolveItemCategory,
} from '../../../utils/financialSpecs.js';
import {
  resolveAssetDisplayName,
  resolveAssetUnit,
} from '../../../utils/sourceRegistry.js';

export default function TransactionForm({
  isOpen,
  onClose,
  onSubmit,
  editingTransaction = null,
  submitting = false,
  rates = null,
  realPriceMap = null,
  currentHoldingsMap = {}, // assetId -> { amount, unit } for sell warnings
}) {
  const [assetId, setAssetId] = useState('gold_18k');
  const [assetName, setAssetName] = useState('طلای ۱۸ عیار');
  const [assetType, setAssetType] = useState('gold');
  const [unit, setUnit] = useState('گرم');
  const [transactionType, setTransactionType] = useState('buy'); // 'buy' | 'sell'
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [transactionDate, setTransactionDate] = useState(() => getTodayShamsi());
  const [notes, setNotes] = useState('');

  // Reset or populate on open/edit
  useEffect(() => {
    if (!isOpen) return;

    if (editingTransaction) {
      setAssetId(editingTransaction.assetId || 'gold_18k');
      setAssetName(editingTransaction.assetName || resolveAssetDisplayName(editingTransaction.assetId) || 'دارایی');
      setAssetType(editingTransaction.assetType || 'custom');
      setUnit(editingTransaction.unit || 'واحد');
      setTransactionType(editingTransaction.transactionType || 'buy');
      setQuantity(editingTransaction.quantity !== undefined ? String(editingTransaction.quantity) : '');
      setUnitPrice(editingTransaction.unitPrice !== undefined ? String(editingTransaction.unitPrice) : '');
      setTransactionDate(editingTransaction.transactionDate || getTodayShamsi());
      setNotes(editingTransaction.notes || '');
    } else {
      setAssetId('gold_18k');
      setAssetName('طلای ۱۸ عیار');
      setAssetType('gold');
      setUnit('گرم');
      setTransactionType('buy');
      setQuantity('');
      setUnitPrice('');
      setTransactionDate(getTodayShamsi());
      setNotes('');
    }
  }, [isOpen, editingTransaction]);

  // Asset selection handler
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
        rawItem.name?.includes('صندوق')
      );
      setAssetId(`bourse_${symCode}`);
      setAssetName(rawItem.name || (isFund ? `صندوق ${symCode}` : `سهام ${symCode}`));
      setAssetType(isFund ? 'bourse_fund' : 'bourse');
      setUnit(isFund ? 'واحد' : 'برگ سهم');

      const liveP = rawItem.priceToman || (rawItem.priceRial ? Math.round(rawItem.priceRial / 10) : rawItem.price || 0);
      if (!unitPrice && liveP > 0) {
        setUnitPrice(String(liveP));
      }
    } else if (isCustom) {
      setAssetId(resolvedId.startsWith('custom_') ? resolvedId : `custom_${Date.now()}`);
      setAssetName(rawItem.name || rawItem.title || 'دارایی شخصی');
      setAssetType('custom');
      setUnit(rawItem.unit || 'واحد');
    } else {
      // Canonical assets (gold, coin, forex) AND catalog items (charisma_plans__gold, ...)
      const displayId = canonicalSpec?.id || cleanId || rawId;
      setAssetId(displayId);
      setAssetName(resolveAssetDisplayName(displayId, rawItem));
      setAssetType(resolvedCat);
      setUnit(resolveAssetUnit(displayId, rawItem));

      const liveP = realPriceMap?.[cleanAssetId(displayId)] || realPriceMap?.[displayId] || rawItem.priceToman || rawItem.price || 0;
      if (!unitPrice && liveP > 0) {
        setUnitPrice(String(liveP));
      }
    }
  };

  const cleanAssetId = (id) => String(id || '').replace(/^src_def_/, '').replace(/^derived_/, '');

  // Validation logic
  const quantityNum = parseInputNumber(quantity);
  const unitPriceNum = parseInputNumber(unitPrice);
  const isDateValid = Boolean(transactionDate && transactionDate.trim().length >= 8);
  const isQuantityValid = quantityNum !== null && quantityNum > 0;
  const isUnitPriceValid = unitPriceNum !== null && unitPriceNum > 0;
  const isFormValid = isDateValid && isQuantityValid && isUnitPriceValid && !submitting;

  // Total calculated value
  const totalValue = isQuantityValid && isUnitPriceValid ? quantityNum * unitPriceNum : 0;

  // Sell warning: check available balance for asset
  const availableBalance = currentHoldingsMap[assetId]?.amount || 0;
  const isSellingOverBalance = transactionType === 'sell' && isQuantityValid && quantityNum > availableBalance;

  const handleSubmit = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!isFormValid) return;

    onSubmit({
      id: editingTransaction?.id,
      assetId,
      assetName,
      assetType,
      unit,
      transactionType,
      quantity: quantityNum,
      unitPrice: unitPriceNum,
      transactionDate: transactionDate.trim(),
      notes: notes.trim(),
      createdAt: editingTransaction?.createdAt,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingTransaction ? 'ویرایش تراکنش' : 'ثبت تراکنش جدید'}
      icon={<Receipt size={18} />}
      maxWidth="540px"
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
          <button
            type="submit"
            className="btn-primary"
            disabled={!isFormValid}
          >
            {submitting ? 'در حال ثبت...' : editingTransaction ? 'به‌روزرسانی تراکنش' : 'ثبت تراکنش'}
          </button>
        </div>
      }
    >
      {/* 1. Transaction Type Toggle */}
      <div className="form-item">
        <label>نوع تراکنش <span className="field-required">*</span></label>
        <div className="tx-type-toggle-bar">
          <button
            type="button"
            className={`tx-type-btn buy ${transactionType === 'buy' ? 'active' : ''}`}
            onClick={() => setTransactionType('buy')}
          >
            <ArrowDownLeft size={16} style={{ verticalAlign: 'middle', marginLeft: '6px' }} />
            خرید (ورود دارایی)
          </button>
          <button
            type="button"
            className={`tx-type-btn sell ${transactionType === 'sell' ? 'active' : ''}`}
            onClick={() => setTransactionType('sell')}
          >
            <ArrowUpRight size={16} style={{ verticalAlign: 'middle', marginLeft: '6px' }} />
            فروش (خروج دارایی)
          </button>
        </div>
      </div>

      {/* 2. Asset Selector */}
      <div className="form-item">
        <label>دارایی انتخابی <span className="field-required">*</span></label>
        <UniversalAssetSearch
          mode="picker"
          selectedAssetId={assetId}
          onSelect={handleAssetSelect}
          placeholder="جستجو و انتخاب دارایی..."
        />
        <div className="asset-selected-preview-pill">
          <span>نام انتخابی: <strong>{assetName}</strong></span>
          <span className="unit-badge-pill">واحد: {unit}</span>
        </div>
      </div>

      {/* 3. Quantity & Unit Price (2-column layout) */}
      <div className="form-row-2col">
        <div className="form-item">
          <label>
            مقدار ({unit}) <span className="field-required">*</span>
          </label>
          <NumericInput
            value={quantity}
            onValueChange={setQuantity}
            allowDecimals={true}
            placeholder="مثلاً ۱.۵ یا ۱۰۰"
            required
            autoFocus={!editingTransaction}
            className="form-input"
          />
        </div>

        <div className="form-item">
          <label>
            قیمت واحد معامله (تومان) <span className="field-required">*</span>
          </label>
          <NumericInput
            value={unitPrice}
            onValueChange={setUnitPrice}
            allowDecimals={false}
            placeholder="قیمت هر واحد در لحظه معامله"
            required
            className="form-input"
          />
        </div>
      </div>

      {/* Total Turnover Summary Pill */}
      {totalValue > 0 && (
        <div className="tx-summary-preview-box">
          <span className="tx-summary-label">ارزش کل معامله:</span>
          <strong className="tx-summary-value">{Math.round(totalValue).toLocaleString('fa-IR')} تومان</strong>
        </div>
      )}

      {/* Warning for overselling */}
      {isSellingOverBalance && (
        <div className="tx-warning-banner">
          <AlertTriangle size={15} style={{ verticalAlign: 'middle', marginLeft: '6px', flexShrink: 0 }} />
          <span>
            توجه: مقدار فروش ({Number(quantityNum).toLocaleString('fa-IR')} {unit}) بیشتر از موجودی محاسبه‌شده فعلی این دارایی ({Number(availableBalance).toLocaleString('fa-IR')} {unit}) است. (غیرمسدودکننده)
          </span>
        </div>
      )}

      {/* 4. Transaction Date */}
      <div className="form-item">
        <label>تاریخ معامله <span className="field-required">*</span></label>
        <ShamsiDatePicker
          value={transactionDate}
          onChange={setTransactionDate}
        />
        <span className="field-sub-note">تاریخ دقیق معامله برای ترتیب زمانی و گزارش‌گیری.</span>
      </div>

      {/* 5. Notes */}
      <div className="form-item">
        <label>یادداشت (اختیاری)</label>
        <input
          type="text"
          placeholder="مثلاً: خرید پله‌ای، صرافی فلان، کارمزد و..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="form-input"
        />
      </div>
    </Modal>
  );
}
