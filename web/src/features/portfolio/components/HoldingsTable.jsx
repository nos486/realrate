/**
 * HoldingsTable.jsx — The portfolio's assets by category: one row per asset (its whole ledger,
 * utils/assetLedger.js) — quantity, average buy price of what is left, today's value, P&L —
 * that opens into everything recorded for it (`renderDetails`, AssetLedgerDetails). A `closed`
 * group (the fully sold assets, buildClosedPositionsGroup) starts folded and sums realized P&L.
 */

import { intlLocale, t, plural } from '../../../utils/i18n.js';
import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { CategoryIcon, formatAssetName, formatNum, getItemBrand } from '../utils/holdingHelpers.js';
import { formatPct, toPersianDigits } from '../../../shared/utils/formatters.js';
import ResponsiveDataTable from '../../../shared/ui/ResponsiveDataTable.jsx';
import { assetOf } from '../../market/priceBookAssets.js';
import { isUsdPriced, formatPrice } from '../../market/assetPrice.js';

export default function HoldingsTable({
  categoryGroups = [],
  hideValues = false,
  itemMap = null,
  renderDetails = null,
}) {
  // The closed groups opened by the user (folded by default: they are history, not holdings)
  const [openClosed, setOpenClosed] = useState(() => new Set());
  if (!categoryGroups || categoryGroups.length === 0) return null;
  const toggleClosed = (key) => setOpenClosed((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  // The dollar price of a dollar-priced asset (the book's own, today)
  const usdPriceOf = (item) => {
    const asset = assetOf(itemMap, item.assetId || item.id);
    return isUsdPriced(asset) ? asset.priceUsd : 0;
  };
  // Each date isolated (bdi): mixed with Persian words, slashed dates reorder
  const lotsRange = (item) => {
    if (!item.firstDate) return '—';
    if (item.lastDate === item.firstDate) return <bdi>{toPersianDigits(item.firstDate)}</bdi>;
    return (
      <>
        <bdi>{toPersianDigits(item.firstDate)}</bdi>{' '}{t('تا')}{' '}<bdi>{toPersianDigits(item.lastDate)}</bdi>
      </>
    );
  };

  const columns = [
    {
      key: 'asset',
      header: t('دارایی'),
      thClassName: 'th-asset',
      tdClassName: 'td-asset',
      mobile: 'title',
      render: (item) => (
        <div className="asset-cell-compact">
          <span className="asset-name-text">{formatAssetName(item, itemMap)}</span>
          <span className={`item-category-pill cat-${item.category || item.assetType || 'custom'}`}>
            <CategoryIcon category={item.category || item.assetType} size={11} style={{ verticalAlign: 'middle', marginInlineEnd: '4px' }} />
            {getItemBrand(item, item.sourceId ? { id: item.sourceId } : null)}
          </span>
        </div>
      ),
    },
    {
      key: 'qty',
      header: t('مقدار'),
      thClassName: 'th-qty',
      tdClassName: 'td-qty',
      mobile: 'meta',
      render: (item) => (
        <span className="table-qty-badge">
          {hideValues ? '****' : `${Number(item.amount).toLocaleString(intlLocale(), { maximumFractionDigits: 6 })} ${item.unit}`}
        </span>
      ),
    },
    {
      key: 'buyPrice',
      header: t('میانگین قیمت خرید'),
      thClassName: 'th-buy-price',
      tdClassName: 'td-buy-price',
      // Hidden on mobile — visible only in the full desktop table, per record.
      render: (item) =>
        item.hasBuyPrice ? (
          <div className="cell-value-stack">
            <div className="cell-currency-wrap">
              <span className={`cell-val ${hideValues ? 'is-masked' : ''}`}>
                {hideValues ? '****' : formatNum(item.buyPrice)}
              </span>
              <span className="cell-unit">{t('تومان')}</span>
            </div>
            {item.partialCost && (
              <span className="cell-native-sub" title={t('بخشی از موجودی قیمت خرید ندارد و در میانگین و سود/زیان حساب نشده است')}>
                {t('(بخشی بی‌قیمت)')}
              </span>
            )}
          </div>
        ) : (
          <span className="table-notes-text" title={t('قیمت خرید وارد نشده است')}>—</span>
        ),
    },
    {
      key: 'realPrice',
      header: t('ارزش روز واحد'),
      thClassName: 'th-real-price',
      tdClassName: 'td-real-price',
      render: (item) => {
        // A dollar-priced asset (the ounce, oil) also shows its own price, in dollars
        const usd = hideValues ? 0 : usdPriceOf(item);
        return (
          <>
            <div className="cell-currency-wrap">
              <span className={`cell-val real-val ${hideValues ? 'is-masked' : ''}`} title={t('محاسبه مستقیم بر مبنای ارزش واقعی')}>
                {hideValues ? '****' : formatNum(item.unitRealPrice)}
              </span>
              <span className="cell-unit">{t('تومان')}</span>
            </div>
            {usd > 0 && <span className="cell-usd-price"><bdi>${formatPrice(usd, 'usd')}</bdi></span>}
          </>
        );
      },
    },
    {
      key: 'totalVal',
      header: t('ارزش کل'),
      thClassName: 'th-total-val',
      tdClassName: 'td-total-val',
      mobile: 'stat',
      render: (item) => (
        <div className="cell-currency-wrap">
          <strong className={`cell-val-bold gold-text ${hideValues ? 'is-masked' : ''}`}>
            {hideValues ? '****' : formatNum(item.itemRealVal)}
          </strong>
          <span className="cell-unit">{t('تومان')}</span>
        </div>
      ),
    },
    {
      key: 'pnl',
      header: t('سود / زیان'),
      thClassName: 'th-pnl',
      tdClassName: 'td-pnl',
      mobile: 'stat-secondary',
      render: (item) => {
        const isProfit = (item.itemPnl || 0) >= 0;
        return item.hasBuyPrice ? (
          <div className={`table-pnl-cell ${isProfit ? 'profit' : 'loss'}`}>
            <div className="pnl-cell-main">
              <span className={`pnl-amount ${hideValues ? 'is-masked' : ''}`}>
                {hideValues ? '****' : t('{sign}{amount} تومان', { sign: isProfit ? '+' : '', amount: formatNum(item.itemPnl) })}
              </span>
              <span className="pnl-pct-badge">
                {hideValues ? '****' : t('({sign}{pct}٪)', { sign: isProfit ? '+' : '−', pct: formatPct(Math.abs(item.itemPnlPct || 0)) })}
              </span>
            </div>
            {item.realizedPnl !== null && item.realizedPnl !== undefined && !hideValues && (
              <span className={`pnl-native-sub ${item.realizedPnl >= 0 ? 'profit' : 'loss'}`}>
                {t('تحقق‌یافته: {sign}{amount} تومان', { sign: item.realizedPnl >= 0 ? '+' : '−', amount: formatNum(Math.abs(item.realizedPnl)) })}
              </span>
            )}
          </div>
        ) : item.realizedPnl !== null && item.realizedPnl !== undefined ? (
          // Nothing left (a fully sold asset): what its sales made
          <div className={`table-pnl-cell ${item.realizedPnl >= 0 ? 'profit' : 'loss'}`}>
            <span className={`pnl-amount ${hideValues ? 'is-masked' : ''}`}>
              {hideValues ? '****' : t('تحقق‌یافته: {sign}{amount} تومان', { sign: item.realizedPnl >= 0 ? '+' : '−', amount: formatNum(Math.abs(item.realizedPnl)) })}
            </span>
          </div>
        ) : (
          <span className="table-notes-text" title={t('بدون قیمت خرید در سود و زیان محاسبه نمی‌شود')}>—</span>
        );
      },
    },
    {
      key: 'date',
      header: t('تاریخ‌ها'),
      thClassName: 'th-date',
      tdClassName: 'td-date',
      render: (item) => (
        <span className="table-date-text holdings-lots-cell">
          {lotsRange(item)}
          <small className="holdings-entry-count">{plural(item.entryCount, t('{count} ثبت', { count: item.entryCount.toLocaleString(intlLocale()) }), t('{count} ثبت‌ها', { count: item.entryCount.toLocaleString(intlLocale()) }))}</small>
        </span>
      ),
    },
    ...(renderDetails
      ? [{
          key: 'expand',
          header: '',
          thClassName: 'th-actions',
          tdClassName: 'td-actions',
          mobile: 'actions',
          render: () => <ChevronDown size={16} className="holdings-expand-icon" aria-hidden="true" />,
        }]
      : []),
  ];

  return (
    <div className="portfolio-categories-container">
      {categoryGroups.map((group) => {
        const folded = group.closed && !openClosed.has(group.key);
        // Inside the closed group's toggle button the name is plain text, not a heading
        const NameTag = group.closed ? 'span' : 'h4';
        const identity = (
            <div className="cat-header-identity">
              <span className="cat-group-icon">
                <CategoryIcon category={group.icon || group.key} size={20} />
              </span>
              <div className="cat-group-titles">
                <NameTag className="cat-group-name">{group.name}</NameTag>
                <span className="cat-group-count">{plural(group.items.length, t('{count} قلم', { count: group.items.length.toLocaleString(intlLocale()) }), t('{count} قلم‌ها', { count: group.items.length.toLocaleString(intlLocale()) }))}</span>
              </div>
            </div>
        );
        return (
        <div key={group.key} className={`category-group-card ${group.closed ? 'is-closed-group' : ''}`}>
          {group.closed ? (
            // Folded history: the header is the toggle, with what the sales made
            <button
              type="button"
              className="category-group-header closed-group-toggle"
              aria-expanded={!folded}
              onClick={() => toggleClosed(group.key)}
            >
              {identity}
              <div className="cat-header-subtotals">
                {group.totalRealizedPnl !== null && group.totalRealizedPnl !== undefined && (
                  <div className={`cat-subtotal-pnl ${group.totalRealizedPnl >= 0 ? 'profit' : 'loss'}`}>
                    <span className="subtotal-pnl-label">{t('تحقق‌یافته:')}</span>
                    <strong>
                      {hideValues ? t('**** تومان') : t('{sign}{amount} تومان', { sign: group.totalRealizedPnl >= 0 ? '+' : '−', amount: formatNum(Math.abs(group.totalRealizedPnl)) })}
                    </strong>
                  </div>
                )}
                <ChevronDown size={16} className={`closed-group-chevron ${folded ? '' : 'is-open'}`} aria-hidden="true" />
              </div>
            </button>
          ) : (
          <div className="category-group-header">
            {identity}

            <div className="cat-header-subtotals">
              <div className="cat-subtotal-val">
                <span className="subtotal-label">{t('ارزش:')}</span>
                <strong className={`subtotal-amount ${hideValues ? 'is-masked' : ''}`}>
                  {hideValues ? '****' : formatNum(group.totalRealValue)}
                </strong>
                <span className="subtotal-unit">{t('تومان')}</span>
              </div>

              {group.hasCostedItems && (
                <div className={`cat-subtotal-pnl ${group.totalPnl >= 0 ? 'profit' : 'loss'}`}>
                  <span className="subtotal-pnl-label">{t('سود/زیان:')}</span>
                  <strong>
                    {hideValues ? t('**** تومان') : t('{sign}{amount} تومان', { sign: group.totalPnl >= 0 ? '+' : '', amount: formatNum(group.totalPnl) })}
                  </strong>
                  <span className="subtotal-pnl-pct">
                    {hideValues ? '(****)' : t('({sign}{pct}٪)', { sign: group.totalPnl >= 0 ? '+' : '−', pct: formatPct(Math.abs(group.totalPnlPct)) })}
                  </span>
                </div>
              )}
            </div>
          </div>
          )}

          {/* High-density Data Table for this category — compact cards below 768px */}
          {!folded && (
            <ResponsiveDataTable
              columns={columns}
              rows={group.items}
              wrapperClassName="portfolio-table-responsive"
              tableClassName="portfolio-data-table"
              rowClassName={(item) => `portfolio-table-row ${item.amount > 0 ? '' : 'is-closed'}`}
              renderExpanded={renderDetails}
            />
          )}
        </div>
        );
      })}
    </div>
  );
}
