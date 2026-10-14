/**
 * ExplorePage.jsx — «کاوش بازار» (/explore): one big candle chart of ANY market asset (gold,
 * coins, currencies, crypto, exchange symbols, funds, ...), picked with the app's asset search
 * inside the chart itself, without saving anything — no home card, no portfolio entry.
 *
 * Everything is read off what the app already holds: the price book (the search and the price
 * line, via homeAssets.js) and, for the chart, the same daily candles the home cards use. The
 * chosen asset lives in the URL (`?a=<id>`, the dollar until one is picked), so a refresh or a
 * shared link opens the same asset. The panel fills the screen down to the bottom bar and the
 * chart takes all of it the search, title and statistics leave.
 * Pro only (feature `market`: its chart route is gated by it too).
 */

import { intlLocale, t } from '../../utils/i18n.js';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import UniversalAssetSearch from '../../components/UniversalAssetSearch.jsx';
import { usePricing } from '../market/context/PricingContext.jsx';
import { formatPrice } from '../market/assetPrice.js';
import { CategoryIcon } from '../portfolio/utils/holdingHelpers.js';
import PriceChart from './PriceChart.jsx';
import { useCardCandles } from '../home/useAssetCandles.js';
import { buildAssetIndex, resolveHomeAsset } from '../home/homeAssets.js';
import { timeAgo } from '../../shared/utils/timeAgo.js';

/** The asset charted until one is picked */
const DEFAULT_ASSET = 'usd';

/** The history loaded so far, longest last: the chart asks for the next when scrolled past the oldest day */
const HISTORY_STEPS = ['180d', '1y', '2y'];

/** A small gap kept under the panel; and the least it is ever given */
const GAP_BELOW_PX = 12;
const MIN_PANEL_PX = 460;

/**
 * The panel's height: from its top down to the bottom of the screen (above the app's bottom bar,
 * when there is one), again on every resize and rotation; the chart takes what the rest leaves
 * @param {React.RefObject<HTMLElement>} ref - the panel
 */
function useFillHeight(ref) {
  const [height, setHeight] = useState(null);
  useEffect(() => {
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      const nav = document.querySelector('.app-bottom-nav');
      const bottom = nav ? nav.getBoundingClientRect().height : 0;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setHeight(Math.max(MIN_PANEL_PX, Math.round(window.innerHeight - top - bottom - GAP_BELOW_PX)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [ref]);
  return height;
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
  const top = <ChartTitle asset={asset} loading={loading && Boolean(shown)} />;
  if (shown?.candles?.length) {
    return (
      <PriceChart
        candles={shown.candles}
        days={shown.days}
        unit={asset.unit}
        currency={asset.currency}
        label={t('نمودار کندلی {name}', { name: asset.name })}
        onNeedOlder={more}
        header={top}
      />
    );
  }
  return (
    <>
      <div className="xchart-bar">{top}</div>
      <div className={`explore-chart-state ${loading ? 'is-loading' : ''}`} role={loading ? 'status' : undefined}>
        {loading || status === 'idle'
          ? t('در حال دریافت نمودار…')
          : status === 'error'
            ? t('نمودار فعلاً در دسترس نیست')
            : t('تاریخچه‌ای برای این دارایی ثبت نشده')}
      </div>
    </>
  );
}

const changeOf = (pct) => (pct ? { up: pct > 0, text: `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct).toLocaleString(intlLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${t('٪')}` } : null);

/** The chart's title line: who the asset is, its live price and change, and when it last moved */
function ChartTitle({ asset, loading }) {
  const change = changeOf(asset.changePercent);
  const price = asset.price ? formatPrice(asset.price, asset.currency) : null;
  return (
    <div className="explore-title">
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
          <strong className="price-unavailable">{t('نرخ در دسترس نیست')}</strong>
        )}
        <span className="explore-title-sub">
          {change && <span className={`explore-change ${change.up ? 'is-up' : 'is-down'}`}><bdi>{change.text}</bdi></span>}
          {asset.stale ? <span className="home-stale-mark">{t('قدیمی')}</span> : asset.updatedAt && <span>{timeAgo(asset.updatedAt)}</span>}
          {loading && <span role="status">{t('در حال دریافت تاریخچه…')}</span>}
        </span>
      </div>
    </div>
  );
}

export default function ExplorePage() {
  const pricing = usePricing();
  const [params, setParams] = useSearchParams();
  const assetId = params.get('a') || DEFAULT_ASSET;
  const panelRef = useRef(null);
  const height = useFillHeight(panelRef);

  const index = useMemo(
    () => buildAssetIndex({ itemMap: pricing?.itemMap, analysis: [] }),
    [pricing?.itemMap],
  );
  const asset = useMemo(() => resolveHomeAsset(assetId, index), [assetId, index]);

  const select = (item) => {
    if (!item?.id) return;
    const next = new URLSearchParams(params);
    next.set('a', item.id);
    setParams(next, { replace: true });
  };

  // The app's own asset search, at the top of the chart's panel: picking one charts it. It stays
  // mounted while the chart below changes, so what is typed survives a new asset's data arriving
  const search = (
    <div className="explore-search">
      <UniversalAssetSearch
        mode="picker"
        selectedAssetId={asset.found ? asset.id : null}
        onSelect={select}
        placeholder={t('جستجوی نماد: دلار، سکه، BTC، فولاد…')}
        showCategories={false}
      />
    </div>
  );

  return (
    <section
      ref={panelRef}
      className="explore-panel"
      aria-label={asset.found ? t('نمودار {name}', { name: asset.name }) : t('نمودار')}
      style={height ? { height: `${height}px` } : undefined}
    >
      {search}
      {asset.found ? (
        <ExploreChart key={asset.id} asset={asset} />
      ) : (
        <div className="explore-chart-state">
          {pricing?.loading ? t('در حال دریافت قیمت‌ها…') : t('این مورد فعلاً در بازار نرخی ندارد؛ نماد دیگری را جستجو کنید.')}
        </div>
      )}
    </section>
  );
}
