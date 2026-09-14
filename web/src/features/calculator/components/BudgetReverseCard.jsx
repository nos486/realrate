import React from 'react';
import { Wallet, Sparkles, TrendingUp, Info } from 'lucide-react';
import Card from '../../../components/ui/Card.jsx';
import { formatNum } from '../../../utils/formatters.js';

const BUDGET_PRESETS = [
  { label: '۱۰ میلیون', value: 10_000_000 },
  { label: '۵۰ میلیون', value: 50_000_000 },
  { label: '۱۰۰ میلیون', value: 100_000_000 },
  { label: '۵۰۰ میلیون', value: 500_000_000 },
  { label: '۱ میلیارد', value: 1_000_000_000 },
];

export default function BudgetReverseCard({
  budgetInput,
  setBudgetInput,
  budgetResults = [],
}) {
  const handleSelectPreset = (val) => {
    setBudgetInput(String(val));
  };

  const handleInputChange = (e) => {
    const raw = e.target.value.replace(/,/g, '');
    if (!isNaN(raw)) {
      setBudgetInput(raw);
    }
  };

  const rawNum = typeof budgetInput === 'string'
    ? parseFloat(budgetInput.replace(/,/g, '')) || 0
    : Number(budgetInput || 0);

  return (
    <Card className="calculator-card" padding="lg">
      <div className="calculator-card-header">
        <div className="calc-header-icon-badge emerald">
          <Wallet size={20} />
        </div>
        <div>
          <h3 className="calc-card-title">محاسبه معکوس قدرت خرید بر اساس بودجه</h3>
          <p className="calc-card-desc">مشاهده مقدار قابل خرید از هر دارایی به نرخ روز بازار در برابر ارزش ذاتی خام</p>
        </div>
      </div>

      <div className="budget-calculator-content">
        {/* Budget Input & Quick Presets */}
        <div className="budget-controls-row">
          <div className="calc-input-group budget-field">
            <label className="calc-label" htmlFor="budget-input">مبلغ بودجه کل سرمایه‌گذاری (تومان)</label>
            <div className="calc-input-wrapper">
              <input
                id="budget-input"
                type="text"
                value={rawNum > 0 ? rawNum.toLocaleString('fa-IR') : budgetInput}
                onChange={handleInputChange}
                placeholder="مثلاً ۱۰۰,۰۰۰,۰۰۰"
                className="calc-number-input large-text"
              />
            </div>
          </div>

          <div className="budget-presets-group">
            <span className="presets-label">مبالغ پیشنهادی:</span>
            <div className="presets-chips-wrap">
              {BUDGET_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => handleSelectPreset(p.value)}
                  className={`preset-chip ${rawNum === p.value ? 'active' : ''}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Results Table */}
        {budgetResults.length > 0 && rawNum > 0 ? (
          <div className="budget-table-responsive">
            <table className="budget-results-table">
              <thead>
                <tr>
                  <th>دارایی</th>
                  <th>نرخ واحد بازار</th>
                  <th>مقدار با نرخ بازار <span className="th-sub">(با حباب)</span></th>
                  <th>مقدار با ارزش ذاتی <span className="th-sub">(بدون حباب)</span></th>
                  <th>اختلاف قدرت خرید</th>
                  <th>هزینه پرداختی حباب</th>
                </tr>
              </thead>
              <tbody>
                {budgetResults.map((item) => {
                  const hasBubble = item.bubble > 0;
                  return (
                    <tr key={item.id} className="budget-row">
                      <td className="td-asset-name">
                        <strong>{item.name}</strong>
                        {item.symbol && <span className="td-asset-symbol">({item.symbol})</span>}
                      </td>

                      <td className="td-price">
                        {formatNum(item.marketPrice)} تومان
                      </td>

                      <td className="td-market-qty">
                        <strong className="qty-val highlight-gold">
                          {item.marketQty.toLocaleString('fa-IR', { maximumFractionDigits: 3 })}
                        </strong>
                        <span className="qty-unit">{item.unit}</span>
                      </td>

                      <td className="td-intrinsic-qty">
                        <strong className="qty-val">
                          {item.intrinsicQty.toLocaleString('fa-IR', { maximumFractionDigits: 3 })}
                        </strong>
                        <span className="qty-unit">{item.unit}</span>
                      </td>

                      <td className="td-diff">
                        {hasBubble && item.qtyDifference > 0 ? (
                          <span className="text-loss" title="به دلیل وجود حباب این مقدار کمتر دریافت می‌شود">
                            {item.qtyDifference.toLocaleString('fa-IR', { maximumFractionDigits: 3 })} {item.unit} کمتر
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>

                      <td className="td-bubble-cost">
                        {item.bubbleCostToman > 0 ? (
                          <span className="bubble-cost-badge">
                            {formatNum(item.bubbleCostToman)} ت
                          </span>
                        ) : (
                          <span className="text-muted">بدون حباب</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="calc-waiting-state">
            <span>لطفاً مبلغ بودجه خود را به تومان وارد کنید.</span>
          </div>
        )}
      </div>
    </Card>
  );
}
