import React from 'react';
import { Scale, TrendingUp, TrendingDown, CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react';
import Card from '../../../components/ui/Card.jsx';
import { formatNum } from '../../../utils/formatters.js';

export default function CustomBubbleCard({
  bubbleEligibleAssets = [],
  bubbleAssetId,
  setBubbleAssetId,
  tradedPriceInput,
  setTradedPriceInput,
  customBubbleResult,
  usdToman,
  goldUsd,
}) {
  const {
    intrinsicValue,
    bubble,
    bubblePct,
    marketDiffPct,
    comparisonStatus,
    selectedAsset,
    marketPrice,
    marketBubblePct,
    isValid,
  } = customBubbleResult || {};

  const isPositiveBubble = (bubble || 0) >= 0;

  const handleUseMarketPrice = () => {
    if (marketPrice > 0) {
      setTradedPriceInput(String(marketPrice));
    }
  };

  return (
    <Card className="calculator-card" padding="lg">
      <div className="calculator-card-header">
        <div className="calc-header-icon-badge amber">
          <Scale size={20} />
        </div>
        <div>
          <h3 className="calc-card-title">محاسبه‌گر حباب سفارشی</h3>
          <p className="calc-card-desc">سنجش حباب واقعی هر مظنه یا معامله پیشنهادی نسبت به ارزش ذاتی</p>
        </div>
      </div>

      <div className="custom-bubble-grid">
        {/* Asset Selector & Price Input */}
        <div className="calc-row-2col">
          <div className="calc-input-group">
            <label className="calc-label" htmlFor="bubble-asset-select">انتخاب مسکوک یا طلا</label>
            <div className="calc-select-wrapper">
              <select
                id="bubble-asset-select"
                value={bubbleAssetId}
                onChange={(e) => {
                  setBubbleAssetId(e.target.value);
                  setTradedPriceInput('');
                }}
                className="calc-select"
              >
                {bubbleEligibleAssets.map((a) => (
                  <option key={`bubble_${a.id}`} value={a.id}>
                    {a.name} {a.hasPrice ? `(بازار: ${formatNum(a.price)} ت)` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="calc-input-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="calc-label" htmlFor="traded-price-input">قیمت معامله پیشنهادی (تومان)</label>
              {marketPrice > 0 && (
                <button
                  type="button"
                  onClick={handleUseMarketPrice}
                  className="calc-quick-fill-btn"
                  title="پر کردن با نرخ فعلی بازار"
                >
                  نرخ روز بازار
                </button>
              )}
            </div>
            <div className="calc-input-wrapper">
              <input
                id="traded-price-input"
                type="number"
                min="0"
                step="10000"
                value={tradedPriceInput}
                onChange={(e) => setTradedPriceInput(e.target.value)}
                placeholder={marketPrice > 0 ? `مثلاً ${formatNum(marketPrice)}` : 'مبلغ به تومان'}
                className="calc-number-input"
              />
            </div>
          </div>
        </div>

        {/* Bubble Calculation Result Cards */}
        {isValid ? (
          <div className="custom-bubble-results-container">
            <div className="bubble-metrics-row">
              {/* Intrinsic Value */}
              <div className="bubble-metric-box">
                <span className="metric-box-label">ارزش ذاتی ریاضی (خام):</span>
                <strong className="metric-box-val gold-text">{formatNum(intrinsicValue)} تومان</strong>
                <span className="metric-box-hint">بر مبنای انس {goldUsd}$ و دلار {formatNum(usdToman)} ت</span>
              </div>

              {/* Bubble Amount */}
              <div className={`bubble-metric-box ${isPositiveBubble ? 'has-bubble' : 'negative-bubble'}`}>
                <span className="metric-box-label">میزان حباب قیمت وارد شده:</span>
                <strong className="metric-box-val">
                  {isPositiveBubble ? '+' : ''}{formatNum(bubble)} تومان
                </strong>
                <span className="metric-box-hint">
                  {isPositiveBubble ? 'حباب مثبت' : 'حباب منفی (زیر ارزش ذاتی)'} ({isPositiveBubble ? '+' : ''}{bubblePct}٪)
                </span>
              </div>
            </div>

            {/* Market Comparison Card */}
            {marketPrice > 0 && (
              <div className={`bubble-comparison-card status-${comparisonStatus || 'equal'}`}>
                <div className="comparison-icon-wrap">
                  {comparisonStatus === 'cheaper' ? (
                    <CheckCircle2 size={20} className="text-success" />
                  ) : comparisonStatus === 'pricier' ? (
                    <AlertTriangle size={20} className="text-rose" />
                  ) : (
                    <Scale size={20} className="text-muted" />
                  )}
                </div>

                <div className="comparison-texts">
                  <div className="comparison-title-row">
                    <h4 className="comparison-title">
                      {comparisonStatus === 'cheaper' && 'ارزان‌تر از حباب میانگین بازار (پیشنهاد خرید اقتصادی)'}
                      {comparisonStatus === 'pricier' && 'گران‌تر از حباب میانگین بازار (ریسک بالاتر)'}
                      {comparisonStatus === 'equal' && 'همگام با میانگین حباب جاری در بازار'}
                    </h4>
                    <span className="comparison-pct-badge">
                      {marketDiffPct > 0 ? `+${marketDiffPct}٪` : `${marketDiffPct}٪`} نسبت به بازار
                    </span>
                  </div>

                  <p className="comparison-desc">
                    حباب فعلی بازار برای «{selectedAsset?.name}» برابر با <strong>{marketBubblePct}٪</strong> است. قیمت وارد شده دارای <strong>{bubblePct}٪</strong> حباب می‌باشد.
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="calc-waiting-state">
            <span>لطفاً مبلغ معامله پیشنهادی را وارد کنید تا ارزش ذاتی و حباب دقیق محاسبه شود.</span>
          </div>
        )}
      </div>
    </Card>
  );
}
