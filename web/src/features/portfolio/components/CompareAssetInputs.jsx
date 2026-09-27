import React, { useEffect, useRef, useState } from 'react';
import { Scale, RefreshCw, X } from 'lucide-react';
import UniversalAssetSearch from '../../../components/UniversalAssetSearch.jsx';
import NumericInput from '../../../shared/ui/NumericInput.jsx';
import { usePricing } from '../../market/index.js';
import {
  parseInputNumber,
  formatNum,
  resolveSelectedAsset,
  resolveReferencePriceToman,
} from '../utils/holdingHelpers.js';

/**
 * "What if I had bought something else instead" inputs for AddHoldingForm: a comparison asset
 * (any priced asset — gold, a currency, a stock, ...) and its Toman price on the purchase day.
 * Nothing is paid with it; the portfolio shows, next to the holding's own Toman P&L, what the
 * same Toman cost would be worth today had it bought the comparison asset
 * (holdingHelpers.computeCompareAssetPnl).
 *
 * The price defaults to today's live price (the purchase is often entered the same day) and
 * stays editable for an older purchase; an edited record keeps its saved price.
 */
export default function CompareAssetInputs({
  compareAsset,
  onCompareAssetChange,
  comparePriceToman,
  onComparePriceChange,
  totalCostToman = 0,
  autoFillPrice = true,
}) {
  const pricing = usePricing();
  const [expanded, setExpanded] = useState(Boolean(compareAsset));
  const userEditedPrice = useRef(!autoFillPrice);
  const prevAssetId = useRef(compareAsset?.id || null);

  // The edit form sets compareAsset after this mounts: open the panel when it arrives
  useEffect(() => {
    if (compareAsset) setExpanded(true);
  }, [compareAsset]);

  // Today's price for a newly picked asset (also once prices finish loading), never over a typed one
  useEffect(() => {
    const id = compareAsset?.id || null;
    if (!id) {
      prevAssetId.current = null;
      return;
    }
    // An asset set from outside (the record being edited) keeps its saved price
    if (id !== prevAssetId.current) {
      userEditedPrice.current = !autoFillPrice;
      prevAssetId.current = id;
    }
    if (userEditedPrice.current) return;
    const live = resolveReferencePriceToman(id, pricing?.priceMap, pricing?.itemMap);
    if (live > 0) onComparePriceChange(String(live));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareAsset?.id, autoFillPrice, pricing?.priceMap, pricing?.itemMap]);

  const handlePick = (asset) => {
    const resolved = resolveSelectedAsset(asset);
    if (!resolved) return; // a personal asset has no market price to compare with
    // A newly picked asset starts from today's price, also when editing
    userEditedPrice.current = false;
    prevAssetId.current = resolved.id;
    onCompareAssetChange(resolved);
  };

  const handleChangeAsset = () => {
    onCompareAssetChange(null);
    onComparePriceChange('');
  };

  const handleClear = () => {
    handleChangeAsset();
    setExpanded(false);
  };

  const handlePriceChange = (v) => {
    userEditedPrice.current = true;
    onComparePriceChange(v);
  };

  if (!expanded) {
    return (
      <button type="button" className="btn-add-reference-asset" onClick={() => setExpanded(true)}>
        <Scale size={13} />
        <span>مقایسه با خرید دارایی دیگر (اگر به جایش طلا، دلار و ... می‌خریدم؟)</span>
      </button>
    );
  }

  const priceThen = parseInputNumber(comparePriceToman) || 0;
  const priceNow = compareAsset
    ? resolveReferencePriceToman(compareAsset.id, pricing?.priceMap, pricing?.itemMap)
    : 0;
  const quantity = totalCostToman > 0 && priceThen > 0 ? totalCostToman / priceThen : 0;
  const valueNow = quantity > 0 && priceNow > 0 ? quantity * priceNow : 0;

  return (
    <div className="reference-asset-card">
      <div className="reference-asset-card-header">
        <span className="reference-asset-card-title">
          <Scale size={13} />
          مقایسه با خرید دارایی دیگر
        </span>
        <button type="button" className="btn-remove-reference" onClick={handleClear} title="حذف مقایسه">
          <X size={13} />
        </button>
      </div>

      {!compareAsset ? (
        <UniversalAssetSearch
          mode="picker"
          onSelect={handlePick}
          placeholder="جستجوی دارایی برای مقایسه (طلا، دلار، سهام و ...)"
        />
      ) : (
        <>
          <div className="reference-asset-selected-pill">
            <span>{compareAsset.name}</span>
            <button type="button" onClick={handleChangeAsset} title="تغییر دارایی مقایسه">
              <X size={11} />
            </button>
          </div>

          <div className="form-item">
            <label>
              قیمت هر {compareAsset.unit} {compareAsset.name} در روز خرید (تومان)
              <button
                type="button"
                className="btn-fx-rate-refresh"
                title="استفاده از قیمت لحظه‌ای امروز"
                onClick={() => handlePriceChange(String(priceNow || ''))}
              >
                <RefreshCw size={11} />
              </button>
            </label>
            <NumericInput
              value={comparePriceToman}
              onValueChange={handlePriceChange}
              allowDecimals={false}
              placeholder="قیمت واحد به تومان"
              className="form-input"
            />
          </div>

          {totalCostToman <= 0 ? (
            <div className="currency-cost-preview">برای مقایسه، قیمت خرید را وارد کنید.</div>
          ) : quantity > 0 && (
            <div className="currency-cost-preview">
              با {formatNum(totalCostToman)} تومان آن روز{' '}
              <strong>
                {quantity.toLocaleString('fa-IR', { maximumFractionDigits: 3 })} {compareAsset.unit} {compareAsset.name}
              </strong>{' '}
              می‌شد
              {valueNow > 0 && (
                <> که امروز <strong>{formatNum(valueNow)} تومان</strong> است</>
              )}
              .
            </div>
          )}
        </>
      )}
    </div>
  );
}
