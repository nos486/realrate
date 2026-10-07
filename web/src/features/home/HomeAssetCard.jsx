/**
 * HomeAssetCard.jsx — One asset on the home page, in any of the card styles
 *
 * - detailed (the full card): a card that turns over. The front: its main figure (the last price,
 *   or the 30-day / one-year average the user chose), its change (the last session's, from the
 *   price book), when it was last updated («۳۰ دقیقه پیش»), its slots (up to three values of the
 *   asset or of a linked one — a coin's bubble; for gold & coins the bubble analysis until chosen),
 *   and today's low and high (from the price book). Tapped (or Enter / Space), it turns to its back: only the
 *   candles (۱ ماه / ۶ ماه / ۱ سال), fetched the first time that card is turned — nothing loads
 *   before; the card is locked while they load.
 * - compact: small row card (flag/icon, name, symbol, its main figure).
 * A dollar-priced asset (the ounce, oil) reads in dollars, or in tomans when its card is set so
 * (`asset.display: 'toman'`, homeAssets.js): then the dollar price is the small line under it.
 * A section saved with the older "trend" style is shown as full cards.
 */

import React, { useState } from 'react';
import { ChartCandlestick } from 'lucide-react';
import { CategoryIcon } from '../portfolio/utils/holdingHelpers.js';
import TrendCandles from './TrendCandles.jsx';
import { useAssetCandles } from './useAssetCandles.js';
import { formatPrice } from '../market/assetPrice.js';
import { AVERAGE_WINDOWS } from '../../utils/priceAverages.js';
import { timeAgo } from '../../shared/utils/timeAgo.js';

// In the asset's own currency: dollars keep their cents, tomans are whole (a coin worth 0.37
// toman is not 0)
const formatNum = (num, currency = 'toman') => formatPrice(num, currency);

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
        <div className="curr-price-val" title={asset.main ? `${asset.main.label} — آخرین قیمت ${formatNum(asset.price, asset.currency)}` : undefined}>
          {asset.main ? formatNum(asset.main.value, asset.main.currency) : asset.price ? formatNum(asset.price, asset.currency) : '—'}
          <span className="curr-unit">{asset.unit}</span>
        </div>
        {asset.main && <span className="curr-main-label">{asset.main.label}</span>}
        {change && <span className={`home-change ${change.className}`}>{change.text}</span>}
        <StaleMark asset={asset} />
      </div>
    </div>
  );
}

/** Today's low and high (from the price book: no query) */
function DayRange({ range, currency }) {
  if (!range) return null;
  return (
    <div className="pro-range-labels" title="دامنه‌ی نوسان امروز">
      <span><small>کف امروز</small> {formatNum(range.low, currency)}</span>
      <span><small>سقف امروز</small> {formatNum(range.high, currency)}</span>
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

const signed = (v, digits = 1) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${formatPct(v, digits)}٪`;

/** How a slot's value reads: its tone (a CSS class) by what it is */
function slotTone(slot) {
  if (slot.value === null) return '';
  if (slot.key.endsWith('intrinsic')) return 'gold-val';
  if (slot.key.endsWith('standard')) return 'blue-val';
  // Below the standard price is the better buy
  if (slot.key.endsWith('deviation')) return slot.value < 0 ? 'good-val' : 'warn-val';
  if (slot.key.endsWith('change')) return slot.value > 0 ? 'up-val' : slot.value < 0 ? 'down-val' : '';
  return '';
}

/** An average of fewer days than its window says how many («از ۲۰۰ روز») */
const daysNote = (window, days) => (window && days && days < AVERAGE_WINDOWS[window]?.days ? `از ${Number(days).toLocaleString('fa-IR')} روز ثبت‌شده` : '');

function slotText(slot) {
  if (slot.value === null) return '—';
  if (slot.kind === 'pct') return slot.key.endsWith('change') || slot.key.endsWith('deviation') ? signed(slot.value) : `${formatPct(slot.value)}٪`;
  return `${slot.currency === 'usd' ? '$' : ''}${formatNum(slot.value, slot.currency)}`;
}

/** The card's slots: up to three small figures (its own values, or a linked asset's) */
function CardSlots({ slots }) {
  if (!slots?.length) return null;
  return (
    <div className="pro-metrics">
      {slots.map((slot) => {
        const label = slot.linkedName ? `${slot.label} · ${slot.linkedName}` : slot.label;
        const note = daysNote(slot.window, slot.days);
        return (
          <div key={slot.key} className="pro-metric" title={note ? `${label} (${note})` : label}>
            <span>{slot.label}</span>
            {slot.linkedName && <small>{slot.linkedName}</small>}
            <strong className={slotTone(slot)}><bdi>{slotText(slot)}</bdi></strong>
          </div>
        );
      })}
    </div>
  );
}

/** «میانگین ۳۰ روز · آخرین قیمت ۱۲۰٬۰۰۰» under a main figure that isn't the last price */
function MainCaption({ asset, price, currency }) {
  if (asset.main) {
    const note = daysNote(asset.main.window, asset.main.days);
    return (
      <span className="home-price-caption">
        {asset.main.label}{note ? ` (${note})` : ''} · آخرین قیمت {price ? formatNum(price, currency) : '—'}
      </span>
    );
  }
  if (asset.mainMissing) return <span className="home-price-caption">{asset.mainMissing} هنوز ثبت نشده — آخرین قیمت</span>;
  return null;
}

const CANDLE_RANGES = [
  { value: '30d', label: '۱ ماه' },
  { value: '180d', label: '۶ ماه' },
  { value: '1y', label: '۱ سال' },
];

/**
 * The full card: details in front; turned (tap, Enter / Space), only its candles on the back.
 * The candles are fetched the first time the card is turned, and again for another window
 * (۱ ماه / ۶ ماه / ۱ سال — back to ۱ ماه every time it is turned again); while they load the
 * card is locked (it shows it, and doesn't turn).
 * A tap on the back — the chart included — turns it to the front again.
 */
function FullCard({ asset, isBest = false, flippable = true }) {
  const [requested, setRequested] = useState(false);
  const [opened, setOpened] = useState(false);
  const [range, setRange] = useState('30d');
  const [shown, setShown] = useState(null); // the last series drawn (kept while another window loads)
  // Only while the back is asked for: the front never fetches
  // A dollar-priced asset's chart is its dollar closes (`${id}@usd`)
  const { status, series } = useAssetCandles(asset.seriesId || asset.id, flippable && requested, range);
  const loading = status === 'loading';
  const settled = status === 'ready' || status === 'empty' || status === 'error';
  // The first answer turns the card; later windows redraw it in place
  if (requested && settled && !opened) setOpened(true);
  if (status === 'ready' && series && series !== shown) setShown(series);

  const item = asset.analysis || null;
  const hasMarket = item ? item.market !== null && item.market !== undefined : true;
  const price = asset.price || (item ? (hasMarket ? item.market : item.intrinsic) : null) || null;
  const unit = item ? 'تومان' : asset.unit;
  const currency = item ? 'toman' : asset.currency;
  // The book's change of its last session (params.changePercent, set by the sync)
  const change = changeBadge(asset.changePercent);
  const isFlipped = flippable && requested && opened;
  const direction = change?.className === 'badge-good' ? 'up' : change ? 'down' : 'flat';

  const toggle = () => {
    if (!flippable || loading) return;
    // Turned back to the front: the next turn starts again at 30 days
    if (requested) setRange('30d');
    setRequested(!requested);
  };
  const onKeyDown = (e) => {
    if (!flippable || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    toggle();
  };
  const pickRange = (e, value) => {
    e.stopPropagation();
    if (!loading) setRange(value);
  };

  const changePill = change && (
    <span className={`bubble-pill ${change.className}`} title="تغییر نسبت به پایانی جلسه‌ی قبل">
      <bdi>{change.text}</bdi>
    </span>
  );
  const pill = item ? <span className={`bubble-pill ${bubbleBadge(item).className}`}>{bubbleBadge(item).text}</span> : changePill;
  const backSeries = status === 'ready' ? series : loading ? shown : null;

  return (
    <div
      className={`home-pro-card is-${direction} ${isBest ? 'best-choice' : ''} ${flippable ? 'can-flip' : ''} ${isFlipped ? 'is-flipped' : ''} ${loading ? 'is-loading' : ''}`}
      aria-busy={loading}
      {...(flippable
        ? {
            role: 'button',
            tabIndex: 0,
            'aria-pressed': isFlipped,
            'aria-label': isFlipped ? `${asset.name}: بازگشت به جزئیات` : `${asset.name}: نمایش نمودار کندلی`,
            onClick: toggle,
            onKeyDown,
          }
        : {})}
    >
      <div className="pro-card-inner">
        <div className="pro-card-face is-front" aria-hidden={isFlipped}>
          <CardHead asset={asset} pill={pill} />
          <div className="pro-card-price">
            {asset.main ? (
              <>
                <span className="pro-card-price-value">{formatNum(asset.main.value, asset.main.currency)}</span>
                <span className="pro-card-price-unit">{unit}</span>
              </>
            ) : price ? (
              <>
                <span className="pro-card-price-value">{formatNum(price, currency)}</span>
                <span className="pro-card-price-unit">{unit}</span>
              </>
            ) : (
              <span className="price-unavailable">نرخ در دسترس نیست</span>
            )}
            {item && changePill}
          </div>
          <MainCaption asset={asset} price={price} currency={currency} />
          {asset.display === 'toman' && asset.note && <span className="home-price-caption">{asset.note}</span>}
          {item && !hasMarket && <span className="home-price-caption">ارزش ذاتی — نرخ بازار فعلاً در دسترس نیست</span>}
          <StaleMark asset={asset} />
          {asset.updatedAt && (
            <span className="pro-card-updated" title={new Date(asset.updatedAt).toLocaleString('fa-IR')}>
              به‌روزرسانی {timeAgo(asset.updatedAt)}
            </span>
          )}
          <CardSlots slots={asset.slots} />
          <div className="pro-card-foot">
            <DayRange range={asset.dayRange} currency={asset.currency} />
            {flippable && (
              <span className={`pro-card-hint ${loading && !opened ? 'is-spinning' : ''}`} aria-hidden="true">
                <ChartCandlestick size={13} />
              </span>
            )}
          </div>
        </div>
        {flippable && opened && (
          <div className="pro-card-face is-back" aria-hidden={!isFlipped}>
            <div className="pro-card-ranges" role="group" aria-label="بازه‌ی نمودار">
              {CANDLE_RANGES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  className={range === r.value ? 'is-active' : ''}
                  aria-pressed={range === r.value}
                  disabled={loading}
                  onClick={(e) => pickRange(e, r.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {backSeries?.candles?.length ? (
              <div className={`pro-card-chart ${loading ? 'is-loading' : ''}`}>
                <TrendCandles candles={backSeries.candles} days={backSeries.days} unit={unit} currency={currency} label={`نمودار کندلی ${asset.name}`} />
              </div>
            ) : loading ? (
              <div className="pro-card-back-state is-loading" aria-label="در حال دریافت نمودار" role="status" />
            ) : (
              <div className="pro-card-back-state">{status === 'error' ? 'نمودار فعلاً در دسترس نیست' : 'تاریخچه‌ای برای این بازه ثبت نشده'}</div>
            )}
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
 * @param {{ asset: object, style: 'detailed'|'compact', isBest?: boolean, flippable?: boolean }} props
 *   flippable: false while the page is being arranged (a tap there is a drag)
 */
export default function HomeAssetCard({ asset, style, isBest = false, flippable = true }) {
  if (!asset.found) return <MissingCard asset={asset} style={style} />;
  if (style === 'compact') return <CompactCard asset={asset} />;
  // The full card (also a section saved with the older "trend" style)
  return <FullCard asset={asset} isBest={isBest} flippable={flippable} />;
}
