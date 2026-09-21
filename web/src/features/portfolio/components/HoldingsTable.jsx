import React from 'react';
import { Pencil, Trash2, Calendar, MessageSquare } from 'lucide-react';
import { CategoryIcon, formatAssetName, formatNum, getItemBrand } from '../utils/holdingHelpers.js';

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
                    {hideValues ? '(****)' : `(${group.totalPnl >= 0 ? '+' : ''}${group.totalPnlPct.toFixed(1).replace('-', '')}٪)`}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* High-density Data Table for this category */}
          <div className="portfolio-table-responsive">
            <table className="portfolio-data-table">
              <thead>
                <tr>
                  <th className="th-asset">دارایی</th>
                  <th className="th-qty">مقدار</th>
                  <th className="th-buy-price">قیمت خرید</th>
                  <th className="th-real-price">ارزش روز واحد</th>
                  <th className="th-total-val">ارزش کل</th>
                  <th className="th-pnl">سود / زیان</th>
                  <th className="th-date">تاریخ خرید</th>
                  <th className="th-notes">یادداشت</th>
                  {!readOnly && <th className="th-actions">عملیات</th>}
                </tr>
              </thead>
              <tbody>
                {group.items.map((item) => {
                  const isProfit = (item.itemPnl || 0) >= 0;
                  const isDeleting = deletingId === item.id;
                  return (
                    <tr key={item.id} className="portfolio-table-row">
                      <td className="td-asset">
                        <div className="asset-cell-compact">
                          <span className="asset-name-text">{formatAssetName(item, itemMap)}</span>
                          <span className={`item-category-pill cat-${item.category || item.assetType || 'custom'}`}>
                            <CategoryIcon category={item.category || item.assetType} size={11} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
                            {getItemBrand(item, item.sourceId ? { id: item.sourceId } : null)}
                          </span>
                        </div>
                      </td>

                      <td className="td-qty">
                        <span className="table-qty-badge">
                          {hideValues ? '****' : `${Number(item.amount).toLocaleString('fa-IR')} ${item.unit}`}
                        </span>
                      </td>

                      <td className="td-buy-price">
                        {item.hasBuyPrice ? (
                          <div className="cell-currency-wrap">
                            <span className={`cell-val ${hideValues ? 'is-masked' : ''}`}>
                              {hideValues ? '****' : formatNum(item.buyPrice)}
                            </span>
                            <span className="cell-unit">تومان</span>
                          </div>
                        ) : (
                          <span className="table-notes-text" title="قیمت خرید وارد نشده است">—</span>
                        )}
                      </td>

                      <td className="td-real-price">
                        <div className="cell-currency-wrap">
                          <span className={`cell-val real-val ${hideValues ? 'is-masked' : ''}`} title="محاسبه مستقیم بر مبنای ارزش واقعی">
                            {hideValues ? '****' : formatNum(item.unitRealPrice)}
                          </span>
                          <span className="cell-unit">تومان</span>
                        </div>
                      </td>

                      <td className="td-total-val">
                        <div className="cell-currency-wrap">
                          <strong className={`cell-val-bold gold-text ${hideValues ? 'is-masked' : ''}`}>
                            {hideValues ? '****' : formatNum(item.itemRealVal)}
                          </strong>
                          <span className="cell-unit">تومان</span>
                        </div>
                      </td>

                      <td className="td-pnl">
                        {item.hasBuyPrice ? (
                          <div className={`table-pnl-cell ${isProfit ? 'profit' : 'loss'}`}>
                            <span className={`pnl-amount ${hideValues ? 'is-masked' : ''}`}>
                              {hideValues ? '****' : `${isProfit ? '+' : ''}${formatNum(item.itemPnl)} تومان`}
                            </span>
                            <span className="pnl-pct-badge">
                              {hideValues ? '****' : `(${isProfit ? '+' : ''}${item.itemPnlPct?.toFixed(1).replace('-', '')}٪)`}
                            </span>
                          </div>
                        ) : (
                          <span className="table-notes-text" title="بدون قیمت خرید در سود و زیان محاسبه نمی‌شود">—</span>
                        )}
                      </td>

                      <td className="td-date">
                        <span className="table-date-text">
                          {item.buyDate ? (
                            <>
                              <Calendar size={12} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
                              {item.buyDate}
                            </>
                          ) : '—'}
                        </span>
                      </td>

                      <td className="td-notes">
                        <span className="table-notes-text" title={item.notes || ''}>
                          {item.notes ? (
                            <>
                              <MessageSquare size={12} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
                              {item.notes}
                            </>
                          ) : '—'}
                        </span>
                      </td>

                      {!readOnly && (
                        <td className="td-actions">
                          {item.source === 'transactions' ? (
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
                                className={`btn-table-action delete ${isDeleting ? 'loading' : ''}`}
                                title="حذف دارایی"
                                onClick={() => onDelete?.(item.id)}
                                disabled={isDeleting}
                              >
                                <Trash2 size={13} strokeWidth={2} />
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
