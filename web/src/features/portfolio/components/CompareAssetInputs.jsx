import React, { useEffect, useState } from 'react';
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
import { useDailyHistory } from '../../market/dailyHistory.js';
import { tradeDayIso } from '../hooks/useTradeDayPrice.js';
import { todayIso } from '../../../shared/utils/dates.js';

/**
 * "What if I had bought something else instead" inputs for AddHoldingForm: a comparison asset
 * (any priced asset — gold, a currency, a stock, ...). Nothing is paid with it; the portfolio
 * shows, next to the holding's own Toman P&L, what the same Toman cost would be worth today had
 * it bought the comparison asset (holdingHelpers.computeCompareAssetPnl).
 *
 * Its price on the purchase day is read from the daily price history by the purchase date, and is
 * not stored: the field holds only a price the user types over it. A purchase without a date has
 * no day to read, so AddHoldingForm stores today's price for it.
 */
export default function CompareAssetInputs({
  compareAsset,
  onCompareAssetChange,
  comparePriceToman,
  onComparePriceChange,
  totalCostToman = 0,
  // The purchase date (Shamsi or ISO); empty: an opening balance, priced today
  tradeDate = '',
}) {
  const pricing = usePricing();
  const [expanded, setExpanded] = useState(Boolean(compareAsset));

  // The edit form sets compareAsset after this mounts: open the panel when it arrives
  useEffect(() => {
    if (compareAsset) setExpanded(true);
  }, [compareAsset]);

  const day = tradeDayIso(tradeDate);
  const fromHistory = Boolean(day) && day < todayIso();
  const { priceAt, loading: historyLoading } = useDailyHistory(compareAsset && fromHistory ? [compareAsset.id] : []);

  const handlePick = (asset) => {
    const resolved = resolveSelectedAsset(asset);
    if (!resolved) return; // a personal asset has no market price to compare with
    onComparePriceChange('');
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

  if (!expanded) {
    return (
      <button type="button" className="btn-add-reference-asset" onClick={() => setExpanded(true)}>
        <Scale size={13} />
        <span>مقایسه با خرید دارایی دیگر (اگر به جایش طلا، دلار و ... می‌خریدم؟)</span>
      </button>
    );
  }

  const priceNow = compareAsset
    ? resolveReferencePriceToman(compareAsset.id, pricing?.priceMap, pricing?.itemMap)
    : 0;
  // The purchase day's price: from the history for a past day, today's for today or no date
  const dayPrice = fromHistory ? Math.round(priceAt(compareAsset.id, day) || 0) : priceNow;
  const typed = parseInputNumber(comparePriceToman) || 0;
  const priceThen = typed || dayPrice;
  const note = typed > 0
    ? `قیمت واردشده به جای قیمت آن روز${dayPrice > 0 ? ` (${formatNum(dayPrice)})` : ''} حساب می‌شود.`
    : fromHistory
      ? historyLoading ? 'در حال خواندن قیمت آن روز…'
        : dayPrice > 0 ? 'قیمت همان روز، از تاریخچه قیمت.' : 'قیمت آن روز در تاریخچه نیست؛ اگر می‌دانید وارد کنید.'
      : day ? 'قیمت امروز.' : 'بدون تاریخ خرید، قیمت امروز ثبت می‌شود.';
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
                title="قیمت همان روز (از تاریخچه)"
                aria-label="قیمت همان روز (از تاریخچه)"
                onClick={() => onComparePriceChange('')}
              >
                <RefreshCw size={11} />
              </button>
            </label>
            <NumericInput
              value={comparePriceToman}
              onValueChange={onComparePriceChange}
              allowDecimals={false}
              placeholder={dayPrice > 0 ? `${formatNum(dayPrice)} — قیمت آن روز` : 'قیمت واحد به تومان'}
              className="form-input"
            />
            <span className="field-sub-note">{note}</span>
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
