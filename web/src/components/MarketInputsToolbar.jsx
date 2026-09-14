import React from 'react';
import TimeAgoBadge, { formatRelativeTime } from './ui/TimeAgoBadge.jsx';
import NumericInput from './ui/NumericInput.jsx';

/**
 * Reusable MarketInputsToolbar component
 * Contains inputs for:
 * - Free market USD in Tomans (live or manual with timestamp)
 * - World ounce gold in USD (global market live)
 * Formatted with 3-digit comma separators using reusable NumericInput
 */
export default function MarketInputsToolbar({
  usdToman,
  setUsdToman,
  goldUsd,
  setGoldUsd,
  liveUsdSource = 'live',
  liveUsdDatetime = null,
  activeReferenceRate = null,
  referenceRates = [],
  onCycleReferenceRate = null,
  className = '',
}) {
  return (
    <div className={`inputs-toolbar ${className}`}>
      {/* Free USD / Reference Rate Input */}
      <div className="toolbar-input-item">
        <div className="toolbar-label-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label
              htmlFor="usdToman"
              style={{ cursor: onCycleReferenceRate ? 'pointer' : 'default' }}
              onClick={onCycleReferenceRate}
            >
              {activeReferenceRate?.label || 'دلار آزاد'}
            </label>
            {referenceRates && referenceRates.length > 1 && (
              <button
                type="button"
                className="btn-text-action"
                onClick={onCycleReferenceRate}
                title="تغییر نرخ مبنای محاسبات"
                style={{
                  fontSize: '10px',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: 'var(--text-muted)',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  lineHeight: '1.4',
                }}
              >
                <span>تغییر مبنا</span>
                <span>⇄</span>
              </button>
            )}
          </div>
          <TimeAgoBadge
            isLive={liveUsdSource === 'live'}
            showPulse={liveUsdSource === 'live'}
          />
        </div>
        <NumericInput
          id="usdToman"
          placeholder="مثلاً ۶۵,۰۰۰"
          value={usdToman}
          onValueChange={setUsdToman}
          onChange={(e) => setUsdToman(e.target.value)}
          allowDecimals={false}
          affix="تومان"
        />
        <span className="toolbar-sub-hint">
          {liveUsdSource === 'live' && liveUsdDatetime
            ? `بروزرسانی: ${formatRelativeTime(liveUsdDatetime)}`
            : 'ورودی دستی کاربر'}
        </span>
      </div>

      {/* World Gold Ounce Input */}
      <div className="toolbar-input-item">
        <div className="toolbar-label-row">
          <label htmlFor="goldUsd">انس جهانی طلا</label>
          <TimeAgoBadge isLive={true} showPulse={true} />
        </div>
        <NumericInput
          id="goldUsd"
          placeholder="2,890"
          value={goldUsd}
          onValueChange={setGoldUsd}
          onChange={(e) => setGoldUsd(e.target.value)}
          allowDecimals={true}
          affix="USD"
        />
        <span className="toolbar-sub-hint">بازار جهانی</span>
      </div>
    </div>
  );
}
