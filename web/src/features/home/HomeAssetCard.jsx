/**
 * HomeAssetCard.jsx — One asset on the home page, in any of the card styles
 *
 * - detailed (the full card):
 *   Default view shows the 30-day candlestick chart for assets with history.
 *   A sleek mini toggle allows switching to the information/metrics tab.
 *   Keeps the card minimal and thin while offering both views.
 * - compact: small row card (flag/icon, name, symbol, price).
 */

import React from 'react';
import { ChartCandlestick, SlidersHorizontal } from 'lucide-react';
import { CategoryIcon } from '../portfolio/utils/holdingHelpers.js';
import TrendCandles from './TrendCandles.jsx';
import { useHomeCardTab } from './homeCardTab.js';

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
      <CategoryIcon category={asset.category} size={16} />
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

function PriceLine({ value, unit, caption, asset = null, label = 'نرخ روز' }) {
  return (
    <div className="main-price-block">
      <div className="price-top-meta">
        <span className="price-title">{label}</span>
        <StaleMark asset={asset} />
      </div>
      <div className="price-big-row">
        {value ? (
          <>
            <span className="price-big-number">{formatNum(value)}</span>
            <span className="price-big-unit">{unit}</span>
            {asset?.perUnit && <span className="price-per-unit">({asset.perUnit})</span>}
          </>
        ) : (
          <span className="price-unavailable">نرخ در دسترس نیست</span>
        )}
      </div>
      {caption && <span className="home-price-caption">{caption}</span>}
    </div>
  );
}

const TREND_WINDOW_DAYS = 30;
const sinceFormat = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'long', day: 'numeric' });

/** The change from the point before the last (yesterday's close on a daily series) to the last */
function dayChangePct(trend) {
  if (Array.isArray(trend?.candles) && trend.candles.length >= 2) {
    const prevClose = trend.candles[trend.candles.length - 2][3];
    const lastClose = trend.candles[trend.candles.length - 1][3];
    return prevClose > 0 ? ((lastClose - prevClose) / prevClose) * 100 : null;
  }
  const points = trend?.points || [];
  if (points.length < 2) return null;
  const prev = points[points.length - 2];
  return prev > 0 ? ((points[points.length - 1] - prev) / prev) * 100 : null;
}

/**
 * Interactive card body: defaults to candlestick chart if available,
 * with a toggle switch to flip to the financial metrics tab.
 */
function CardBodyBox({
  tab,
  setTab,
  hasCandles,
  young,
  since,
  candles,
  days,
  unit,
  label,
  infoCaption,
  metricsContent,
  loading = false,
}) {
  if (loading) {
    return (
      <div className="home-card-body-box">
        <div className="home-trend-skeleton" aria-hidden="true" />
      </div>
    );
  }

  // If neither candles nor metrics exist, render nothing
  if (!hasCandles && !metricsContent) return null;

  // If no candles exist, render metrics directly without tabs
  if (!hasCandles) {
    return (
      <div className="home-card-body-box">
        <div className="home-card-tab-header">
          <span className="home-card-tab-title">{infoCaption || 'اطلاعات و شاخص‌ها'}</span>
        </div>
        <div className="home-card-tab-content">
          {metricsContent}
        </div>
      </div>
    );
  }

  // Default is 'chart'
  const isChart = tab === 'chart';
  const chartCaption = young && since
    ? `از ${sinceFormat.format(new Date(since))}`
    : `${TREND_WINDOW_DAYS.toLocaleString('fa-IR')} روز اخیر`;

  return (
    <div className="home-card-body-box">
      <div className="home-card-tab-header">
        <div className="home-card-tabs" role="tablist" aria-label="انتخاب نمای کارت">
          <button
            type="button"
            role="tab"
            aria-selected={isChart}
            className={`home-card-tab-btn ${isChart ? 'is-active' : ''}`}
            onClick={() => setTab('chart')}
            title="نمایش نمودار کندلی"
          >
            <ChartCandlestick size={12} aria-hidden="true" />
            <span>نمودار</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isChart}
            className={`home-card-tab-btn ${!isChart ? 'is-active' : ''}`}
            onClick={() => setTab('info')}
            title="نمایش مشخصات و آمار"
          >
            <SlidersHorizontal size={12} aria-hidden="true" />
            <span>اطلاعات</span>
          </button>
        </div>
        <span className="home-card-tab-caption home-trend-caption">
          {isChart ? chartCaption : (infoCaption || 'اطلاعات')}
        </span>
      </div>

      <div className="home-card-tab-content">
        {isChart ? (
          <TrendCandles candles={candles} days={days} unit={unit} label={label} />
        ) : (
          metricsContent
        )}
      </div>
    </div>
  );
}

function GoldDetailedCard({ asset, isBest, trend = null, tab, setTab, trendStatus = 'idle', bucketSec = 0 }) {
  const item = asset.analysis;
  const hasMarket = item.market !== null && item.market !== undefined;
  const badge = bubbleBadge(item);
  const showStandard = item.target_bubble_pct > 0;

  const fromHistory = asset.changePercent === null || asset.changePercent === undefined ? dayChangePct(trend) : null;
  const changeVal = fromHistory !== null ? Number(fromHistory.toFixed(2)) : asset.changePercent;
  const change = changeBadge(changeVal);
  const changeTitle = fromHistory !== null ? 'تغییر نسبت به دیروز' : (asset.changePercent != null ? 'تغییر ۲۴ ساعت گذشته' : undefined);

  const hasCandles = Array.isArray(trend?.candles) && trend.candles.length >= 2 && Array.isArray(trend?.days);
  const young = hasCandles && trend.candles.length * bucketSec < 0.95 * TREND_WINDOW_DAYS * 86400;
  const firstVal = hasCandles ? trend.candles[0][0] : 0;
  const lastVal = hasCandles ? (trend.last || trend.candles[trend.candles.length - 1][3]) : 0;
  const label = `روند ${asset.name}: از ${formatNum(firstVal)} به ${formatNum(lastVal)} تومان`;

  const metricsContent = (hasMarket || showStandard) ? (
    <div className="card-metrics-table">
      {hasMarket && (
        <div className="metric-row">
          <span className="metric-key">
            <span className="metric-indicator is-gold" aria-hidden="true" />
            ارزش ذاتی
          </span>
          <strong className="metric-val gold-val">
            {formatNum(item.intrinsic)}
            <span className="metric-unit">تومان</span>
          </strong>
        </div>
      )}
      {showStandard && (
        <div className="metric-row">
          <span className="metric-key">
            <span className="metric-indicator is-blue" aria-hidden="true" />
            قیمت استاندارد
          </span>
          <strong className="metric-val blue-val">
            {formatNum(item.expected_price)}
            <span className="metric-unit">تومان</span>
          </strong>
        </div>
      )}
      {hasMarket && showStandard && item.diff_from_expected !== null && (
        <div className="metric-row">
          <span className="metric-key">
            <span className={`metric-indicator ${item.diff_from_expected < 0 ? 'is-good' : 'is-warn'}`} aria-hidden="true" />
            انحراف از استاندارد
          </span>
          <strong className={`metric-val ${item.diff_from_expected < 0 ? 'good-val' : 'warn-val'}`}>
            {item.diff_from_expected < 0 ? '−' : '+'}
            {formatPct(item.diff_from_expected_pct)}٪
          </strong>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className={`fintech-card ${isBest ? 'best-choice' : ''}`}>
      <div className="card-top-row">
        <div className="home-card-identity">
          <AssetIcon asset={asset} />
          <div className="home-card-titles">
            <h3 className="card-name">{asset.name}</h3>
            {asset.code && <span className="curr-code-pill">{asset.code}</span>}
            {isBest && <span className="best-choice-pill">بهترین ارزش</span>}
          </div>
        </div>
        <div className="card-badges-cluster">
          <span className={`bubble-pill ${badge.className}`}>{badge.text}</span>
          {change && (
            <span className={`bubble-pill ${change.className}`} title={changeTitle}>
              {change.text}
            </span>
          )}
        </div>
      </div>

      <PriceLine
        value={asset.price || (hasMarket ? item.market : item.intrinsic)}
        unit="تومان"
        caption={hasMarket ? null : 'ارزش ذاتی — نرخ بازار فعلاً در دسترس نیست'}
        asset={asset}
        label={hasMarket ? 'نرخ بازار' : 'ارزش ذاتی'}
      />

      <CardBodyBox
        tab={tab}
        setTab={setTab}
        hasCandles={hasCandles}
        young={young}
        since={trend?.since}
        candles={trend?.candles}
        days={trend?.days}
        unit="تومان"
        label={label}
        infoCaption="تحلیل حباب و ارزش"
        metricsContent={metricsContent}
        loading={!trend && trendStatus === 'loading'}
      />
    </div>
  );
}

function DetailedCard({ asset, trend = null, tab, setTab, trendStatus = 'idle', bucketSec = 0 }) {
  const fromHistory = asset.changePercent === null || asset.changePercent === undefined ? dayChangePct(trend) : null;
  const changeVal = fromHistory !== null ? Number(fromHistory.toFixed(2)) : asset.changePercent;
  const change = changeBadge(changeVal);
  const changeTitle = fromHistory !== null ? 'تغییر نسبت به دیروز' : (asset.changePercent != null ? 'تغییر ۲۴ ساعت گذشته' : undefined);

  const hasCandles = Array.isArray(trend?.candles) && trend.candles.length >= 2 && Array.isArray(trend?.days);
  const young = hasCandles && trend.candles.length * bucketSec < 0.95 * TREND_WINDOW_DAYS * 86400;
  const firstVal = hasCandles ? trend.candles[0][0] : 0;
  const lastVal = hasCandles ? (trend.last || trend.candles[trend.candles.length - 1][3]) : (asset.price || 0);
  const label = `روند ${asset.name}: از ${formatNum(firstVal)} به ${formatNum(lastVal)} ${asset.unit}`;

  const lastCandle = Array.isArray(trend?.candles) && trend.candles.length > 0 ? trend.candles[trend.candles.length - 1] : null;
  const hasCandleMetrics = lastCandle && lastCandle.length >= 4;

  const metaText = [asset.sourceName, asset.note && asset.note !== asset.sourceName ? asset.note : '']
    .filter(Boolean)
    .join(' · ');

  const hasMetrics = hasCandleMetrics || Boolean(metaText);

  const metricsContent = hasMetrics ? (
    <div className="card-metrics-table">
      {hasCandleMetrics && (
        <>
          <div className="metric-row">
            <span className="metric-key">
              <span className="metric-indicator is-blue" aria-hidden="true" />
              دامنه نوسان امروز
            </span>
            <strong className="metric-val">
              {formatNum(lastCandle[1])} <span className="metric-sep">/</span> {formatNum(lastCandle[2])}
              <span className="metric-unit">{asset.unit}</span>
            </strong>
          </div>
          <div className="metric-row">
            <span className="metric-key">
              <span className="metric-indicator is-neutral" aria-hidden="true" />
              قیمت بازگشایی
            </span>
            <strong className="metric-val">
              {formatNum(lastCandle[0])}
              <span className="metric-unit">{asset.unit}</span>
            </strong>
          </div>
        </>
      )}
      {metaText && (
        <div className={`metric-row ${hasCandleMetrics ? 'metric-source-row' : ''}`}>
          <span className="metric-key">
            <span className="metric-indicator is-neutral" aria-hidden="true" />
            مرجع قیمت
          </span>
          <span className="metric-val is-meta" title={metaText}>
            {metaText}
          </span>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="fintech-card">
      <div className="card-top-row">
        <div className="home-card-identity">
          <AssetIcon asset={asset} />
          <div className="home-card-titles">
            <h3 className="card-name">{asset.name}</h3>
            {asset.code && <span className="curr-code-pill">{asset.code}</span>}
          </div>
        </div>
        <div className="card-badges-cluster">
          {change ? (
            <span className={`bubble-pill ${change.className}`} title={changeTitle}>
              {change.text}
            </span>
          ) : (
            asset.badge && <span className="bubble-pill disabled">{asset.badge}</span>
          )}
        </div>
      </div>

      <PriceLine
        value={asset.price || trend?.last || null}
        unit={asset.unit}
        asset={asset}
        label="نرخ روز"
      />

      <CardBodyBox
        tab={tab}
        setTab={setTab}
        hasCandles={hasCandles}
        young={young}
        since={trend?.since}
        candles={trend?.candles}
        days={trend?.days}
        unit={asset.unit}
        label={label}
        infoCaption="آمار و مرجع نرخ"
        metricsContent={metricsContent}
        loading={!trend && trendStatus === 'loading'}
      />
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
  const [tab, setTab] = useHomeCardTab();
  if (!asset.found) return <MissingCard asset={asset} style={style} />;
  if (style === 'compact') return <CompactCard asset={asset} />;
  return asset.analysis
    ? <GoldDetailedCard asset={asset} isBest={isBest} trend={trend} tab={tab} setTab={setTab} trendStatus={trendStatus} bucketSec={bucketSec} />
    : <DetailedCard asset={asset} trend={trend} tab={tab} setTab={setTab} trendStatus={trendStatus} bucketSec={bucketSec} />;
}

