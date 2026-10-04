import React, { useEffect, useState } from 'react';
import { ArrowLeftRight, RefreshCw, X } from 'lucide-react';
import UniversalAssetSearch from '../../../components/UniversalAssetSearch.jsx';
import NumericInput from '../../../shared/ui/NumericInput.jsx';
import { usePricing } from '../../market/index.js';
import {
  parseInputNumber,
  formatNum,
  resolveSelectedAsset,
} from '../utils/holdingHelpers.js';
import { useTradeDayPrice, tradeDayPriceNote } from '../hooks/useTradeDayPrice.js';

/**
 * Shared "paid / swapped with another asset" inputs, used identically by AddHoldingForm
 * and TransactionForm whenever an acquisition wasn't a plain Toman purchase — e.g. $512
 * paid for 5g of gold, or 5g of gold swapped for silver, or a stock sale settled in EUR.
 *
 * The reference asset can be ANY asset the app already tracks (currency, gold, silver,
 * a bourse stock, ...), picked with the exact same UniversalAssetSearch used everywhere
 * else. The user enters the TOTAL quantity of it given up (not a per-unit price) — the
 * Toman cost basis for the primary asset is derived automatically as
 * referenceQuantity × referencePriceToman ÷ primary asset's amount.
 *
 * referencePriceToman (the reference asset's OWN Toman price at trade time) is filled from
 * the trade's date (hooks/useTradeDayPrice.js): today's live price from the shared pricing
 * engine, or that day's close from the price history for a past trade — again whenever the
 * date changes. It stays editable.
 */
export default function ReferenceAssetInputs({
  referenceAsset,
  onReferenceAssetChange,
  referenceQuantity,
  onReferenceQuantityChange,
  referencePriceToman,
  onReferencePriceChange,
  newAssetAmount = 0,
  newAssetUnitLabel = 'واحد',
  // false when editing an existing record: its saved reference price reflects the ORIGINAL
  // trade date and must never be silently overwritten by today's live price.
  autoFillPrice = true,
  // The trade's date (Shamsi or ISO): a past day fills its price from the price history
  tradeDate = '',
}) {
  const pricing = usePricing();
  const [expanded, setExpanded] = useState(Boolean(referenceAsset));

  // AddHoldingForm/TransactionForm populate referenceAsset from the record being edited
  // in an effect that runs AFTER this component's first mount, so on the very first open
  // of the edit modal referenceAsset is still null at mount time (useState above then
  // freezes `expanded` at false) and only arrives a render later. Sync `expanded` to it
  // directly instead of relying on the mount-time snapshot, or the panel opens empty
  // until the modal is closed and reopened.
  useEffect(() => {
    if (referenceAsset) {
      setExpanded(true);
    }
  }, [referenceAsset]);

  const dayPrice = useTradeDayPrice({
    assetId: referenceAsset?.id || null,
    tradeDate,
    autoFill: autoFillPrice,
    pricing,
    onPrice: onReferencePriceChange,
  });

  const handlePick = (asset) => {
    const resolved = resolveSelectedAsset(asset);
    if (!resolved) return; // personal "custom" assets have no live price to reference
    // A newly picked asset starts from today's price, also when editing
    dayPrice.markAuto(resolved.id);
    onReferenceAssetChange(resolved);
  };

  const handleChangeAsset = () => {
    onReferenceAssetChange(null);
    onReferenceQuantityChange('');
    onReferencePriceChange('');
  };

  const handleClear = () => {
    handleChangeAsset();
    setExpanded(false);
  };

  const handlePriceChange = (v) => {
    dayPrice.markEdited();
    onReferencePriceChange(v);
  };

  if (!expanded) {
    return (
      <button type="button" className="btn-add-reference-asset" onClick={() => setExpanded(true)}>
        <ArrowLeftRight size={13} />
        <span>پرداخت یا تهاتر با دارایی دیگر (دلار، طلا، سهام و ...)</span>
      </button>
    );
  }

  const qtyNum = parseInputNumber(referenceQuantity) || 0;
  const priceNum = parseInputNumber(referencePriceToman) || 0;
  const totalToman = qtyNum > 0 && priceNum > 0 ? Math.round(qtyNum * priceNum) : 0;
  const perUnitToman = totalToman > 0 && newAssetAmount > 0 ? Math.round(totalToman / newAssetAmount) : 0;

  return (
    <div className="reference-asset-card">
      <div className="reference-asset-card-header">
        <span className="reference-asset-card-title">
          <ArrowLeftRight size={13} />
          پرداخت / تهاتر با دارایی دیگر
        </span>
        <button
          type="button"
          className="btn-remove-reference"
          onClick={handleClear}
          title="لغو و بازگشت به ثبت تومانی ساده"
        >
          <X size={13} />
        </button>
      </div>

      {!referenceAsset ? (
        <UniversalAssetSearch
          mode="picker"
          onSelect={handlePick}
          placeholder="جستجوی دارایی پرداختی (دلار، طلا، سهام و ...)"
        />
      ) : (
        <>
          <div className="reference-asset-selected-pill">
            <span>{referenceAsset.name}</span>
            <button type="button" onClick={handleChangeAsset} title="تغییر دارایی مرجع">
              <X size={11} />
            </button>
          </div>

          <div className="form-row-dual">
            <div className="form-item flex-1">
              <label>مقدار کل {referenceAsset.name} پرداخت‌شده ({referenceAsset.unit})</label>
              <NumericInput
                value={referenceQuantity}
                onValueChange={onReferenceQuantityChange}
                allowDecimals={true}
                placeholder="مثلاً ۵"
                className="form-input"
              />
            </div>
            <div className="form-item flex-1">
              <label>
                قیمت هر {referenceAsset.unit} {referenceAsset.name} در زمان معامله (تومان)
                <button
                  type="button"
                  className="btn-fx-rate-refresh"
                  title="قیمت در تاریخ معامله"
                  aria-label="قیمت در تاریخ معامله"
                  onClick={dayPrice.refill}
                >
                  <RefreshCw size={11} />
                </button>
              </label>
              <NumericInput
                value={referencePriceToman}
                onValueChange={handlePriceChange}
                allowDecimals={false}
                placeholder="قیمت واحد به تومان"
                className="form-input"
              />
              {tradeDayPriceNote(dayPrice.source) && <span className="field-sub-note">{tradeDayPriceNote(dayPrice.source)}</span>}
            </div>
          </div>

          {totalToman > 0 && (
            <div className="currency-cost-preview">
              معادل تومانی کل: <strong>{formatNum(totalToman)} تومان</strong>
              {perUnitToman > 0 && (
                <>
                  {' '}— هر {newAssetUnitLabel}: <strong>{formatNum(perUnitToman)} تومان</strong>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
