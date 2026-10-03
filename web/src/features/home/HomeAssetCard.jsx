/**
 * HomeAssetCard.jsx — One asset on the home page, in any of the card styles
 *
 * - detailed (the full card): a card that turns over. The front: price, the change since
 *   yesterday and, for gold & coins, the bubble analysis (intrinsic value, standard price,
 *   deviation). Tapped (or Enter / Space), it turns to its back: the last 30 days as candles,
 *   today's range, the 30-day range with where the price sits in it, and the 30-day change.
 *   Without a price history it doesn't turn.
 * - compact: small row card (flag/icon, name, symbol, price).
 * A section saved with the older "trend" style is shown as full cards.
 */

import React, { useState } from 'react';
import { ChartCandlestick, RotateCcw } from 'lucide-react';
import { CategoryIcon } from '../portfolio/utils/holdingHelpers.js';
import TrendCandles from './TrendCandles.jsx';

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

/** The change from the point before the last (yesterday's close on a daily series) to the last */
function dayChangePct(trend) {
  const points = trend?.points || [];
  if (points.length < 2) return null;
  const prev = points[points.length - 2];
  return prev > 0 ? ((points[points.length - 1] - prev) / prev) * 100 : null;
}

const sinceFormat = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'long', day: 'numeric' });
const TREND_WINDOW_DAYS = 30;

/** What the back of a card shows: today's candle, the window's range and where the price sits */
function trendStats(trend, price) {
  const candles = Array.isArray(trend?.candles) && trend.candles.length === trend.points?.length ? trend.candles : null;
  if (!candles || candles.length < 2) return null;
  const [todayOpen, todayHigh, todayLow] = candles[candles.length - 1];
  const low = Math.min(...candles.map((c) => c[2]));
  const high = Math.max(...candles.map((c) => c[1]));
  const now = Number(price) || trend.last;
  return {
    candles,
    todayOpen,
    todayHigh,
    todayLow,
    low,
    high,
    position: high > low ? Math.min(1, Math.max(0, (now - low) / (high - low))) : 0.5,
    changePct: trend.changePct,
    young: candles.length < TREND_WINDOW_DAYS * 0.95,
  };
}

/** A faint outline of the last days on the front: a hint of the direction, not a chart */
function FrontSpark({ points }) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const W = 200;
  const H = 40;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const xy = points.map((v, i) => [(i / (points.length - 1)) * W, 4 + (1 - (v - min) / span) * (H - 8)]);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg className="pro-card-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false" dir="ltr">
      <polygon points={`0,${H} ${line} ${W},${H}`} />
      <polyline points={line} />
    </svg>
  );
}

function RangeBar({ low, high, position, lowLabel, highLabel }) {
  return (
    <div className="pro-range">
      <div className="pro-range-track">
        <span className="pro-range-fill" style={{ width: `${position * 100}%` }} />
        <span className="pro-range-marker" style={{ insetInlineStart: `${position * 100}%` }} />
      </div>
      <div className="pro-range-labels">
        <span><small>{lowLabel}</small> {formatNum(low)}</span>
        <span><small>{highLabel}</small> {formatNum(high)}</span>
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

/** The full card: details in front, the price history on the back */
function FullCard({ asset, isBest = false, trend = null, trendStatus = 'idle', flippable = true }) {
  const [flipped, setFlipped] = useState(false);
  const item = asset.analysis || null;
  const hasMarket = item ? item.market !== null && item.market !== undefined : true;
  const price = asset.price || (item ? (hasMarket ? item.market : item.intrinsic) : null) || trend?.last || null;
  const unit = item ? 'تومان' : asset.unit;
  // The source's daily change, or else the history's change since yesterday
  const sourceChange = asset.changePercent === null || asset.changePercent === undefined ? null : asset.changePercent;
  const historyChange = sourceChange === null ? dayChangePct(trend) : null;
  const change = changeBadge(historyChange !== null ? Number(historyChange.toFixed(2)) : sourceChange);
  const stats = trendStats(trend, price);
  const canFlip = flippable && Boolean(stats);
  const isFlipped = canFlip && flipped;
  const direction = stats ? (stats.changePct > 0 ? 'up' : stats.changePct < 0 ? 'down' : 'flat') : change?.className === 'badge-good' ? 'up' : change ? 'down' : 'flat';

  const toggle = () => canFlip && setFlipped((f) => !f);
  const onKeyDown = (e) => {
    if (!canFlip || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    toggle();
  };

  const changePill = change && (
    <span className={`bubble-pill ${change.className}`} title={historyChange !== null ? 'تغییر نسبت به دیروز' : undefined}>
      {change.text}
    </span>
  );
  const pill = item ? <span className={`bubble-pill ${bubbleBadge(item).className}`}>{bubbleBadge(item).text}</span> : changePill;

  return (
    <div
      className={`home-pro-card is-${direction} ${isBest ? 'best-choice' : ''} ${canFlip ? 'can-flip' : ''} ${isFlipped ? 'is-flipped' : ''}`}
      {...(canFlip
        ? {
            role: 'button',
            tabIndex: 0,
            'aria-pressed': isFlipped,
            'aria-label': isFlipped ? `${asset.name}: بازگشت به جزئیات` : `${asset.name}: نمایش نمودار ۳۰ روز اخیر`,
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
          {stats && <FrontSpark points={trend.points} />}
          <div className="pro-card-foot">
            {asset.note && asset.note !== asset.sourceName ? <span className="pro-card-note" title={asset.note}>{asset.note}</span> : <span />}
            {canFlip && (
              <span className="pro-card-hint">
                <ChartCandlestick size={13} /> نمودار
              </span>
            )}
            {!stats && trendStatus === 'loading' && <span className="pro-card-hint is-loading" aria-hidden="true" />}
          </div>
        </div>

        {stats && (
          <div className="pro-card-face is-back" aria-hidden={!isFlipped}>
            <div className="pro-card-head">
              <div className="pro-card-names">
                <h3 className="pro-card-name">{asset.name}</h3>
                <span className="pro-card-sub">
                  {stats.young ? `از ${sinceFormat.format(new Date(trend.since))}` : `${TREND_WINDOW_DAYS.toLocaleString('fa-IR')} روز اخیر`}
                </span>
              </div>
              <span className={`pro-card-change is-${direction}`} title="تغییر در این بازه">
                {stats.changePct > 0 ? '▲' : stats.changePct < 0 ? '▼' : ''} {formatPct(stats.changePct, 2)}٪
              </span>
            </div>
            {/* Inspecting a day doesn't turn the card back */}
            <div className="pro-card-chart" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="presentation">
              <TrendCandles candles={stats.candles} days={trend.days} unit={unit} label={`نمودار کندلی ${asset.name}`} />
            </div>
            <div className="pro-card-stats">
              <div className="pro-metric">
                <span>باز امروز</span>
                <strong>{formatNum(stats.todayOpen)}</strong>
              </div>
              <div className="pro-metric">
                <span>کمترین امروز</span>
                <strong className="down-val">{formatNum(stats.todayLow)}</strong>
              </div>
              <div className="pro-metric">
                <span>بیشترین امروز</span>
                <strong className="up-val">{formatNum(stats.todayHigh)}</strong>
              </div>
            </div>
            <RangeBar low={stats.low} high={stats.high} position={stats.position} lowLabel="کف" highLabel="سقف" />
            <span className="pro-card-back-hint" aria-hidden="true"><RotateCcw size={12} /> برای بازگشت بزنید</span>
          </div>
        )}
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
 * @param {{ asset: object, style: 'detailed'|'compact', isBest?: boolean, trend?: object|null,
 *   trendStatus?: string, bucketSec?: number, flippable?: boolean }} props - flippable: false while
 *   the page is being arranged (a tap there is a drag)
 */
export default function HomeAssetCard({ asset, style, isBest = false, trend = null, trendStatus = 'idle', flippable = true }) {
  if (!asset.found) return <MissingCard asset={asset} style={style} />;
  if (style === 'compact') return <CompactCard asset={asset} />;
  // The full card (also a section saved with the older "trend" style)
  return <FullCard asset={asset} isBest={isBest} trend={trend} trendStatus={trendStatus} flippable={flippable} />;
}
