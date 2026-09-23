import React from 'react';
import { Pencil, Trash2, Calendar, MessageSquare } from 'lucide-react';
import { CategoryIcon, formatAssetName, formatNum, getItemBrand, resolveAssetDisplayName } from '../utils/holdingHelpers.js';
import { formatPct } from '../../../shared/utils/formatters.js';
import ResponsiveDataTable from '../../../shared/ui/ResponsiveDataTable.jsx';

export default function HoldingsTable({
  categoryGroups = [],
  hideValues = false,
  readOnly = false,
  deletingId = null,
  onEdit,
  onDelete,
  itemMap = null,
}) {
  if (!categoryGroups || categoryGroups.length === 0) return null;

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
          {hideValues ? '****' : `${Number(item.amount).toLocaleString('fa-IR')} ${item.unit}`}
        </span>
      ),
    },
    {
      key: 'buyPrice',
      header: 'قیمت خرید',
      thClassName: 'th-buy-price',
      tdClassName: 'td-buy-price',
      // Hidden on mobile — visible only in the full desktop table, per record.
      render: (item) =>
        item.hasBuyPrice ? (
          <div className="cell-currency-wrap">
            <span className={`cell-val ${hideValues ? 'is-masked' : ''}`}>
              {hideValues ? '****' : formatNum(item.buyPrice)}
            </span>
            <span className="cell-unit">تومان</span>
            {item.referenceAssetId && item.referenceQuantity > 0 && !hideValues && (
              <span className="cell-native-sub">
                ({Number(item.referenceQuantity).toLocaleString('fa-IR', { maximumFractionDigits: 2 })}{' '}
                {resolveAssetDisplayName(item.referenceAssetId)})
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
            <span className={`pnl-amount ${hideValues ? 'is-masked' : ''}`}>
              {hideValues ? '****' : `${isProfit ? '+' : ''}${formatNum(item.itemPnl)} تومان`}
            </span>
            <span className="pnl-pct-badge">
              {hideValues ? '****' : `(${isProfit ? '+' : ''}${formatPct(Math.abs(item.itemPnlPct || 0))}٪)`}
            </span>
            {item.referencePnlInfo && !hideValues && (
              <span
                className={`pnl-native-sub ${item.referencePnlInfo.referencePnl >= 0 ? 'profit' : 'loss'}`}
                title={`اگر هنوز ${item.referencePnlInfo.referenceAssetName} بود: ${formatNum(item.referencePnlInfo.referenceCurrentValue)} تومان`}
              >
                نسبت به {item.referencePnlInfo.referenceAssetName}: {item.referencePnlInfo.referencePnl >= 0 ? '+' : '-'}
                {formatNum(Math.abs(item.referencePnlInfo.referencePnl))} تومان
                {item.referencePnlInfo.referencePnlPct !== null && (
                  <> ({item.referencePnlInfo.referencePnl >= 0 ? '+' : '-'}{formatPct(Math.abs(item.referencePnlInfo.referencePnlPct))}٪)</>
                )}
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
      header: 'تاریخ خرید',
      thClassName: 'th-date',
      tdClassName: 'td-date',
      render: (item) => (
        <span className="table-date-text">
          {item.buyDate ? (
            <>
              <Calendar size={12} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
              {item.buyDate}
            </>
          ) : '—'}
        </span>
      ),
    },
    {
      key: 'notes',
      header: 'یادداشت',
      thClassName: 'th-notes',
      tdClassName: 'td-notes',
      render: (item) => (
        <span className="table-notes-text" title={item.notes || ''}>
          {item.notes ? (
            <>
              <MessageSquare size={12} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
              {item.notes}
            </>
          ) : '—'}
        </span>
      ),
    },
    ...(!readOnly
      ? [
          {
            key: 'actions',
            header: 'عملیات',
            thClassName: 'th-actions',
            tdClassName: 'td-actions',
            mobile: 'actions',
            render: (item) =>
              item.source === 'transactions' ? (
                <span
                  className="tx-auto-badge-pill"
                  title="محاسبه‌شده از روی تراکنش‌ها. جهت تغییر یا حذف، تراکنش مربوطه را در تب «تراکنش‌ها» ویرایش فرمایید."
                >
                  خودکار
                </span>
              ) : (
                <div className="row-actions-group">
                  <button
                    type="button"
                    className="btn-table-action edit"
                    title="ویرایش دارایی"
                    onClick={() => onEdit?.(item)}
                  >
                    <Pencil size={13} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className={`btn-table-action delete ${deletingId === item.id ? 'loading' : ''}`}
                    title="حذف دارایی"
                    onClick={() => onDelete?.(item.id)}
                    disabled={deletingId === item.id}
                  >
                    <Trash2 size={13} strokeWidth={2} />
                  </button>
                </div>
              ),
          },
        ]
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
                <CategoryIcon category={group.key} size={20} />
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
            rowClassName={() => 'portfolio-table-row'}
          />
        </div>
      ))}
    </div>
  );
}
