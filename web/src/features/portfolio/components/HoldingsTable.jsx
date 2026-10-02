/**
 * HoldingsTable.jsx — The portfolio's assets by category: one row per asset (its whole ledger,
 * utils/assetLedger.js) — quantity, average buy price of what is left, today's value, P&L —
 * that opens into everything recorded for it (`renderDetails`, AssetLedgerDetails)
 */

import React from 'react';
import { ChevronDown } from 'lucide-react';
import { CategoryIcon, formatAssetName, formatNum, getItemBrand } from '../utils/holdingHelpers.js';
import { formatPct, toPersianDigits } from '../../../shared/utils/formatters.js';
import ResponsiveDataTable from '../../../shared/ui/ResponsiveDataTable.jsx';

export default function HoldingsTable({
  categoryGroups = [],
  hideValues = false,
  itemMap = null,
  renderDetails = null,
}) {
  if (!categoryGroups || categoryGroups.length === 0) return null;
  // Each date isolated (bdi): mixed with Persian words, slashed dates reorder
  const lotsRange = (item) => {
    if (!item.firstDate) return '—';
    if (item.lastDate === item.firstDate) return <bdi>{toPersianDigits(item.firstDate)}</bdi>;
    return (
      <>
        <bdi>{toPersianDigits(item.firstDate)}</bdi> تا <bdi>{toPersianDigits(item.lastDate)}</bdi>
      </>
    );
  };

  const columns = [
    {
      key: 'asset',
      header: 'دارایی',
      thClassName: 'th-asset',
      tdClassName: 'td-asset',
      mobile: 'title',
      render: (item) => (
        <div className="asset-cell-compact">
          <span className="asset-name-text">{formatAssetName(item, itemMap)}</span>
          <span className={`item-category-pill cat-${item.category || item.assetType || 'custom'}`}>
            <CategoryIcon category={item.category || item.assetType} size={11} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
            {getItemBrand(item, item.sourceId ? { id: item.sourceId } : null)}
          </span>
        </div>
      ),
    },
    {
      key: 'qty',
      header: 'مقدار',
      thClassName: 'th-qty',
      tdClassName: 'td-qty',
      mobile: 'meta',
      render: (item) => (
        <span className="table-qty-badge">
          {hideValues ? '****' : `${Number(item.amount).toLocaleString('fa-IR', { maximumFractionDigits: 6 })} ${item.unit}`}
        </span>
      ),
    },
    {
      key: 'buyPrice',
      header: 'میانگین قیمت خرید',
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
              <span className="cell-unit">تومان</span>
            </div>
            {item.partialCost && (
              <span className="cell-native-sub" title="بخشی از موجودی قیمت خرید ندارد و در میانگین و سود/زیان حساب نشده است">
                (بخشی بی‌قیمت)
              </span>
            )}
          </div>
        ) : (
          <span className="table-notes-text" title="قیمت خرید وارد نشده است">—</span>
        ),
    },
    {
      key: 'realPrice',
      header: 'ارزش روز واحد',
      thClassName: 'th-real-price',
      tdClassName: 'td-real-price',
      render: (item) => (
        <div className="cell-currency-wrap">
          <span className={`cell-val real-val ${hideValues ? 'is-masked' : ''}`} title="محاسبه مستقیم بر مبنای ارزش واقعی">
            {hideValues ? '****' : formatNum(item.unitRealPrice)}
          </span>
          <span className="cell-unit">تومان</span>
        </div>
      ),
    },
    {
      key: 'totalVal',
      header: 'ارزش کل',
      thClassName: 'th-total-val',
      tdClassName: 'td-total-val',
      mobile: 'stat',
      render: (item) => (
        <div className="cell-currency-wrap">
          <strong className={`cell-val-bold gold-text ${hideValues ? 'is-masked' : ''}`}>
            {hideValues ? '****' : formatNum(item.itemRealVal)}
          </strong>
          <span className="cell-unit">تومان</span>
        </div>
      ),
    },
    {
      key: 'pnl',
      header: 'سود / زیان',
      thClassName: 'th-pnl',
      tdClassName: 'td-pnl',
      mobile: 'stat-secondary',
      render: (item) => {
        const isProfit = (item.itemPnl || 0) >= 0;
        return item.hasBuyPrice ? (
          <div className={`table-pnl-cell ${isProfit ? 'profit' : 'loss'}`}>
            <div className="pnl-cell-main">
              <span className={`pnl-amount ${hideValues ? 'is-masked' : ''}`}>
                {hideValues ? '****' : `${isProfit ? '+' : ''}${formatNum(item.itemPnl)} تومان`}
              </span>
              <span className="pnl-pct-badge">
                {hideValues ? '****' : `(${isProfit ? '+' : ''}${formatPct(Math.abs(item.itemPnlPct || 0))}٪)`}
              </span>
            </div>
            {item.realizedPnl !== null && item.realizedPnl !== undefined && !hideValues && (
              <span className={`pnl-native-sub ${item.realizedPnl >= 0 ? 'profit' : 'loss'}`}>
                تحقق‌یافته: {item.realizedPnl >= 0 ? '+' : '−'}{formatNum(Math.abs(item.realizedPnl))} تومان
              </span>
            )}
          </div>
        ) : (
          <span className="table-notes-text" title="بدون قیمت خرید در سود و زیان محاسبه نمی‌شود">—</span>
        );
      },
    },
    {
      key: 'date',
      header: 'تاریخ‌ها',
      thClassName: 'th-date',
      tdClassName: 'td-date',
      render: (item) => (
        <span className="table-date-text holdings-lots-cell">
          {lotsRange(item)}
          <small className="holdings-entry-count">{item.entryCount.toLocaleString('fa-IR')} ثبت</small>
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
      {categoryGroups.map((group) => (
        <div key={group.key} className="category-group-card">
          {/* Category Subtotal Header */}
          <div className="category-group-header">
            <div className="cat-header-identity">
              <span className="cat-group-icon">
                <CategoryIcon category={group.icon || group.key} size={20} />
              </span>
              <div className="cat-group-titles">
                <h4 className="cat-group-name">{group.name}</h4>
                <span className="cat-group-count">{group.items.length.toLocaleString('fa-IR')} قلم</span>
              </div>
            </div>

            <div className="cat-header-subtotals">
              <div className="cat-subtotal-val">
                <span className="subtotal-label">ارزش:</span>
                <strong className={`subtotal-amount ${hideValues ? 'is-masked' : ''}`}>
                  {hideValues ? '****' : formatNum(group.totalRealValue)}
                </strong>
                <span className="subtotal-unit">تومان</span>
              </div>

              {group.hasCostedItems && (
                <div className={`cat-subtotal-pnl ${group.totalPnl >= 0 ? 'profit' : 'loss'}`}>
                  <span className="subtotal-pnl-label">سود/زیان:</span>
                  <strong>
                    {hideValues ? '**** تومان' : `${group.totalPnl >= 0 ? '+' : ''}${formatNum(group.totalPnl)} تومان`}
                  </strong>
                  <span className="subtotal-pnl-pct">
                    {hideValues ? '(****)' : `(${group.totalPnl >= 0 ? '+' : ''}${formatPct(Math.abs(group.totalPnlPct))}٪)`}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* High-density Data Table for this category — compact cards below 768px */}
          <ResponsiveDataTable
            columns={columns}
            rows={group.items}
            wrapperClassName="portfolio-table-responsive"
            tableClassName="portfolio-data-table"
            rowClassName={(item) => `portfolio-table-row ${item.amount > 0 ? '' : 'is-closed'}`}
            renderExpanded={renderDetails}
          />
        </div>
      ))}
    </div>
  );
}
