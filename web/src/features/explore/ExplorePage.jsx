/**
 * ExplorePage.jsx — «کاوش بازار» (/explore): look up ANY market asset (gold, coins, currencies,
 * crypto, exchange symbols, funds, ...) and see its live price and, mostly, its candle chart,
 * without saving anything — no home card, no portfolio entry.
 *
 * Everything is read off what the app already holds: the price book (search and the price line,
 * via homeAssets.js) and, for the chart, the same daily candles the home cards use. The chosen
 * asset lives in the URL (`?a=<id>`), so a refresh or a shared link opens the same asset.
 * Pro only (feature `market`: its chart route is gated by it too).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Compass, Search, ArrowRight } from 'lucide-react';
import FeaturePageHeader from '../../shared/ui/FeaturePageHeader.jsx';
import TextField from '../../shared/ui/TextField.jsx';
import { usePricing } from '../market/context/PricingContext.jsx';
import { ownPriceOf, formatPrice } from '../market/assetPrice.js';
import { CategoryIcon } from '../portfolio/utils/holdingHelpers.js';
import PriceChart from './PriceChart.jsx';
import { useCardCandles } from '../home/useAssetCandles.js';
import { buildAssetIndex, resolveHomeAsset } from '../home/homeAssets.js';
import { timeAgo } from '../../shared/utils/timeAgo.js';

const CATEGORY_FILTERS = [
  { key: '', label: 'همه' },
  { key: 'gold_coin', label: 'طلا و سکه' },
  { key: 'silver', label: 'نقره' },
  { key: 'currency', label: 'ارز' },
  { key: 'crypto', label: 'رمزارز' },
  { key: 'bourse', label: 'بورس' },
  { key: 'bourse_fund', label: 'صندوق' },
];

/** The history loaded so far, longest last: the chart asks for the next when scrolled past the oldest day */
const HISTORY_STEPS = ['180d', '1y', '2y'];

const RESULT_LIMIT = 60;

/** Price in the asset's own currency ("$" before a dollar one) */
function OwnPrice({ asset }) {
  const own = ownPriceOf(asset);
  if (!own.value) return '—';
  return own.currency === 'usd' ? <bdi>${formatPrice(own.value, 'usd')}</bdi> : formatPrice(own.value);
}

/**
 * The asset's candles: six months to start, then a longer history (one year, two) whenever the
 * chart is scrolled or zoomed past the oldest day shown; the chart keeps what it has while the
 * longer one loads
 */
function ExploreChart({ asset, onClose }) {
  const [step, setStep] = useState(0);
  const { status, series } = useCardCandles(asset, true, HISTORY_STEPS[step]);
  const [loaded, setLoaded] = useState(null); // { series, step }: the last one drawn (kept while a longer one loads)
  if (status === 'ready' && series && series !== loaded?.series) setLoaded({ series, step });
  const shown = loaded?.series || null;
  const loading = status === 'loading';
  // Asked once per step: only when the longer history is not already on its way
  const more = loaded && loaded.step === step && step < HISTORY_STEPS.length - 1 ? () => setStep(loaded.step + 1) : null;
  const header = <ChartTitle asset={asset} onClose={onClose} loading={loading && Boolean(shown)} />;
  return (
    <section className="explore-panel" aria-label={`نمودار ${asset.name}`}>
      {shown?.candles?.length ? (
        <PriceChart
          candles={shown.candles}
          days={shown.days}
          unit={asset.unit}
          currency={asset.currency}
          label={`نمودار کندلی ${asset.name}`}
          onNeedOlder={more}
          header={header}
        />
      ) : (
        <>
          {header}
          <div className={`explore-chart-state ${loading ? 'is-loading' : ''}`} role={loading ? 'status' : undefined}>
            {loading || status === 'idle'
              ? 'در حال دریافت نمودار…'
              : status === 'error'
                ? 'نمودار فعلاً در دسترس نیست'
                : 'تاریخچه‌ای برای این دارایی ثبت نشده'}
          </div>
        </>
      )}
    </section>
  );
}

const changeOf = (pct) => (pct ? { up: pct > 0, text: `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct).toLocaleString('fa-IR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}٪` } : null);

/**
 * The chart's title line (no card of its own): who the asset is, its live price and change, and
 * when it last moved; on a phone a back button to the list
 */
function ChartTitle({ asset, onClose, loading }) {
  const change = changeOf(asset.changePercent);
  const price = asset.price ? formatPrice(asset.price, asset.currency) : null;
  return (
    <div className="explore-title">
      <button type="button" className="explore-back" onClick={onClose} aria-label="بازگشت به فهرست">
        <ArrowRight size={18} />
      </button>
      <span className="home-asset-icon" aria-hidden="true">
        {asset.flag || <CategoryIcon category={asset.category} size={15} />}
      </span>
      <div className="explore-title-names">
        <h2>{asset.name}</h2>
        {asset.code && <span>{asset.code}</span>}
      </div>
      <div className="explore-title-price">
        {price ? (
          <strong><bdi>{asset.currency === 'usd' && '$'}{price}</bdi> <small>{asset.unit}</small></strong>
        ) : (
          <strong className="price-unavailable">نرخ در دسترس نیست</strong>
        )}
        <span className="explore-title-sub">
          {change && <span className={`explore-change ${change.up ? 'is-up' : 'is-down'}`}><bdi>{change.text}</bdi></span>}
          {asset.stale ? <span className="home-stale-mark">قدیمی</span> : asset.updatedAt && <span>{timeAgo(asset.updatedAt)}</span>}
          {loading && <span role="status">در حال دریافت تاریخچه…</span>}
        </span>
      </div>
    </div>
  );
}

/** The chosen asset: its chart, nothing else */
function ExploreDetail({ id, index, onClose }) {
  const asset = useMemo(() => resolveHomeAsset(id, index), [id, index]);
  if (!asset.found) {
    return <div className="explore-empty">این مورد فعلاً در بازار نرخی ندارد.</div>;
  }
  return (
    <ExploreChart key={asset.id} asset={asset} onClose={onClose} />
  );
}

const WIDE_QUERY = '(min-width: 900px)';

/** Whether the list and the chart sit side by side (the layout's breakpoint, explore.css) */
function useWideScreen() {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.(WIDE_QUERY).matches));
  useEffect(() => {
    const mq = window.matchMedia?.(WIDE_QUERY);
    if (!mq) return undefined;
    const onChange = () => setWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
}

export default function ExplorePage() {
  const pricing = usePricing();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('a') || '';
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');

  const index = useMemo(
    () => buildAssetIndex({ itemMap: pricing?.itemMap, analysis: [] }),
    [pricing?.itemMap],
  );

  const results = useMemo(() => {
    if (!pricing?.searchAssets) return [];
    return pricing
      .searchAssets(query, { category, limit: RESULT_LIMIT })
      .filter((a) => a?.id && a.category !== 'cash');
  }, [pricing, query, category]);

  // Wide screens never sit empty: until one is chosen, the first in the list (the dollar) is charted
  const wide = useWideScreen();
  const shownId = selectedId || (wide ? results[0]?.id || '' : '');

  const select = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('a', id);
    else next.delete('a');
    setParams(next, { replace: true });
  };

  return (
    <div className="explore-page">
      <FeaturePageHeader
        icon={<Compass size={22} />}
        title="کاوش بازار"
        help="explore"
      />

      <div className={`explore-layout ${selectedId ? 'has-selection' : ''}`}>
        <div className="explore-search-col">
          <div className="asset-picker">
            <div className="asset-picker-search">
              <Search size={15} aria-hidden="true" />
              <TextField
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="نام یا نماد (مثلاً دلار، BTC، فولاد، عیار)…"
                aria-label="جستجوی دارایی"
              />
            </div>
            <div className="asset-picker-filters" role="group" aria-label="دسته‌بندی">
              {CATEGORY_FILTERS.map((f) => (
                <button
                  key={f.key || 'all'}
                  type="button"
                  className={`tx-filter-pill ${category === f.key ? 'active' : ''}`}
                  onClick={() => setCategory(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {results.length === 0 ? (
              <p className="asset-picker-empty">{pricing?.loading ? 'در حال دریافت قیمت‌ها…' : 'موردی پیدا نشد.'}</p>
            ) : (
              <ul className="asset-picker-list explore-list">
                {results.map((asset) => (
                  <li key={asset.id}>
                    <button
                      type="button"
                      className={`asset-picker-row explore-row ${shownId === asset.id ? 'is-added' : ''}`}
                      onClick={() => select(asset.id)}
                      aria-pressed={shownId === asset.id}
                    >
                      <span className="home-asset-icon" aria-hidden="true">
                        {asset.flag || <CategoryIcon category={asset.category} size={14} />}
                      </span>
                      <span className="asset-picker-name">
                        <strong>{asset.name}</strong>
                        <small>{[asset.badge, asset.code || asset.symbol].filter(Boolean).join(' • ')}</small>
                      </span>
                      <span className="asset-picker-price"><OwnPrice asset={asset} /></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="explore-detail-col">
          {shownId ? (
            <ExploreDetail id={shownId} index={index} onClose={() => select('')} />
          ) : (
            <div className="explore-empty">یک دارایی را از فهرست انتخاب کنید تا نمودارش اینجا باز شود.</div>
          )}
        </div>
      </div>
    </div>
  );
}
