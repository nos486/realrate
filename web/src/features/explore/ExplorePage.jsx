/**
 * ExplorePage.jsx — «کاوش بازار» (/explore): look up ANY market asset (gold, coins, currencies,
 * crypto, exchange symbols, funds, ...) and see its live price, what the price book knows about it
 * and its candle chart, without saving anything — no home card, no portfolio entry.
 *
 * Everything is read off what the app already holds: the price book (search and every figure,
 * via homeAssets.js) and, for the chart, the same daily candles the home cards use. The chosen
 * asset lives in the URL (`?a=<id>`), so a refresh or a shared link opens the same asset.
 * Pro only (feature `market`: its chart route is gated by it too).
 */

import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Compass, Search, X } from 'lucide-react';
import FeaturePageHeader from '../../shared/ui/FeaturePageHeader.jsx';
import TextField from '../../shared/ui/TextField.jsx';
import { usePricing } from '../market/context/PricingContext.jsx';
import { ownPriceOf, formatPrice } from '../market/assetPrice.js';
import { CategoryIcon } from '../portfolio/utils/holdingHelpers.js';
import HomeAssetCard from '../home/HomeAssetCard.jsx';
import PriceChart from './PriceChart.jsx';
import { useCardCandles } from '../home/useAssetCandles.js';
import { buildAssetIndex, resolveHomeAsset, cardOptionsOf } from '../home/homeAssets.js';
import { CARD_METRICS } from '../../utils/cardMetrics.js';

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
function ExploreChart({ asset }) {
  const [step, setStep] = useState(0);
  const { status, series } = useCardCandles(asset, true, HISTORY_STEPS[step]);
  const [loaded, setLoaded] = useState(null); // { series, step }: the last one drawn (kept while a longer one loads)
  if (status === 'ready' && series && series !== loaded?.series) setLoaded({ series, step });
  const shown = loaded?.series || null;
  const loading = status === 'loading';
  // Asked once per step: only when the longer history is not already on its way
  const more = loaded && loaded.step === step && step < HISTORY_STEPS.length - 1 ? () => setStep(loaded.step + 1) : null;
  return (
    <section className="explore-panel" aria-label="نمودار">
      <div className="explore-panel-head">
        <h2>نمودار قیمت</h2>
        {loading && shown && <span className="explore-loading" role="status">در حال دریافت تاریخچه‌ی بیشتر…</span>}
      </div>
      {shown?.candles?.length ? (
        <div className="explore-chart">
          <PriceChart
            candles={shown.candles}
            days={shown.days}
            unit={asset.unit}
            currency={asset.currency}
            label={`نمودار کندلی ${asset.name}`}
            onNeedOlder={more}
          />
        </div>
      ) : (
        <div className={`explore-chart-state ${loading ? 'is-loading' : ''}`} role={loading ? 'status' : undefined}>
          {loading || status === 'idle'
            ? 'در حال دریافت نمودار…'
            : status === 'error'
              ? 'نمودار فعلاً در دسترس نیست'
              : 'تاریخچه‌ای برای این دارایی ثبت نشده'}
        </div>
      )}
    </section>
  );
}

/** One figure of the «اطلاعات» grid: a price or a percent */
function metricText(option) {
  const kind = CARD_METRICS[option.metric]?.kind;
  if (kind === 'pct') {
    const sign = option.value < 0 ? '−' : option.value > 0 && /change|deviation/.test(option.metric) ? '+' : '';
    return `${sign}${Math.abs(option.value).toLocaleString('fa-IR', { maximumFractionDigits: 2 })}٪`;
  }
  return `${option.currency === 'usd' ? '$' : ''}${formatPrice(option.value, option.currency)}`;
}

/** Everything else the book knows about the asset: averages, its linked assets' figures, its source */
function ExploreInfo({ asset, index }) {
  const { main, slots } = useMemo(() => cardOptionsOf(asset.id, index), [asset.id, index]);
  const shown = new Set((asset.slots || []).map((s) => s.key));
  const figures = [
    ...main.filter((m) => m.key !== 'price' && m.value !== null).map((m) => ({ ...m, metric: m.key, id: m.key, name: m.label })),
    ...slots.filter((s) => !shown.has(s.key)).map((s) => ({ ...s, id: s.key, name: s.linkedName ? `${s.label} · ${s.linkedName}` : s.label })),
  ];
  const facts = [
    ['دسته', asset.badge],
    ['واحد', asset.perUnit],
  ].filter(([, v]) => v);
  if (!figures.length && !facts.length) return null;
  return (
    <section className="explore-panel" aria-label="اطلاعات">
      <div className="explore-panel-head"><h2>اطلاعات</h2></div>
      {figures.length > 0 && (
        <div className="pro-metrics explore-figures">
          {figures.map((f) => (
            <div key={f.id} className="pro-metric">
              <span>{f.name}</span>
              <strong><bdi>{metricText(f)}</bdi></strong>
            </div>
          ))}
        </div>
      )}
      {facts.length > 0 && (
        <dl className="explore-facts">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/** The chosen asset: its card (price, change, day range), its chart and what else is known */
function ExploreDetail({ id, index }) {
  const asset = useMemo(() => resolveHomeAsset(id, index), [id, index]);
  if (!asset.found) {
    return <div className="explore-empty">این مورد فعلاً در بازار نرخی ندارد.</div>;
  }
  return (
    <div className="explore-detail">
      <HomeAssetCard asset={asset} style="detailed" flippable={false} />
      <ExploreChart key={asset.id} asset={asset} />
      <ExploreInfo asset={asset} index={index} />
    </div>
  );
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
        subtitle="هر دارایی بازار را جست‌وجو کنید و قیمت لحظه‌ای، اطلاعات و نمودارش را ببینید؛ بدون اینکه چیزی ذخیره شود."
        help="explore"
      />

      <div className="explore-layout">
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
                      className={`asset-picker-row explore-row ${selectedId === asset.id ? 'is-added' : ''}`}
                      onClick={() => select(asset.id)}
                      aria-pressed={selectedId === asset.id}
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
          {selectedId ? (
            <>
              <button type="button" className="explore-close" onClick={() => select('')}>
                <X size={14} aria-hidden="true" /> بستن
              </button>
              <ExploreDetail id={selectedId} index={index} />
            </>
          ) : (
            <div className="explore-empty">یک دارایی را از فهرست انتخاب کنید تا قیمت، اطلاعات و نمودارش اینجا باز شود.</div>
          )}
        </div>
      </div>
    </div>
  );
}
