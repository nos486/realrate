import React, { useState } from 'react';

function formatNum(num) {
  if (num === null || num === undefined || isNaN(num)) return '۰';
  return Math.round(num).toLocaleString('fa-IR');
}

export default function JewelryCalc({ gold18kGram }) {
  const [weight, setWeight] = useState(5.5);
  const [wagePct, setWagePct] = useState(15);
  const [profitPct, setProfitPct] = useState(7);
  const [taxPct, setTaxPct] = useState(9);

  const g18k = gold18kGram || 0;
  const rawTotal = g18k * (parseFloat(weight) || 0);
  const wageVal = rawTotal * ((parseFloat(wagePct) || 0) / 100);
  const profitVal = (rawTotal + wageVal) * ((parseFloat(profitPct) || 0) / 100);
  const taxVal = (wageVal + profitVal) * ((parseFloat(taxPct) || 0) / 100);
  const finalTotal = rawTotal + wageVal + profitVal + taxVal;

  return (
    <div className="jewelry-calc-grid">
      {/* Parameters Panel */}
      <div className="calc-inputs-card">
        <div className="calc-card-header">
          <h3>⚙️ فاکتور و پارامترهای خرید</h3>
          <span>تنظیم وزن، اجرت ساخت و درصدهای قانونی</span>
        </div>

        <div className="calc-form">
          <div className="calc-form-group">
            <label>وزن طلا (گرم)</label>
            <div className="calc-input-wrap">
              <input
                type="number"
                value={weight}
                step="0.1"
                min="0.1"
                onChange={(e) => setWeight(e.target.value)}
              />
              <span className="unit-tag">گرم</span>
            </div>
          </div>

          <div className="calc-form-group">
            <div className="label-with-presets">
              <label>درصد اجرت ساخت (٪)</label>
              <div className="quick-presets">
                {[7, 10, 15, 18, 22].map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`preset-btn ${wagePct === p ? 'active' : ''}`}
                    onClick={() => setWagePct(p)}
                  >
                    {p}٪
                  </button>
                ))}
              </div>
            </div>
            <div className="calc-input-wrap">
              <input
                type="number"
                value={wagePct}
                step="1"
                min="0"
                onChange={(e) => setWagePct(parseFloat(e.target.value) || 0)}
              />
              <span className="unit-tag">درصد</span>
            </div>
          </div>

          <div className="calc-form-group">
            <div className="label-with-presets">
              <label>درصد سود طلافروش (٪)</label>
              <div className="quick-presets">
                {[5, 7, 9].map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`preset-btn ${profitPct === p ? 'active' : ''}`}
                    onClick={() => setProfitPct(p)}
                  >
                    {p}٪
                  </button>
                ))}
              </div>
            </div>
            <div className="calc-input-wrap">
              <input
                type="number"
                value={profitPct}
                step="1"
                min="0"
                onChange={(e) => setProfitPct(parseFloat(e.target.value) || 0)}
              />
              <span className="unit-tag">درصد</span>
            </div>
          </div>

          <div className="calc-form-group">
            <label>درصد مالیات بر ارزش افزوده (٪)</label>
            <div className="calc-input-wrap">
              <input
                type="number"
                value={taxPct}
                step="1"
                min="0"
                onChange={(e) => setTaxPct(parseFloat(e.target.value) || 0)}
              />
              <span className="unit-tag">روی سود و اجرت</span>
            </div>
          </div>
        </div>
      </div>

      {/* Invoice Receipt Card */}
      <div className="calc-receipt-card">
        <div className="receipt-header">
          <div className="receipt-title">
            <h4>🧾 صورت‌حساب دقیق پرداختی شما</h4>
            <span>بر اساس نرخ لحظه‌ای طلای ۱۸ عیار</span>
          </div>
          <span className="gold-price-badge">
            هر گرم: {formatNum(g18k)} تومان
          </span>
        </div>

        <div className="receipt-rows">
          <div className="receipt-item">
            <span className="item-label">ارزش طلای خام:</span>
            <span className="item-val">{formatNum(rawTotal)} تومان</span>
          </div>

          <div className="receipt-item">
            <span className="item-label">اجرت ساخت ({wagePct}٪):</span>
            <span className="item-val">{formatNum(wageVal)} تومان</span>
          </div>

          <div className="receipt-item">
            <span className="item-label">سود طلافروش ({profitPct}٪):</span>
            <span className="item-val">{formatNum(profitVal)} تومان</span>
          </div>

          <div className="receipt-item">
            <span className="item-label">مالیات ارزش افزوده ({taxPct}٪):</span>
            <span className="item-val">{formatNum(taxVal)} تومان</span>
          </div>
        </div>

        <div className="receipt-total-box">
          <div className="total-label">مبلغ نهایی پرداختی فاکتور:</div>
          <div className="total-amount">
            <span>{formatNum(finalTotal)}</span>
            <span className="toman-unit">تومان</span>
          </div>
        </div>
      </div>
    </div>
  );
}
