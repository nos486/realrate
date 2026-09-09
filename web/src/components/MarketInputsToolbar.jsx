import React from 'react';
import TimeAgoBadge, { formatRelativeTime } from './ui/TimeAgoBadge.jsx';
import { formatThousands } from '../utils/formatters.js';

/**
 * Reusable MarketInputsToolbar component
 * Contains inputs for:
 * - Free market USD in Tomans (live or manual with timestamp)
 * - World ounce gold in USD (global market live)
 * Formatted with 3-digit comma separators (e.g. 234,370 and 4,420.1)
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
  const handleUsdChange = (e) => {
    const input = e.target;
    const rawValue = input.value;
    const cursorPosition = input.selectionStart;
    const charsBeforeCursor = rawValue.slice(0, cursorPosition).replace(/,/g, '').length;

    const formatted = formatThousands(rawValue, false);
    setUsdToman(formatted);

    requestAnimationFrame(() => {
      if (!input) return;
      let newPos = 0;
      let charsCount = 0;
      for (let i = 0; i < formatted.length; i++) {
        if (formatted[i] !== ',') {
          charsCount++;
        }
        if (charsCount === charsBeforeCursor) {
          newPos = i + 1;
          break;
        }
      }
      if (charsBeforeCursor === 0) newPos = 0;
      input.setSelectionRange(newPos, newPos);
    });
  };

  const handleGoldChange = (e) => {
    const input = e.target;
    const rawValue = input.value;
    const cursorPosition = input.selectionStart;
    const charsBeforeCursor = rawValue.slice(0, cursorPosition).replace(/,/g, '').length;

    const formatted = formatThousands(rawValue, true);
    setGoldUsd(formatted);

    requestAnimationFrame(() => {
      if (!input) return;
      let newPos = 0;
      let charsCount = 0;
      for (let i = 0; i < formatted.length; i++) {
        if (formatted[i] !== ',') {
          charsCount++;
        }
        if (charsCount === charsBeforeCursor) {
          newPos = i + 1;
          break;
        }
      }
      if (charsBeforeCursor === 0) newPos = 0;
      input.setSelectionRange(newPos, newPos);
    });
  };

  const displayUsd = formatThousands(usdToman, false);
  const displayGold = formatThousands(goldUsd, true);

  return (
    <div className={`inputs-toolbar ${className}`}>
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
            inputMode="numeric"
            placeholder="مثلاً ۶۵,۰۰۰"
            value={displayUsd}
            onChange={handleUsdChange}
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
            inputMode="decimal"
            placeholder="2,890"
            value={displayGold}
            onChange={handleGoldChange}
          />
          <span className="input-affix">USD</span>
        </div>
        <span className="toolbar-sub-hint">بازار جهانی</span>
      </div>
    </div>
  );
}
