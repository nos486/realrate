import React from 'react';
import Card from './ui/Card.jsx';
import TimeAgoBadge, { formatRelativeTime } from './ui/TimeAgoBadge.jsx';

/**
 * Reusable MarketInputsToolbar component
 * Contains inputs for:
 * - Free market USD in Tomans (live or manual with timestamp)
 * - World ounce gold in USD (global market live)
 */
export default function MarketInputsToolbar({
  usdToman,
  setUsdToman,
  goldUsd,
  setGoldUsd,
  liveUsdSource = 'live',
  liveUsdDatetime = null,
  className = '',
}) {
  return (
    <Card className={`inputs-toolbar ${className}`} padding="none">
      {/* Free USD Input */}
      <div className="toolbar-input-item">
        <div className="toolbar-label-row">
          <label htmlFor="usdToman">دلار آزاد</label>
          <TimeAgoBadge
            isLive={liveUsdSource === 'live'}
            showPulse={liveUsdSource === 'live'}
          />
        </div>
        <div className="toolbar-input-wrapper">
          <input
            type="text"
            id="usdToman"
            placeholder="مثلاً ۶۵,۰۰۰"
            value={usdToman}
            onChange={(e) => setUsdToman(e.target.value)}
          />
          <span className="input-affix">تومان</span>
        </div>
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
        <div className="toolbar-input-wrapper">
          <input
            type="text"
            id="goldUsd"
            placeholder="2890"
            value={goldUsd}
            onChange={(e) => setGoldUsd(e.target.value)}
          />
          <span className="input-affix">USD</span>
        </div>
        <span className="toolbar-sub-hint">بازار جهانی</span>
      </div>
    </Card>
  );
}
