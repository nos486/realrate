/**
 * HomeAssetCard.jsx — One asset on the home page, in either card style
 *
 * - detailed: large card. Gold & coins show the full bubble analysis (intrinsic value, standard
 *   price, deviation); every other asset shows its price, daily change and source.
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
  if (!hasMarket) return { className: 'disabled', text: 'ناموجود در بازار' };
  const pct = formatPct(item.bubble_pct);
  if (item.bubble_pct < 0) return { className: 'badge-good', text: `حباب منفی: ${pct}٪` };
  if (item.bubble_pct <= 5) return { className: 'badge-blue', text: `حباب: +${pct}٪` };
  if (item.bubble_pct <= 15) return { className: 'badge-orange', text: `حباب: +${pct}٪` };
  return { className: 'badge-danger', text: `حباب: +${pct}٪` };
}

function changeBadge(changePercent) {
  if (changePercent === null || changePercent === undefined || changePercent === 0) return null;
  return {
    className: changePercent > 0 ? 'badge-good' : 'badge-danger',
    text: `${changePercent > 0 ? '▲' : '▼'} ${formatPct(changePercent, 2)}٪`,
  };
}

function GoldAnalysisBody({ item }) {
  const hasMarket = item.market !== null && item.market !== undefined;
  return (
    <>
      <div className="main-price-block">
        <div className="price-big-row">
          {hasMarket ? (
            <>
              <span className="price-big-number">{formatNum(item.market)}</span>
              <span className="price-big-unit">تومان</span>
            </>
          ) : (
            <span className="price-unavailable">ناموجود</span>
          )}
        </div>
      </div>
      <div className="card-metrics-table">
        <div className="metric-row">
          <span className="metric-key">ارزش طلای خام:</span>
          <strong className="metric-val gold-val">{formatNum(item.intrinsic)} تومان</strong>
        </div>
        {item.target_bubble_pct > 0 && (
          <div className="metric-row">
            <span className="metric-key">قیمت استاندارد:</span>
            <strong className="metric-val blue-val">{formatNum(item.expected_price)} تومان</strong>
          </div>
        )}
        {hasMarket && item.target_bubble_pct > 0 && item.diff_from_expected !== null && (
          <div className="metric-row">
            <span className="metric-key">انحراف از استاندارد:</span>
            <strong className={`metric-val ${item.diff_from_expected < 0 ? 'good-val' : 'warn-val'}`}>
              {item.diff_from_expected < 0 ? '-' : '+'}
              {formatNum(Math.abs(item.diff_from_expected))} تومان ({formatPct(item.diff_from_expected_pct)}٪)
            </strong>
          </div>
        )}
      </div>
    </>
  );
}

function AssetIcon({ asset, size = 'md' }) {
  if (asset.flag) return <span className="curr-flag-emoji">{asset.flag}</span>;
  return (
    <span className={`home-asset-icon is-${size}`} aria-hidden="true">
      <CategoryIcon category={asset.category} size={size === 'lg' ? 18 : 15} />
    </span>
  );
}

function DetailedCard({ asset, isBest }) {
  if (asset.analysis) {
    const badge = bubbleBadge(asset.analysis);
    return (
      <div className={`fintech-card ${isBest ? 'best-choice' : ''}`}>
        <div className="card-top-row">
          <div className="card-identity">
            <h3 className="card-name">{asset.name}</h3>
          </div>
          <span className={`bubble-pill ${badge.className}`}>{badge.text}</span>
        </div>
        <GoldAnalysisBody item={asset.analysis} />
      </div>
    );
  }

  const change = changeBadge(asset.changePercent);
  return (
    <div className="fintech-card">
      <div className="card-top-row">
        <div className="card-identity home-card-identity">
          <AssetIcon asset={asset} size="lg" />
          <h3 className="card-name">{asset.name}</h3>
        </div>
        {change ? (
          <span className={`bubble-pill ${change.className}`}>{change.text}</span>
        ) : (
          asset.badge && <span className="bubble-pill disabled">{asset.badge}</span>
        )}
      </div>
      <div className="main-price-block">
        <div className="price-big-row">
          {asset.price ? (
            <>
              <span className="price-big-number">{formatNum(asset.price)}</span>
              <span className="price-big-unit">{asset.unit}</span>
            </>
          ) : (
            <span className="price-unavailable">ناموجود</span>
          )}
        </div>
      </div>
      <div className="card-metrics-table">
        {asset.code && (
          <div className="metric-row">
            <span className="metric-key">نماد:</span>
            <strong className="metric-val" dir="ltr">{asset.code}</strong>
          </div>
        )}
        {asset.sourceName && (
          <div className="metric-row">
            <span className="metric-key">منبع:</span>
            <strong className="metric-val">{asset.sourceName}</strong>
          </div>
        )}
        {asset.note && <div className="home-card-note">{asset.note}</div>}
      </div>
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
          <span className="curr-desc">{asset.note}</span>
        </div>
      </div>
      <div className="curr-price-block">
        <div className="curr-price-val">
          {asset.price ? formatNum(asset.price) : '—'}
          <span className="curr-unit">{asset.unit}</span>
        </div>
        {change ? (
          <span className={`home-change ${change.className}`}>{change.text}</span>
        ) : (
          asset.subPriceText && <span className="curr-ratio-tag">{asset.subPriceText}</span>
        )}
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
  return style === 'detailed' ? <DetailedCard asset={asset} isBest={isBest} /> : <CompactCard asset={asset} />;
}
