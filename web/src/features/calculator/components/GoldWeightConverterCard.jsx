import React from 'react';
import { Layers, Sparkles, HelpCircle, ArrowRightLeft } from 'lucide-react';
import Card from '../../../components/ui/Card.jsx';
import { formatNum } from '../../../utils/formatters.js';

export default function GoldWeightConverterCard({
  weightInput,
  setWeightInput,
  fromWeightUnit,
  setFromWeightUnit,
  karat,
  setKarat,
  weightResult,
}) {
  const {
    weightInGrams,
    weightInMesghal,
    weightInSoot,
    unitPriceToman,
    totalValueToman,
    isValid,
  } = weightResult || {};

  return (
    <Card className="calculator-card" padding="lg">
      <div className="calculator-card-header">
        <div className="calc-header-icon-badge purple">
          <Layers size={20} />
        </div>
        <div>
          <h3 className="calc-card-title">مبدل واحدهای سنتی وزن طلا و آب‌شده</h3>
          <p className="calc-card-desc">تبدیل دقیق گرم، مثقال و سوت با محاسبه ارزش ریالی لحظه‌ای بر حسب عیار</p>
        </div>
      </div>

      <div className="gold-weight-converter-content">
        {/* Input Controls */}
        <div className="calc-row-3col">
          {/* Weight Amount */}
          <div className="calc-input-group">
            <label className="calc-label" htmlFor="weight-amount-input">مقدار وزن</label>
            <div className="calc-input-wrapper">
              <input
                id="weight-amount-input"
                type="number"
                step="any"
                min="0"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                placeholder="مثلاً ۱"
                className="calc-number-input"
              />
            </div>
          </div>

          {/* Unit Selector */}
          <div className="calc-input-group">
            <label className="calc-label" htmlFor="weight-unit-select">واحد مبدأ</label>
            <div className="calc-select-wrapper">
              <select
                id="weight-unit-select"
                value={fromWeightUnit}
                onChange={(e) => setFromWeightUnit(e.target.value)}
                className="calc-select"
              >
                <option value="gram">گرم (Gram)</option>
                <option value="mesghal">مثقال (۴.۶۰۸ گرم)</option>
                <option value="soot">سوت (۰.۰۰۱ گرم)</option>
              </select>
            </div>
          </div>

          {/* Karat Selector */}
          <div className="calc-input-group">
            <label className="calc-label" htmlFor="weight-karat-select">عیار طلا</label>
            <div className="calc-select-wrapper">
              <select
                id="weight-karat-select"
                value={karat}
                onChange={(e) => setKarat(e.target.value)}
                className="calc-select"
              >
                <option value="18k">طلای ۱۸ عیار (۷۵۰)</option>
                <option value="24k">طلای ۲۴ عیار (۹۹۹.۹ - شمش)</option>
                <option value="mesghal_17k">مظنه مثقال ۱۷ عیار (۷۰۵)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Live Weight Conversion Breakdown */}
        {isValid ? (
          <div className="weight-conversion-results">
            {/* Real-time Equivalent in all 3 units */}
            <div className="weight-units-cards-grid">
              <div className={`weight-unit-card ${fromWeightUnit === 'gram' ? 'is-source' : ''}`}>
                <span className="unit-card-label">معادل به گرم:</span>
                <strong className="unit-card-val">
                  {weightInGrams.toLocaleString('fa-IR', { maximumFractionDigits: 4 })}
                </strong>
                <span className="unit-card-sym">گرم</span>
              </div>

              <div className={`weight-unit-card ${fromWeightUnit === 'mesghal' ? 'is-source' : ''}`}>
                <span className="unit-card-label">معادل به مثقال:</span>
                <strong className="unit-card-val">
                  {weightInMesghal.toLocaleString('fa-IR', { maximumFractionDigits: 4 })}
                </strong>
                <span className="unit-card-sym">مثقال</span>
              </div>

              <div className={`weight-unit-card ${fromWeightUnit === 'soot' ? 'is-source' : ''}`}>
                <span className="unit-card-label">معادل به سوت:</span>
                <strong className="unit-card-val">
                  {weightInSoot.toLocaleString('fa-IR')}
                </strong>
                <span className="unit-card-sym">سوت</span>
              </div>
            </div>

            {/* Total Toman Value Box */}
            <div className="weight-price-result-box">
              <div className="weight-price-info">
                <span className="price-info-label">ارزش تخمینی کل به نرخ زنده بازار:</span>
                <strong className="price-info-val gold-gradient-text">
                  {formatNum(totalValueToman)} تومان
                </strong>
              </div>
              <div className="weight-unit-price-hint">
                نرخ پایه هر گرم: {formatNum(unitPriceToman)} تومان
              </div>
            </div>

            {/* Formula Hint */}
            <div className="weight-standard-notes">
              <HelpCircle size={14} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
              <span>
                استاندارد بازار طلا: هر ۱ مثقال = ۴.۶۰۸ گرم = ۴۶۰۸ سوت | هر ۱ گرم = ۱۰۰۰ سوت طلا
              </span>
            </div>
          </div>
        ) : (
          <div className="calc-waiting-state">
            <span>لطفاً مقدار وزن را وارد کنید تا معادل آن در سایر واحدها و ارزش ریالی محاسبه شود.</span>
          </div>
        )}
      </div>
    </Card>
  );
}
