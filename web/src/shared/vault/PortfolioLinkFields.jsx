/**
 * PortfolioLinkFields.jsx — «افزودن به پورتفو» / «کم کردن از پورتفو» inside the expense and income forms
 *
 * An expense in «سرمایه‌گذاری» can be a purchase in a portfolio (mode "buy": any market asset,
 * searched by name or symbol), an income in «فروش دارایی» a sale (mode "sell": what the chosen
 * portfolio holds, with its balance). The quantity and the record's tomans give the price of
 * each unit; the form stores the link (utils/portfolioLink.js) and portfolioFunds.js writes the
 * portfolio's entry. Only portfolios under the account vault are offered.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Search, X, Briefcase } from 'lucide-react';
import { FilterPills, NumericInput } from '../ui/index.js';
import { usePricing } from '../../features/market/context/PricingContext.jsx';
import { CategoryIcon, parseInputNumber, formatNum } from '../../features/portfolio/utils/holdingHelpers.js';
import { resolveAssetDisplayName, resolveAssetUnit, resolveCategory } from '../../config/sourceRegistry.js';
import { listLinkablePortfolios, listPortfolioPositions } from './portfolioFunds.js';

const RESULT_LIMIT = 8;
const EPS = 1e-9;
const qtyText = (n) => Number(n || 0).toLocaleString('fa-IR', { maximumFractionDigits: 6 });

/** The portfolios (buy) or the portfolios with what they hold (sell), loaded once */
function usePortfolios(mode) {
  const [state, setState] = useState({ list: [], loading: true, error: '' });
  useEffect(() => {
    let cancelled = false;
    const load = mode === 'sell'
      ? listPortfolioPositions().then((list) => list.map((p) => ({ id: p.portfolioId, name: p.portfolioName, positions: p.positions })))
      : listLinkablePortfolios();
    load
      .then((list) => !cancelled && setState({ list, loading: false, error: '' }))
      .catch((err) => !cancelled && setState({ list: [], loading: false, error: err?.message || 'پورتفوها خوانده نشدند.' }));
    return () => {
      cancelled = true;
    };
  }, [mode]);
  return state;
}

/**
 * @param {{
 *   mode: 'buy'|'sell',
 *   value: { portfolioId, portfolioName, assetId, quantity }|null,
 *   onChange: (link: object|null) => void,
 *   toman?: number,
 *   own?: object|null,
 *   hideValues?: boolean,
 * }} props
 *   value: what is chosen so far (null: not linked); own: the link this record already has (its
 *   quantity is still in the balance shown while it is edited)
 */
export default function PortfolioLinkFields({ mode, value, onChange, toman = 0, own = null, hideValues = false }) {
  const selling = mode === 'sell';
  const pricing = usePricing();
  const { list, loading, error } = usePortfolios(mode);
  const [query, setQuery] = useState('');
  const [quantity, setQuantity] = useState(value?.quantity ? String(value.quantity) : '');
  const enabled = Boolean(value);

  // The first (default) portfolio is chosen once they are loaded
  const portfolio = list.find((p) => p.id === value?.portfolioId) || null;
  useEffect(() => {
    if (enabled && !value.portfolioId && list.length) {
      const first = list.find((p) => p.isDefault) || list[0];
      onChange({ ...value, portfolioId: first.id, portfolioName: first.name });
    }
  }, [enabled, value, list, onChange]);

  // Sell: what the chosen portfolio holds (this record's own sale is still counted in)
  const held = useMemo(() => {
    if (!selling || !portfolio) return [];
    return (portfolio.positions || [])
      .map((p) => ({
        ...p,
        amount: p.amount + (own && own.portfolioId === portfolio.id && own.assetId === p.assetId ? Number(own.quantity) || 0 : 0),
      }))
      .filter((p) => p.amount > EPS);
  }, [selling, portfolio, own]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (selling) {
      return held
        .filter((p) => !q || [p.assetName, resolveAssetDisplayName(p.assetId), p.assetId].some((f) => String(f || '').toLowerCase().includes(q)))
        .slice(0, RESULT_LIMIT * 3)
        .map((p) => ({ id: p.assetId, name: p.assetName || resolveAssetDisplayName(p.assetId), category: resolveCategory(p.assetId), unit: p.unit, amount: p.amount }));
    }
    if (!q || !pricing?.searchAssets) return [];
    return pricing.searchAssets(q, { limit: RESULT_LIMIT }).filter((a) => a?.id && a.category !== 'cash');
  }, [selling, held, query, pricing]);

  const assetName = value?.assetId ? value.assetName || resolveAssetDisplayName(value.assetId) : '';
  const unit = value?.assetId ? value.unit || resolveAssetUnit(value.assetId) : '';
  const available = selling && value?.assetId ? held.find((p) => p.assetId === value.assetId)?.amount || 0 : null;
  const qtyNum = parseInputNumber(quantity) || 0;
  const unitPrice = qtyNum > 0 && toman > 0 ? toman / qtyNum : 0;

  const set = (patch) => onChange({ ...value, ...patch });
  const pickAsset = (asset) => {
    setQuery('');
    set({ assetId: asset.id, assetName: asset.name, unit: asset.unit || resolveAssetUnit(asset.id) });
  };
  const toggle = (on) => {
    if (!on) return onChange(null);
    const first = list.find((p) => p.isDefault) || list[0];
    onChange({ portfolioId: first?.id || '', portfolioName: first?.name || '', assetId: '', quantity: qtyNum || 0 });
  };

  if (!loading && !error && list.length === 0) {
    return (
      <p className="expense-form-hint">
        <Briefcase size={12} /> برای {selling ? 'کم کردن از' : 'افزودن به'} پورتفو، ابتدا یک پورتفو بسازید.
      </p>
    );
  }

  return (
    <div className="portfolio-link">
      <label className="income-recurring-toggle">
        <input type="checkbox" checked={enabled} onChange={(e) => toggle(e.target.checked)} disabled={loading || Boolean(error)} />
        <span>
          <strong>{selling ? 'کم کردن از پورتفو' : 'افزودن به پورتفو'}</strong>
          <small>
            {selling
              ? 'دارایی‌ای که فروختید از پورتفو کم می‌شود (یک «فروش» با همین مبلغ).'
              : 'روی چه چیزی سرمایه‌گذاری کردید؟ همان در پورتفو «خرید» ثبت می‌شود.'}
          </small>
        </span>
      </label>
      {error && <p className="expense-form-hint text-loss">{error}</p>}

      {enabled && (
        <div className="portfolio-link-body">
          {list.length > 1 && (
            <div className="ui-input-group">
              <span className="ui-input-label">پورتفو</span>
              <FilterPills
                options={list.map((p) => ({ value: p.id, label: p.name }))}
                activeValue={value.portfolioId}
                onChange={(id) => {
                  const p = list.find((x) => x.id === id);
                  set({ portfolioId: id, portfolioName: p?.name || '', ...(selling ? { assetId: '' } : {}) });
                }}
                size="sm"
                className="income-category-picker"
              />
            </div>
          )}

          <div className="ui-input-group">
            <span className="ui-input-label">{selling ? 'کدام دارایی فروخته شد؟ *' : 'دارایی *'}</span>
            {value.assetId ? (
              <div className="portfolio-link-chosen">
                <CategoryIcon category={resolveCategory(value.assetId)} size={14} />
                <strong>{assetName}</strong>
                {available !== null && <small>موجودی: {hideValues ? '****' : qtyText(available)} {unit}</small>}
                <button type="button" className="btn-table-action" title="تغییر دارایی" aria-label="تغییر دارایی" onClick={() => set({ assetId: '', assetName: '', unit: '' })}>
                  <X size={13} />
                </button>
              </div>
            ) : (
              <>
                <div className="asset-picker-search portfolio-link-search">
                  <Search size={15} aria-hidden="true" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={selling ? 'جستجو در دارایی‌های این پورتفو…' : 'جستجوی نام یا نماد (طلا، دلار، BTC، فولاد…)'}
                    aria-label="جستجوی دارایی"
                  />
                </div>
                {loading ? (
                  <p className="expense-form-hint">در حال خواندن پورتفوها…</p>
                ) : selling && held.length === 0 ? (
                  <p className="expense-form-hint">این پورتفو دارایی‌ای ندارد.</p>
                ) : results.length > 0 ? (
                  <ul className="asset-picker-list portfolio-link-results">
                    {results.map((asset) => (
                      <li key={asset.id}>
                        <button type="button" className="asset-picker-row" onClick={() => pickAsset(asset)}>
                          <span className="home-asset-icon" aria-hidden="true">
                            {asset.flag || <CategoryIcon category={asset.category} size={14} />}
                          </span>
                          <span className="asset-picker-name">
                            <strong>{asset.name}</strong>
                            <small>{selling
                              ? `موجودی: ${hideValues ? '****' : qtyText(asset.amount)} ${asset.unit || ''}`
                              : [asset.badge, asset.code || asset.symbol].filter(Boolean).join(' • ')}
                            </small>
                          </span>
                          <span className="asset-picker-price">
                            {!selling && asset.price ? Math.round(asset.price).toLocaleString('fa-IR') : ''}
                          </span>
                          <span className="asset-picker-action" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  query.trim() && <p className="expense-form-hint">موردی پیدا نشد.</p>
                )}
              </>
            )}
          </div>

          <div className="ui-input-group">
            <label htmlFor={`portfolio-link-qty-${mode}`} className="ui-input-label">مقدار{unit ? ` (${unit})` : ''} *</label>
            <div className="ui-input-wrapper">
              <NumericInput
                id={`portfolio-link-qty-${mode}`}
                value={quantity}
                onValueChange={(v) => {
                  setQuantity(v);
                  set({ quantity: parseInputNumber(v) || 0 });
                }}
                allowDecimals
                placeholder="مثلاً ۲٫۵"
                className="ui-input-control"
              />
            </div>
            {unitPrice > 0 && (
              <small className="expense-form-hint">
                هر {unit || 'واحد'} ≈ {hideValues ? '****' : formatNum(Math.round(unitPrice))} تومان
              </small>
            )}
            {selling && available !== null && qtyNum > available + EPS && (
              <small className="expense-form-hint text-loss">بیشتر از موجودی این پورتفو است.</small>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
