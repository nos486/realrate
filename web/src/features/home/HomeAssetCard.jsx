/**
 * HomeAssetCard.jsx — One asset on the home page, in any of the card styles
 *
 * - detailed (the full card): a card that turns over. The front: price, the source's change, for
 *   gold & coins the bubble analysis (intrinsic value, standard price, deviation), and today's
 *   low–high bar (from the price book). Tapped (or Enter / Space), it turns to its back: only the
 *   last 30 days as candles, fetched the first time that card is turned — nothing loads before.
 * - compact: small row card (flag/icon, name, symbol, price).
 * A section saved with the older "trend" style is shown as full cards.
 */

import React, { useState } from 'react';
import { ChartCandlestick } from 'lucide-react';
import { CategoryIcon } from '../portfolio/utils/holdingHelpers.js';
import TrendCandles from './TrendCandles.jsx';
import { useAssetCandles } from './useAssetCandles.js';

function formatNum(num) {
  if (num === null || num === undefined || isNaN(num)) return '-';
  // A price under 100 tomans keeps its fraction (a coin worth 0.37 toman is not 0)
  if (Math.abs(num) > 0 && Math.abs(num) < 100) return Number(num).toLocaleString('fa-IR', { maximumSignificantDigits: 4 });
  return Math.round(num).toLocaleString('fa-IR');
}

const formatPct = (v, digits = 1) =>
  Math.abs(v).toLocaleString('fa-IR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

function bubbleBadge(item) {
  const hasMarket = item.market !== null && item.market !== undefined;
  if (!hasMarket) return { className: 'disabled', text: 'بدون نرخ بازار' };
  const pct = formatPct(item.bubble_pct);
  if (item.bubble_pct < 0) return { className: 'badge-good', text: `حباب منفی ${pct}٪` };
  if (item.bubble_pct <= 5) return { className: 'badge-blue', text: `حباب +${pct}٪` };
  if (item.bubble_pct <= 15) return { className: 'badge-orange', text: `حباب +${pct}٪` };
  return { className: 'badge-danger', text: `حباب +${pct}٪` };
}

function changeBadge(changePercent) {
  if (changePercent === null || changePercent === undefined || changePercent === 0) return null;
  return {
    className: changePercent > 0 ? 'badge-good' : 'badge-danger',
    text: `${changePercent > 0 ? '▲' : '▼'} ${formatPct(changePercent, 2)}٪`,
  };
}

function AssetIcon({ asset }) {
  if (asset.flag) return <span className="home-asset-flag" aria-hidden="true">{asset.flag}</span>;
  return (
    <span className="home-asset-icon" aria-hidden="true">
      <CategoryIcon category={asset.category} size={15} />
    </span>
  );
}

const staleTimeFormat = new Intl.DateTimeFormat('fa-IR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** A price whose source hasn't updated for a while says so */
function StaleMark({ asset }) {
  if (!asset?.stale) return null;
  const since = asset.staleSince ? new Date(asset.staleSince) : null;
  const when = since && !Number.isNaN(since.getTime()) ? staleTimeFormat.format(since) : '';
  const title = when ? `این قیمت از ${when} به‌روز نشده است` : 'این قیمت مدتی است به‌روز نشده است';
  return <span className="home-stale-mark" title={title}>قدیمی</span>;
}

function CompactCard({ asset }) {
  const change = changeBadge(asset.changePercent);
  return (
    <div className="currency-item-card">
      <div className="curr-lead">
        <AssetIcon asset={asset} />
        <div className="curr-names">
          <div className="curr-title-row">
            <span className="curr-persian-name">{asset.name}</span>
            {asset.code && <span className="curr-code-pill">{asset.code}</span>}
          </div>
          {asset.note && <span className="curr-desc" title={asset.note}>{asset.note}</span>}
        </div>
      </div>
      <div className="curr-price-block">
        <div className="curr-price-val">
          {asset.price ? formatNum(asset.price) : '—'}
          <span className="curr-unit">{asset.unit}</span>
        </div>
        {change && <span className={`home-change ${change.className}`}>{change.text}</span>}
        <StaleMark asset={asset} />
      </div>
    </div>
  );
}

/** Today's low–high bar with where the price sits in it (from the price book: no query) */
function DayRange({ range, price }) {
  if (!range) return null;
  const { low, high } = range;
  const now = Number(price) || low;
  const position = high > low ? Math.min(1, Math.max(0, (now - low) / (high - low))) : 0.5;
  return (
    <div className="pro-range" title="دامنه‌ی نوسان امروز">
      <div className="pro-range-track">
        <span className="pro-range-fill" style={{ width: `${position * 100}%` }} />
        <span className="pro-range-marker" style={{ insetInlineStart: `${position * 100}%` }} />
      </div>
      <div className="pro-range-labels">
        <span><small>کف امروز</small> {formatNum(low)}</span>
        <span><small>سقف امروز</small> {formatNum(high)}</span>
      </div>
    </div>
  );
}

function CardHead({ asset, pill }) {
  return (
    <div className="pro-card-head">
      <div className="pro-card-identity">
        <AssetIcon asset={asset} />
        <div className="pro-card-names">
          <h3 className="pro-card-name">{asset.name}</h3>
          {(asset.code || asset.sourceName) && (
            <span className="pro-card-sub">
              {asset.code && <span className="curr-code-pill">{asset.code}</span>}
              {asset.sourceName && <span>{asset.sourceName}</span>}
            </span>
          )}
        </div>
      </div>
      {pill}
    </div>
  );
}

/** Gold & coins: the bubble analysis, as three small figures */
function GoldMetrics({ item }) {
  const hasMarket = item.market !== null && item.market !== undefined;
  const showStandard = item.target_bubble_pct > 0;
  if (!hasMarket && !showStandard) return null;
  return (
    <div className="pro-metrics">
      {hasMarket && (
        <div className="pro-metric">
          <span>ارزش ذاتی</span>
          <strong className="gold-val">{formatNum(item.intrinsic)}</strong>
        </div>
      )}
      {showStandard && (
        <div className="pro-metric">
          <span>قیمت استاندارد</span>
          <strong className="blue-val">{formatNum(item.expected_price)}</strong>
        </div>
      )}
      {hasMarket && showStandard && item.diff_from_expected !== null && (
        <div className="pro-metric">
          <span>انحراف</span>
          <strong className={item.diff_from_expected < 0 ? 'good-val' : 'warn-val'}>
            {item.diff_from_expected < 0 ? '−' : '+'}
            {formatPct(item.diff_from_expected_pct)}٪
          </strong>
        </div>
      )}
    </div>
  );
}

/** The back of a card: only the last 30 days as candles, fetched the first time it is turned */
function CardBack({ asset, unit, turned }) {
  const { status, series } = useAssetCandles(asset.id, turned);
  return (
    <div className="pro-card-face is-back" aria-hidden={!turned}>
      {status === 'ready' ? (
        // Inspecting a day doesn't turn the card back
        <div className="pro-card-chart" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="presentation">
          <TrendCandles candles={series.candles} days={series.days} unit={unit} label={`نمودار کندلی ۳۰ روز اخیر ${asset.name}`} />
        </div>
      ) : status === 'loading' ? (
        <div className="pro-card-back-state is-loading" aria-label="در حال دریافت نمودار" role="status" />
      ) : status !== 'idle' ? (
        <div className="pro-card-back-state">{status === 'error' ? 'نمودار فعلاً در دسترس نیست' : 'تاریخچه‌ای برای این مورد ثبت نشده'}</div>
      ) : null}
    </div>
  );
}

/** The full card: details in front; turned (tap, Enter / Space), its candles on the back */
function FullCard({ asset, isBest = false, flippable = true }) {
  const [flipped, setFlipped] = useState(false);
  const [turnedOnce, setTurnedOnce] = useState(false);
  const item = asset.analysis || null;
  const hasMarket = item ? item.market !== null && item.market !== undefined : true;
  const price = asset.price || (item ? (hasMarket ? item.market : item.intrinsic) : null) || null;
  const unit = item ? 'تومان' : asset.unit;
  const change = changeBadge(asset.changePercent);
  const isFlipped = flippable && flipped;
  const direction = change?.className === 'badge-good' ? 'up' : change ? 'down' : 'flat';

  const toggle = () => {
    if (!flippable) return;
    setTurnedOnce(true);
    setFlipped((f) => !f);
  };
  const onKeyDown = (e) => {
    if (!flippable || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    toggle();
  };

  const changePill = change && <span className={`bubble-pill ${change.className}`}>{change.text}</span>;
  const pill = item ? <span className={`bubble-pill ${bubbleBadge(item).className}`}>{bubbleBadge(item).text}</span> : changePill;

  return (
    <div
      className={`home-pro-card is-${direction} ${isBest ? 'best-choice' : ''} ${flippable ? 'can-flip' : ''} ${isFlipped ? 'is-flipped' : ''}`}
      {...(flippable
        ? {
            role: 'button',
            tabIndex: 0,
            'aria-pressed': isFlipped,
            'aria-label': isFlipped ? `${asset.name}: بازگشت به جزئیات` : `${asset.name}: نمایش نمودار کندلی ۳۰ روز اخیر`,
            onClick: toggle,
            onKeyDown,
          }
        : {})}
    >
      <div className="pro-card-inner">
        <div className="pro-card-face is-front" aria-hidden={isFlipped}>
          <CardHead asset={asset} pill={pill} />
          <div className="pro-card-price">
            {price ? (
              <>
                <span className="pro-card-price-value">{formatNum(price)}</span>
                <span className="pro-card-price-unit">{unit}</span>
              </>
            ) : (
              <span className="price-unavailable">نرخ در دسترس نیست</span>
            )}
            {item && changePill}
          </div>
          {item && !hasMarket && <span className="home-price-caption">ارزش ذاتی — نرخ بازار فعلاً در دسترس نیست</span>}
          <StaleMark asset={asset} />
          {item && <GoldMetrics item={item} />}
          <div className="pro-card-foot">
            <DayRange range={asset.dayRange} price={price} />
            {flippable && (
              <span className="pro-card-hint" aria-hidden="true">
                <ChartCandlestick size={13} />
              </span>
            )}
          </div>
        </div>
        {flippable && turnedOnce && <CardBack asset={asset} unit={unit} turned={isFlipped} />}
      </div>
    </div>
  );
}

function MissingCard({ asset, style }) {
  return (
    <div className={`${style === 'compact' ? 'currency-item-card' : 'home-pro-card'} home-card-missing`}>
      <span className="curr-persian-name">{asset.id}</span>
      <span className="curr-desc">این مورد فعلاً در بازار نرخی ندارد.</span>
    </div>
  );
}

/**
 * @param {{ asset: object, style: 'detailed'|'compact', isBest?: boolean, flippable?: boolean }} props
 *   flippable: false while the page is being arranged (a tap there is a drag)
 */
export default function HomeAssetCard({ asset, style, isBest = false, flippable = true }) {
  if (!asset.found) return <MissingCard asset={asset} style={style} />;
  if (style === 'compact') return <CompactCard asset={asset} />;
  // The full card (also a section saved with the older "trend" style)
  return <FullCard asset={asset} isBest={isBest} flippable={flippable} />;
}
