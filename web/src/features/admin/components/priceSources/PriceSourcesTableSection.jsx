import React from 'react';
import {
  Star,
  PlayCircle,
  Eye,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';
import EmptyState from '../../../../shared/ui/EmptyState.jsx';
import { formatNum, formatPersianDate, CANONICAL_PRICE_TYPE_INFO } from './priceSourceConstants.js';
import { getItemUnit } from '../../../../config/displayEngine.js';

/**
 * PriceSourcesTableSection:
 * Unified, reusable table component for both Base Rate Sources and Multi-Output Feeds Hub.
 * Guarantees 100% consistent UI, toolbars, columns, badges, toggles, and action buttons.
 */
export default function PriceSourcesTableSection({
  title,
  icon: SectionIcon,
  iconColor = 'var(--accent-blue)',
  items = [],
  isMulti = false,
  loading = false,
  typeInfoMap = CANONICAL_PRICE_TYPE_INFO,
  testingId = null,
  testResults = {},
  onClearTestResult = null,
  onToggleActive = null,
  onTest = null,
  onSetPrimary = null,
  onOpenExplorer = null,
  className = '',
}) {
  return (
    <section className={`sources-table-section ${className}`}>
      {/* ── Unified Header Toolbar ── */}
      <div className="table-header-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {SectionIcon && (
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: iconColor,
              }}
            >
              <SectionIcon size={17} />
            </div>
          )}
          <h3 style={{ fontSize: '15px', fontWeight: '800', margin: 0, color: 'var(--text-heading)' }}>
            {title}
          </h3>
          <span
            className="sources-count-pill"
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '20px',
              background: 'rgba(255, 255, 255, 0.07)',
              color: 'var(--text-muted)',
              fontWeight: '700',
            }}
          >
            {items.length.toLocaleString('fa-IR')} {isMulti ? 'فید' : 'سورس'}
          </span>
        </div>
      </div>

      {/* ── Unified Table Container ── */}
      <div className="users-table-wrap sources-fullscreen-table-wrap">
        <table className="users-table sources-table">
          <thead>
            <tr>
              <th>نام و نشانی سورس</th>
              <th>نوع و دسته‌بندی</th>
              <th>آخرین مقدار استخراجی</th>
              <th>پروتکل و ساختار استخراج</th>
              <th>{isMulti ? 'کاوشگر داده‌ها' : 'سورس مرجع'}</th>
              <th>وضعیت</th>
              <th style={{ textAlign: 'center' }}>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '36px' }}>
                  <EmptyState
                    title={loading ? 'در حال دریافت اطلاعات...' : (isMulti ? 'هیچ فید چند خروجی ثبت نشده است.' : 'هیچ سورسی یافت نشد.')}
                    description={isMulti ? 'فیدهای چند خروجی در sources.config.js تعریف می‌شوند.' : 'سورس‌های نرخ پایه در sources.config.js تعریف می‌شوند.'}
                  />
                </td>
              </tr>
            ) : (
              items.map((src) => {
                const typeInfo = typeInfoMap[src.priceType] || { label: src.priceType, badgeColor: isMulti ? 'indigo' : 'blue', unit: 'مورد' };
                const isRowTesting = testingId === src.id;
                const rowResult = testResults[src.id];
                const mapping = typeof src.fieldMapping === 'string'
                  ? (() => { try { return JSON.parse(src.fieldMapping || '{}'); } catch { return {}; } })()
                  : (src.fieldMapping || {});

                // Endpoint string
                const endpointText = src.sourceType === 'telegram'
                  ? `@${(src.channelUsername || src.endpoint || '').replace(/^@/, '')}`
                  : (src.apiUrl || src.endpoint || '-');

                // Display config check
                const dc = typeof src.displayConfig === 'string'
                  ? (() => { try { return JSON.parse(src.displayConfig); } catch { return {}; } })()
                  : (src.displayConfig || {});

                return (
                  <React.Fragment key={src.id}>
                    <tr>
                      {/* 1. Name & Address */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '13.5px', color: 'var(--text-heading)' }}>
                              {src.name}
                            </strong>
                            {!isMulti && (
                              dc.showOnHomePage === false ? (
                                <span style={{ fontSize: '10px', color: '#f43f5e', background: 'rgba(244,63,94,0.12)', padding: '1px 6px', borderRadius: '4px' }}>
                                  مخفی از خانه
                                </span>
                              ) : (
                                <span style={{ fontSize: '10px', color: '#10b981', background: 'rgba(16,185,129,0.12)', padding: '1px 6px', borderRadius: '4px' }}>
                                  صفحه اول
                                </span>
                              )
                            )}
                          </div>
                          <span
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-muted)',
                              fontFamily: 'monospace',
                              direction: 'ltr',
                              textAlign: 'right',
                            }}
                          >
                            {endpointText}
                          </span>
                        </div>
                      </td>

                      {/* 2. Type & Category Badge */}
                      <td>
                        <span className={`badge badge-${typeInfo.badgeColor || (isMulti ? 'indigo' : 'blue')}`} style={{ fontSize: '11px' }}>
                          {typeInfo.label || src.priceType}
                        </span>
                      </td>

                      {/* 3. Last Extracted Value (Price or Count) */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <strong style={{ fontSize: '13.5px', color: 'var(--accent-green, #10b981)', fontWeight: '800' }}>
                              {Number(src.lastPrice || 0) > 0 ? Number(src.lastPrice).toLocaleString('fa-IR') : '-'}
                            </strong>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              {isMulti ? (typeInfo.unit || 'مورد') : (src.unit || typeInfo.unit || 'تومان')}
                            </span>
                          </div>
                          {src.lastFetched && (
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                              {formatPersianDate(src.lastFetched)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 4. Protocol & Extraction Structure */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: '700',
                              color: src.sourceType === 'telegram' ? '#38bdf8' : '#a855f7',
                            }}
                          >
                            {src.sourceType === 'telegram' ? 'کانال تلگرام' : (src.isCatalog ? 'کاتالوگ اختصاصی' : 'وب‌سرویس API')}
                          </span>
                          <span
                            style={{
                              fontSize: '10.5px',
                              color: 'var(--text-muted)',
                              fontFamily: 'monospace',
                              direction: 'ltr',
                              textAlign: 'right',
                            }}
                          >
                            {isMulti
                              ? (mapping.feedType === 'key_value' || src.priceType === 'forex' ? 'جفت‌ارزهای جهانی' : (src.isCatalog ? 'پارسر کاتالوگ هوشمند' : 'آرایه محصولات'))
                              : (src.sourceType === 'telegram' ? (src.regex || 'الگوی فروش پیش‌فرض') : (src.jsonPath || 'JSON Path'))}
                          </span>
                        </div>
                      </td>

                      {/* 5. Primary Reference / Data Explorer */}
                      <td>
                        {isMulti ? (
                          <button
                            type="button"
                            className="btn-action-icon"
                            title="کاوشگر زنده داده‌ها (مشاهده و تست اقلام)"
                            onClick={() => onOpenExplorer && onOpenExplorer(src)}
                            style={{
                              color: '#818cf8',
                              background: 'rgba(99,102,241,0.12)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '5px 10px',
                              borderRadius: '6px',
                              fontSize: '11.5px',
                              fontWeight: '600',
                              border: '1px solid rgba(99,102,241,0.25)',
                              cursor: 'pointer',
                            }}
                          >
                            <Eye size={13} />
                            <span>کاوش اقلام</span>
                          </button>
                        ) : (
                          src.isPrimary ? (
                            <div className="badge-primary-source" title="سورس پیش‌فرض محاسبات قیمت">
                              <Star size={11} fill="#fbbf24" color="#fbbf24" />
                              <span>سورس مرجع</span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onSetPrimary && onSetPrimary(src)}
                              className="btn-set-primary"
                              title="تبدیل به سورس مرجع برای محاسبات سایت"
                            >
                              <Star size={11} />
                              <span>انتخاب مرجع</span>
                            </button>
                          )
                        )}
                      </td>

                      {/* 6. Active Toggle Switch */}
                      <td>
                        <button
                          type="button"
                          onClick={() => onToggleActive && onToggleActive(src)}
                          className={`source-toggle-btn ${src.isActive ? 'active' : 'inactive'}`}
                          title={src.isActive ? 'کلیک برای غیرفعال‌سازی' : 'کلیک برای فعال‌سازی'}
                        >
                          <span className="toggle-indicator" />
                          <span>{src.isActive ? 'فعال' : 'غیرفعال'}</span>
                        </button>
                      </td>

                      {/* 7. Action (Live Test / Refresh) */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <button
                            type="button"
                            className="btn-action-icon"
                            title="تست زنده اتصال و استخراج نرخ"
                            onClick={() => onTest && onTest(src)}
                            disabled={isRowTesting}
                            style={{
                              color: '#34d399',
                              background: 'rgba(16,185,129,0.12)',
                              border: '1px solid rgba(16,185,129,0.2)',
                              padding: '5px 12px',
                              borderRadius: '6px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              cursor: 'pointer',
                              fontSize: '11.5px',
                              fontWeight: '600',
                            }}
                          >
                            <PlayCircle size={14} className={isRowTesting ? 'spin-anim' : ''} />
                            <span>{isRowTesting ? 'در حال دریافت...' : 'تست زنده'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Inline Test Result Banner */}
                    {rowResult && (
                      <tr className="test-result-row">
                        <td colSpan="7" style={{ padding: '8px 16px', background: 'rgba(0,0,0,0.12)' }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '12px',
                              gap: '8px',
                            }}
                          >
                            {rowResult.success ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-green, #10b981)' }}>
                                <CheckCircle2 size={14} />
                                <span>
                                  {rowResult.message || (
                                    isMulti
                                      ? <>داده‌های فید با موفقیت دریافت شدند: <strong>{Number(rowResult.price || rowResult.count || 0).toLocaleString('fa-IR')} مورد</strong></>
                                      : <>قیمت با موفقیت استخراج و ذخیره شد: <strong>{formatNum(rowResult.price, src.priceType)} {getItemUnit(src)}</strong></>
                                  )}
                                </span>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-rose, #f43f5e)' }}>
                                <AlertCircle size={14} />
                                <span>خطا در استخراج: {rowResult.error || 'عدم دسترسی به سورس یا عدم تطابق ساختار'}</span>
                              </div>
                            )}
                            {onClearTestResult && (
                              <button
                                type="button"
                                onClick={() => onClearTestResult(src.id)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                              >
                                <X size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
