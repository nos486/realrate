import React, { useState } from 'react';

function formatNum(num) {
  if (num === null || num === undefined || isNaN(num)) return '-';
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
    <div className="calc-box">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--gold-light)' }}>
          فاکتور خرید طلا
        </h3>

        <div className="input-group">
          <label>وزن طلا (گرم)</label>
          <div className="input-wrapper">
            <input
              type="number"
              value={weight}
              step="0.1"
              onChange={(e) => setWeight(e.target.value)}
            />
            <span className="input-suffix">گرم</span>
          </div>
        </div>

        <div className="input-group">
          <label>درصد اجرت ساخت (٪)</label>
          <div className="input-wrapper">
            <input
              type="number"
              value={wagePct}
              step="1"
              onChange={(e) => setWagePct(e.target.value)}
            />
            <span className="input-suffix">درصد</span>
          </div>
        </div>

        <div className="input-group">
          <label>درصد سود طلافروش (٪)</label>
          <div className="input-wrapper">
            <input
              type="number"
              value={profitPct}
              step="1"
              onChange={(e) => setProfitPct(e.target.value)}
            />
            <span className="input-suffix">درصد</span>
          </div>
        </div>

        <div className="input-group">
          <label>درصد مالیات (٪)</label>
          <div className="input-wrapper">
            <input
              type="number"
              value={taxPct}
              step="1"
              onChange={(e) => setTaxPct(e.target.value)}
            />
            <span className="input-suffix">روی اجرت و سود</span>
          </div>
        </div>
      </div>

      <div
        style={{
          background: 'rgba(10, 13, 20, 0.8)',
          border: '1px solid var(--border-glow)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <h4 style={{ fontSize: '14px', color: '#fff', marginBottom: '12px', fontWeight: 800 }}>
            📝 صورت‌حساب پرداختی شما
          </h4>

          <div className="receipt-line">
            <span>قیمت طلا ۱۸ عیار خام:</span>
            <strong>{formatNum(g18k)} تومان</strong>
          </div>
          <div className="receipt-line">
            <span>ارزش کل طلا خام:</span>
            <strong>{formatNum(rawTotal)} تومان</strong>
          </div>
          <div className="receipt-line">
            <span>اجرت ساخت:</span>
            <strong>{formatNum(wageVal)} تومان</strong>
          </div>
          <div className="receipt-line">
            <span>سود طلافروش:</span>
            <strong>{formatNum(profitVal)} تومان</strong>
          </div>
          <div className="receipt-line">
            <span>مالیات بر ارزش افزوده:</span>
            <strong>{formatNum(taxVal)} تومان</strong>
          </div>
        </div>

        <div>
          <div className="receipt-line total">
            <span>مبلغ نهایی پرداختی:</span>
            <span>{formatNum(finalTotal)} تومان</span>
          </div>
        </div>
      </div>
    </div>
  );
}
