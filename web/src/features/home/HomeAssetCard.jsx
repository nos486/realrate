/**
 * HomeAssetCard.jsx — One asset on the home page, in any of the card styles
 *
 * - detailed (the full card): gold & coins show the bubble analysis (intrinsic value, standard
 *   price, deviation); every other asset its price, daily change and source. Below, the last 30
 *   days from the price history, as a line or as candles (one switch for every card).
 * - compact: small row card (flag/icon, name, symbol, price).
 * A section saved with the older "trend" style is shown as full cards.
 */

import React from 'react';
import { ChartLine, ChartCandlestick } from 'lucide-react';
import { CategoryIcon } from '../portfolio/utils/holdingHelpers.js';
import TrendSparkline from './TrendSparkline.jsx';
import TrendCandles from './TrendCandles.jsx';
import { useTrendChartStyle } from './trendChartStyle.js';

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

function PriceLine({ value, unit, caption, asset = null }) {
  return (
    <div className="main-price-block">
      <div className="price-big-row">
        {value ? (
          <>
            <span className="price-big-number">{formatNum(value)}</span>
            <span className="price-big-unit">{unit}</span>
          </>
        ) : (
          <span className="price-unavailable">نرخ در دسترس نیست</span>
        )}
      </div>
      {caption && <span className="home-price-caption">{caption}</span>}
      <StaleMark asset={asset} />
    </div>
  );
}

function GoldDetailedCard({ asset, isBest, chart = null }) {
  const item = asset.analysis;
  const hasMarket = item.market !== null && item.market !== undefined;
  const badge = bubbleBadge(item);
  const showStandard = item.target_bubble_pct > 0;

  return (
    <div className={`fintech-card ${isBest ? 'best-choice' : ''}`}>
      <div className="card-top-row">
        <h3 className="card-name">{asset.name}</h3>
        <span className={`bubble-pill ${badge.className}`}>{badge.text}</span>
      </div>

      {/* The price book's price; without a market quote the calculator's intrinsic value */}
      <PriceLine
        value={asset.price || (hasMarket ? item.market : item.intrinsic)}
        unit="تومان"
        caption={hasMarket ? null : 'ارزش ذاتی — نرخ بازار فعلاً در دسترس نیست'}
        asset={asset}
      />

      {(hasMarket || showStandard) && (
        <div className="card-metrics-table">
          {hasMarket && (
            <div className="metric-row">
              <span className="metric-key">ارزش ذاتی</span>
              <strong className="metric-val gold-val">{formatNum(item.intrinsic)}</strong>
            </div>
          )}
          {showStandard && (
            <div className="metric-row">
              <span className="metric-key">قیمت استاندارد</span>
              <strong className="metric-val blue-val">{formatNum(item.expected_price)}</strong>
            </div>
          )}
          {hasMarket && showStandard && item.diff_from_expected !== null && (
            <div className="metric-row">
              <span className="metric-key">انحراف از استاندارد</span>
              <strong className={`metric-val ${item.diff_from_expected < 0 ? 'good-val' : 'warn-val'}`}>
                {item.diff_from_expected < 0 ? '−' : '+'}
                {formatPct(item.diff_from_expected_pct)}٪
              </strong>
            </div>
          )}
        </div>
      )}
      {chart}
    </div>
  );
}

function DetailedCard({ asset, trend = null, chart = null }) {
  // The source's daily change, or else the history's change since yesterday
  const fromHistory = asset.changePercent === null || asset.changePercent === undefined ? dayChangePct(trend) : null;
  const change = changeBadge(fromHistory !== null ? Number(fromHistory.toFixed(2)) : asset.changePercent);
  const meta = [asset.sourceName, asset.note && asset.note !== asset.sourceName ? asset.note : '']
    .filter(Boolean)
    .join('، ');
  return (
    <div className="fintech-card">
      <div className="card-top-row">
        <div className="home-card-identity">
          <AssetIcon asset={asset} />
          <h3 className="card-name">{asset.name}</h3>
          {asset.code && <span className="curr-code-pill">{asset.code}</span>}
        </div>
        {change ? (
          <span className={`bubble-pill ${change.className}`} title={fromHistory !== null ? 'تغییر نسبت به دیروز' : undefined}>
            {change.text}
          </span>
        ) : (
          asset.badge && <span className="bubble-pill disabled">{asset.badge}</span>
        )}
      </div>
      <PriceLine value={asset.price || trend?.last || null} unit={asset.unit} asset={asset} />
      {meta && <p className="home-card-meta" title={meta}>{meta}</p>}
      {chart}
    </div>
  );
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

const TREND_WINDOW_DAYS = 30;
const sinceFormat = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'long', day: 'numeric' });

/** The change from the point before the last (yesterday's close on a daily series) to the last */
function dayChangePct(trend) {
  const points = trend?.points || [];
  if (points.length < 2) return null;
  const prev = points[points.length - 2];
  return prev > 0 ? ((points[points.length - 1] - prev) / prev) * 100 : null;
}

function TrendBody({ asset, unit, trend, status, bucketSec }) {
  const [chartStyle, setChartStyle] = useTrendChartStyle();
  if (trend && trend.points.length >= 2) {
    const direction = trend.changePct > 0 ? 'up' : trend.changePct < 0 ? 'down' : 'flat';
    // A history younger than the window (fewer points than it holds) says where it starts
    const young = trend.points.length * bucketSec < 0.95 * TREND_WINDOW_DAYS * 86400;
    const label = `روند ${asset.name}: از ${formatNum(trend.first)} به ${formatNum(trend.last)} ${unit}`;
    const hasCandles = Array.isArray(trend.candles) && trend.candles.length === trend.points.length && Array.isArray(trend.days);
    const showCandles = hasCandles && chartStyle === 'candles';
    return (
      <>
        {showCandles ? (
          <TrendCandles candles={trend.candles} days={trend.days} unit={unit} label={label} />
        ) : (
          <TrendSparkline
            points={trend.points}
            since={trend.since}
            bucketSec={bucketSec}
            unit={unit}
            direction={direction}
            label={label}
          />
        )}
        <div className="home-trend-foot">
          <p className="home-trend-caption">
            {young ? `از ${sinceFormat.format(new Date(trend.since))}` : `${TREND_WINDOW_DAYS.toLocaleString('fa-IR')} روز اخیر`}
          </p>
          {hasCandles && (
            <div className="home-trend-switch" role="group" aria-label="نوع نمودار">
              <button
                type="button"
                className={chartStyle !== 'candles' ? 'is-active' : ''}
                aria-pressed={chartStyle !== 'candles'}
                title="نمودار خطی"
                onClick={() => setChartStyle('line')}
              >
                <ChartLine size={13} />
              </button>
              <button
                type="button"
                className={chartStyle === 'candles' ? 'is-active' : ''}
                aria-pressed={chartStyle === 'candles'}
                title="نمودار کندلی"
                onClick={() => setChartStyle('candles')}
              >
                <ChartCandlestick size={13} />
              </button>
            </div>
          )}
        </div>
      </>
    );
  }
  if (!trend && status === 'loading') return <div className="home-trend-skeleton" aria-hidden="true" />;
  // No history for this asset (or none reachable now): the full card simply has no chart
  return null;
}

function MissingCard({ asset, style }) {
  return (
    <div className={`${style === 'compact' ? 'currency-item-card' : 'fintech-card'} home-card-missing`}>
      <span className="curr-persian-name">{asset.id}</span>
      <span className="curr-desc">این مورد فعلاً در بازار نرخی ندارد.</span>
    </div>
  );
}

/**
 * @param {{ asset: object, style: 'detailed'|'compact', isBest?: boolean,
 *   trend?: object|null, trendStatus?: string, bucketSec?: number }} props
 */
export default function HomeAssetCard({ asset, style, isBest = false, trend = null, trendStatus = 'idle', bucketSec = 0 }) {
  if (!asset.found) return <MissingCard asset={asset} style={style} />;
  if (style === 'compact') return <CompactCard asset={asset} />;
  // The full card (also a section saved with the older "trend" style)
  const chart = (
    <div className="home-card-chart">
      <TrendBody asset={asset} unit={asset.unit} trend={trend} status={trendStatus} bucketSec={bucketSec} />
    </div>
  );
  return asset.analysis
    ? <GoldDetailedCard asset={asset} isBest={isBest} chart={chart} />
    : <DetailedCard asset={asset} trend={trend} chart={chart} />;
}
