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
import ReferenceAssetInputs from '../../portfolio/components/ReferenceAssetInputs.jsx';
import { parseInputNumber } from '../../portfolio/utils/holdingHelpers.js';
import {
  getCanonicalAssetSpec,
  resolveItemCategory,
} from '../../../utils/financialSpecs.js';
import {
  resolveAssetDisplayName,
  resolveAssetUnit,
} from '../../../utils/sourceRegistry.js';
import {
  getItemCategory,
  getItemUnit,
} from '../../../config/displayEngine.js';

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
  const [referenceAsset, setReferenceAsset] = useState(null);
  const [referenceQuantity, setReferenceQuantity] = useState('');
  const [referencePriceToman, setReferencePriceToman] = useState('');

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

      if (editingTransaction.referenceAssetId && editingTransaction.referenceQuantity) {
        const refId = editingTransaction.referenceAssetId;
        setReferenceAsset({
          id: refId,
          name: resolveAssetDisplayName(refId) || refId,
          unit: resolveAssetUnit(refId) || 'واحد',
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
      setAssetId('gold_18k');
      setAssetName('طلای ۱۸ عیار');
      setAssetType('gold');
      setUnit('گرم');
      setTransactionType('buy');
      setQuantity('');
      setUnitPrice('');
      setTransactionDate(getTodayShamsi());
      setNotes('');
      setReferenceAsset(null);
      setReferenceQuantity('');
      setReferencePriceToman('');
    }
  }, [isOpen, editingTransaction]);

  // Asset selection handler
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
    // 'bourse_fund' but must keep their own src_def_X__symbol id, or their transactions/holdings
    // silently split into a second, differently-named duplicate every time this runs (the bare
    // symbol "عیار" was previously mistaken for the bourse stock ticker "عیار").
    const isBourse = asset.sourceId === 'src_def_bourse' || rawItem.sourceId === 'src_def_bourse';

    if (isBourse) {
      const symCode = (rawItem.symbol || rawItem.s || resolvedId.replace('bourse_', '')).trim();
      setAssetId(resolvedId.includes('__') ? resolvedId : `bourse_${symCode}`);
      setAssetName(resolveAssetDisplayName(resolvedId, rawItem));
      setAssetType(resolvedCat);
      setUnit(resolvedUnit);

      const liveP = rawItem.priceToman || (rawItem.priceRial ? Math.round(rawItem.priceRial / 10) : rawItem.price || 0);
      if (!unitPrice && liveP > 0) {
        setUnitPrice(String(liveP));
      }
    } else if (isCustom) {
      setAssetId(resolvedId.startsWith('custom_') ? resolvedId : `custom_${Date.now()}`);
      setAssetName(rawItem.name || rawItem.title || 'دارایی شخصی');
      setAssetType('custom');
      setUnit(resolvedUnit);
    } else {
      // Canonical assets (gold, coin, forex) AND catalog items (charisma_plans__gold, ...)
      const displayId = canonicalSpec?.id || cleanId || rawId;
      setAssetId(displayId);
      setAssetName(resolveAssetDisplayName(displayId, rawItem));
      setAssetType(resolvedCat);
      setUnit(resolvedUnit);

      const liveP = realPriceMap?.[cleanAssetId(displayId)] || realPriceMap?.[displayId] || rawItem.priceToman || rawItem.price || 0;
      if (!unitPrice && liveP > 0) {
        setUnitPrice(String(liveP));
      }
    }
  };

  const cleanAssetId = (id) => String(id || '').replace(/^src_def_/, '').replace(/^derived_/, '');

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
  const isFormValid = isDateValid && isQuantityValid && isUnitPriceValid && !submitting;

  // Total calculated value
  const totalValue = isQuantityValid && isUnitPriceValid ? quantityNum * finalUnitPriceNum : 0;

  // Sell warning: check available balance for asset
  const availableBalance = currentHoldingsMap[assetId]?.amount || 0;
  const isSellingOverBalance = transactionType === 'sell' && isQuantityValid && quantityNum > availableBalance;

  const handleSubmit = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!isFormValid) return;

    onSubmit({
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

        {!hasReference && (
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
        )}
      </div>

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
      />

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
