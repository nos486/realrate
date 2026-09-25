/**
 * HomeAssetCard.jsx — One asset on the home page, in either card style
 *
 * - detailed: large card. Gold & coins show the bubble analysis (intrinsic value, standard price,
 *   deviation); every other asset shows its price, daily change and source.
 * - compact: small row card (flag/icon, name, symbol, price).
 */

import React from 'react';
import { CategoryIcon } from '../portfolio/utils/holdingHelpers.js';

function formatNum(num) {
  if (num === null || num === undefined || isNaN(num)) return '-';
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

function PriceLine({ value, unit, caption }) {
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
    </div>
  );
}

function GoldDetailedCard({ asset, isBest }) {
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

      {/* Without a market quote, the computed intrinsic value is the useful number */}
      <PriceLine
        value={hasMarket ? item.market : item.intrinsic}
        unit="تومان"
        caption={hasMarket ? null : 'ارزش ذاتی — نرخ بازار فعلاً در دسترس نیست'}
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
    </div>
  );
}

function DetailedCard({ asset }) {
  const change = changeBadge(asset.changePercent);
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
          <span className={`bubble-pill ${change.className}`}>{change.text}</span>
        ) : (
          asset.badge && <span className="bubble-pill disabled">{asset.badge}</span>
        )}
      </div>
      <PriceLine value={asset.price} unit={asset.unit} />
      {meta && <p className="home-card-meta" title={meta}>{meta}</p>}
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
      </div>
    </div>
  );
}

function MissingCard({ asset, style }) {
  return (
    <div className={`${style === 'detailed' ? 'fintech-card' : 'currency-item-card'} home-card-missing`}>
      <span className="curr-persian-name">{asset.id}</span>
      <span className="curr-desc">این مورد فعلاً در بازار نرخی ندارد.</span>
    </div>
  );
}

export default function HomeAssetCard({ asset, style, isBest = false }) {
  if (!asset.found) return <MissingCard asset={asset} style={style} />;
  if (style === 'compact') return <CompactCard asset={asset} />;
  return asset.analysis ? <GoldDetailedCard asset={asset} isBest={isBest} /> : <DetailedCard asset={asset} />;
}
