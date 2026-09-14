import React from 'react';
import { ArrowLeftRight, ArrowRight, Coins, RefreshCw, AlertCircle } from 'lucide-react';
import Card from '../../../components/ui/Card.jsx';
import { formatNum } from '../../../utils/formatters.js';

export default function PriceConverterCard({
  selectableAssets = [],
  fromAssetId,
  setFromAssetId,
  toAssetId,
  setToAssetId,
  fromAmount,
  setFromAmount,
  swapAssets,
  convertedResult,
}) {
  const { fromAsset, toAsset, toAmount, totalToman, rate, isValid, hasRates } = convertedResult || {};

  return (
    <Card className="calculator-card" padding="lg">
      <div className="calculator-card-header">
        <div className="calc-header-icon-badge blue">
          <ArrowLeftRight size={20} />
        </div>
        <div>
          <h3 className="calc-card-title">مبدل قیمت و برابری زنده</h3>
          <p className="calc-card-desc">تبدیل لحظه‌ای میان طلا، انواع سکه، دلار، تتر و ارزهای جهانی</p>
        </div>
      </div>

      <div className="converter-form-grid">
        {/* Amount Input */}
        <div className="calc-input-group">
          <label className="calc-label" htmlFor="from-amount-input">
            مقدار مبدأ
            {fromAsset && <span className="calc-unit-hint">({fromAsset.unit || 'واحد'})</span>}
          </label>
          <div className="calc-input-wrapper">
            <input
              id="from-amount-input"
              type="number"
              step="any"
              min="0"
              value={fromAmount}
              onChange={(e) => setFromAmount(e.target.value)}
              placeholder="مثلاً ۱"
              className="calc-number-input"
            />
          </div>
        </div>

        {/* Selectors Row with Swap Button */}
        <div className="converter-selectors-row">
          {/* From Asset */}
          <div className="calc-select-col">
            <label className="calc-label" htmlFor="from-asset-select">تبدیل از</label>
            <div className="calc-select-wrapper">
              <select
                id="from-asset-select"
                value={fromAssetId}
                onChange={(e) => setFromAssetId(e.target.value)}
                className="calc-select"
              >
                {selectableAssets.map((a) => (
                  <option key={`from_${a.id}`} value={a.id} disabled={!a.hasPrice}>
                    {a.name} ({a.symbol}) {a.hasPrice ? `— ${formatNum(a.price)} ت` : '— (فاقد نرخ)'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Swap Button */}
          <div className="converter-swap-wrapper">
            <button
              type="button"
              className="btn-calc-swap"
              onClick={swapAssets}
              title="جابجایی دارایی مبدأ و مقصد"
              aria-label="جابجایی"
            >
              <ArrowLeftRight size={16} />
            </button>
          </div>

          {/* To Asset */}
          <div className="calc-select-col">
            <label className="calc-label" htmlFor="to-asset-select">تبدیل به</label>
            <div className="calc-select-wrapper">
              <select
                id="to-asset-select"
                value={toAssetId}
                onChange={(e) => setToAssetId(e.target.value)}
                className="calc-select"
              >
                {selectableAssets.map((a) => (
                  <option key={`to_${a.id}`} value={a.id} disabled={!a.hasPrice}>
                    {a.name} ({a.symbol}) {a.hasPrice ? `— ${formatNum(a.price)} ت` : '— (فاقد نرخ)'}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Conversion Result Display */}
        <div className="converter-result-box">
          {!hasRates ? (
            <div className="calc-no-rates-warning">
              <AlertCircle size={16} />
              <span>یکی از دارایی‌های انتخابی در حال حاضر فاقد کشف نرخ در بازار است.</span>
            </div>
          ) : isValid ? (
            <>
              <div className="calc-result-main">
                <span className="calc-result-label">معادل مقصد:</span>
                <div className="calc-result-value-row">
                  <strong className="calc-result-number gold-gradient-text">
                    {toAmount.toLocaleString('fa-IR', { maximumFractionDigits: 4 })}
                  </strong>
                  <span className="calc-result-unit">{toAsset?.unit} {toAsset?.name}</span>
                </div>
              </div>

              <div className="calc-result-details-row">
                <div className="calc-detail-item">
                  <span className="detail-label">ارزش کل به تومان:</span>
                  <strong className="detail-val">{formatNum(totalToman)} تومان</strong>
                </div>
                <div className="calc-detail-item">
                  <span className="detail-label">نرخ برابری:</span>
                  <span className="detail-val">
                    هر ۱ {fromAsset?.unit} {fromAsset?.name} = {rate.toLocaleString('fa-IR', { maximumFractionDigits: 4 })} {toAsset?.unit} {toAsset?.name}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="calc-waiting-state">
              <span>لطفاً مقدار معتبری برای محاسبه وارد کنید.</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
