import React, { useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import NumericInput from '../../../shared/ui/NumericInput.jsx';
import { FOREX_SPECS, resolveCurrencyToTomanRate } from '../../../utils/financialSpecs.js';
import { parseInputNumber, formatNum } from '../utils/holdingHelpers.js';

/**
 * Shared currency-selector + foreign-currency cost-basis inputs, used identically by
 * AddHoldingForm and TransactionForm whenever a purchase wasn't paid in Toman.
 *
 * Cost basis stays anchored to what the user actually paid in the foreign currency
 * (`nativePrice`); the FX rate is a separate, editable field (defaulting to today's live
 * rate) since the rate AT THE TIME of a past purchase is rarely today's rate and this app
 * has no historical FX database. The Toman-equivalent price the rest of the app relies on
 * is always native price × that rate — reported back via onComputedTomanPrice.
 */
export default function CurrencyCostInputs({
  currency,
  onCurrencyChange,
  nativePrice,
  onNativePriceChange,
  fxRate,
  onFxRateChange,
  unitLabel = 'واحد',
  realPriceMap = null,
  usdToman = 0,
  priceLabel = 'قیمت خرید',
  // false when editing an existing record: its saved FX rate reflects the rate at the
  // ORIGINAL purchase date and must never be silently overwritten by today's live rate.
  autoFillFxRate = true,
}) {
  const userEditedFxRate = useRef(!autoFillFxRate);
  const prevCurrency = useRef(currency);

  // Prefill the FX-rate field with today's live rate whenever the user switches to a new
  // currency, unless they've already typed their own rate for that selection (or this is
  // an edit form, where the originally-recorded rate must be preserved by default).
  useEffect(() => {
    if (currency === 'IRT') {
      prevCurrency.current = currency;
      return;
    }
    if (currency !== prevCurrency.current) {
      userEditedFxRate.current = !autoFillFxRate;
      prevCurrency.current = currency;
    }
    if (userEditedFxRate.current) return;
    const live = resolveCurrencyToTomanRate(currency, realPriceMap, usdToman);
    if (live > 0) {
      onFxRateChange(String(live));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, autoFillFxRate]);

  const handleCurrencySelect = (e) => {
    onCurrencyChange(e.target.value);
  };

  const handleFxRateChange = (v) => {
    userEditedFxRate.current = true;
    onFxRateChange(v);
  };

  const spec = FOREX_SPECS.find((c) => c.code === currency);
  const nativeNum = parseInputNumber(nativePrice) || 0;
  const fxNum = parseInputNumber(fxRate) || 0;
  const computedToman = nativeNum > 0 && fxNum > 0 ? Math.round(nativeNum * fxNum) : 0;

  return (
    <div className="currency-cost-inputs">
      <div className="form-item">
        <label>ارز پرداخت</label>
        <select className="form-input" value={currency} onChange={handleCurrencySelect}>
          <option value="IRT">تومان</option>
          {FOREX_SPECS.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.name} ({c.code})
            </option>
          ))}
        </select>
      </div>

      {currency !== 'IRT' && (
        <>
          <div className="form-row-dual">
            <div className="form-item flex-1">
              <label>
                {priceLabel} هر {unitLabel} به {spec?.name || currency}
              </label>
              <NumericInput
                value={nativePrice}
                onValueChange={onNativePriceChange}
                allowDecimals={true}
                placeholder={`مثلاً ${spec?.symbol || ''}102.4`}
                className="form-input"
              />
            </div>
            <div className="form-item flex-1">
              <label>
                نرخ {spec?.name || currency} در زمان خرید (تومان)
                <button
                  type="button"
                  className="btn-fx-rate-refresh"
                  title="استفاده از نرخ لحظه‌ای امروز"
                  onClick={() => handleFxRateChange(String(resolveCurrencyToTomanRate(currency, realPriceMap, usdToman) || ''))}
                >
                  <RefreshCw size={11} />
                </button>
              </label>
              <NumericInput
                value={fxRate}
                onValueChange={handleFxRateChange}
                allowDecimals={false}
                placeholder="نرخ تبدیل به تومان"
                className="form-input"
              />
            </div>
          </div>

          {computedToman > 0 && (
            <div className="currency-cost-preview">
              معادل تومانی: <strong>{formatNum(computedToman)} تومان</strong> به ازای هر {unitLabel}
            </div>
          )}
        </>
      )}
    </div>
  );
}
