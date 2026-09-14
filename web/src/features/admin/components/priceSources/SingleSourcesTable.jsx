import React from 'react';
import {
  Sliders,
  Star,
  PlayCircle,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';
import FilterPills from '../../../../components/ui/FilterPills.jsx';
import EmptyState from '../../../../components/ui/EmptyState.jsx';
import { formatNum, getPriceUnit, formatPersianDate, CANONICAL_PRICE_TYPE_INFO } from './priceSourceConstants.js';

export default function SingleSourcesTable({
  sources = [],
  singleSources,
  filteredSingleSources: propFiltered,
  loadingSources = false,
  sourceFilter = 'all',
  setSourceFilter,
  dynamicFilterOptions = [],
  PRICE_TYPE_INFO,
  priceTypeInfo,
  rowTestingId = null,
  rowTestResults = {},
  setRowTestResults,
  onClearRowTestResult,
  handleSetPrimary,
  onSetPrimary,
  handleToggleActive,
  onToggleActive,
  handleTestRowSource,
  onTestRowSource,
  handleOpenEditSource,
  onOpenEditSource,
  handleDeleteSource,
  onDeleteSource,
}) {
  const allSources = singleSources !== undefined ? singleSources : sources;
  const filteredSingleSources = propFiltered !== undefined
    ? propFiltered
    : (sourceFilter === 'all' ? allSources : allSources.filter((s) => s.priceType === sourceFilter));

  const typeInfoMap = priceTypeInfo || PRICE_TYPE_INFO || CANONICAL_PRICE_TYPE_INFO;
  const setPrimary = onSetPrimary || handleSetPrimary;
  const toggleActive = onToggleActive || handleToggleActive;
  const testRow = onTestRowSource || handleTestRowSource;
  const editSource = onOpenEditSource || handleOpenEditSource;
  const deleteSource = onDeleteSource || handleDeleteSource;
  const clearResult = onClearRowTestResult || ((srcId) => {
    if (setRowTestResults) {
      setRowTestResults((prev) => {
        const next = { ...prev };
        delete next[srcId];
        return next;
      });
    }
  });

  return (
    <section className="sources-table-section">
      <div className="table-header-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sliders size={17} style={{ color: 'var(--accent-blue)' }} />
          <h3 style={{ fontSize: '15px', fontWeight: '800', margin: 0, color: 'var(--text-heading)' }}>
            جدول مدیریت و پیکربندی سورس‌های نرخ پایه
          </h3>
        </div>

        {/* Dynamic Filter Pills based on actual sources */}
        <FilterPills
          options={dynamicFilterOptions}
          activeValue={sourceFilter}
          onChange={setSourceFilter}
        />
      </div>

      {/* Table Container */}
      <div className="users-table-wrap sources-fullscreen-table-wrap">
        <table className="users-table sources-table">
          <thead>
            <tr>
              <th>نام سورس و آدرس</th>
              <th>نوع نرخ</th>
              <th>پروتکل</th>
              <th>تنظیمات استخراج</th>
              <th>آخرین قیمت استخراجی</th>
              <th>سورس مرجع</th>
              <th>وضعیت</th>
              <th style={{ textAlign: 'center' }}>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {filteredSingleSources.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: '24px' }}>
                  <EmptyState
                    title={loadingSources ? 'در حال دریافت لیست سورس‌ها...' : 'هیچ سورسی در این دسته‌بندی یافت نشد.'}
                    description={sourceFilter !== 'all' ? `برای مشاهده سایر سورس‌ها، فیلتر "${typeInfoMap[sourceFilter]?.label || sourceFilter}" را تغییر دهید.` : null}
                    action={
                      sourceFilter !== 'all' ? (
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ fontSize: '12px', padding: '6px 14px' }}
                          onClick={() => setSourceFilter('all')}
                        >
                          مشاهده همه سورس‌ها
                        </button>
                      ) : null
                    }
                  />
                </td>
              </tr>
            ) : (
              filteredSingleSources.map((src) => {
                const typeInfo = typeInfoMap[src.priceType] || { label: src.priceType, badgeColor: 'blue' };
                const isRowTesting = rowTestingId === src.id;
                const rowResult = rowTestResults[src.id];

                return (
                  <React.Fragment key={src.id}>
                    <tr>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '13.5px', color: 'var(--text-heading)' }}>
                              {src.name}
                            </strong>
                            {(() => {
                              const dc = typeof src.displayConfig === 'string'
                                ? (() => { try { return JSON.parse(src.displayConfig); } catch { return {}; } })()
                                : (src.displayConfig || {});
                              return dc.showOnHomePage === false ? (
                                <span style={{ fontSize: '10px', color: '#f43f5e', background: 'rgba(244,63,94,0.12)', padding: '1px 6px', borderRadius: '4px', width: 'fit-content' }}>
                                  مخفی از صفحه اول
                                </span>
                              ) : (
                                <span style={{ fontSize: '10px', color: '#10b981', background: 'rgba(16,185,129,0.12)', padding: '1px 6px', borderRadius: '4px', width: 'fit-content' }}>
                                  صفحه اول
                                </span>
                              );
                            })()}
                          </div>
                          <span
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-muted)',
                              direction: 'ltr',
                              textAlign: 'right',
                              fontFamily: 'monospace',
                            }}
                          >
                            {src.sourceType === 'telegram'
                              ? `@${(src.channelUsername || src.endpoint || '').replace(/^@/, '')}`
                              : (src.apiUrl || src.endpoint || '')}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span className={`source-type-pill pill-${typeInfo.badgeColor}`}>
                            {typeInfo.label}
                          </span>
                          {typeInfo.category === 'multi_output' && (
                            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(99,102,241,0.1)', color: '#6366f1', width: 'fit-content' }}>
                              چند خروجی
                            </span>
                          )}
                          {Array.isArray(src.excludedOutputs) && src.excludedOutputs.length > 0 && (
                            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(244,63,94,0.1)', color: '#f43f5e', width: 'fit-content' }}>
                              {src.excludedOutputs.length} مورد حذف‌شده
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span
                          className="source-proto-tag"
                          style={{
                            background:
                              src.sourceType === 'telegram'
                                ? 'rgba(0,136,204,0.12)'
                                : 'rgba(16,185,129,0.12)',
                            color: src.sourceType === 'telegram' ? '#0088cc' : '#10b981',
                          }}
                        >
                          {src.sourceType === 'telegram' ? 'کانال تلگرام' : 'وب‌سرویس API'}
                        </span>
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: '11px',
                            fontFamily: 'monospace',
                            direction: 'ltr',
                            display: 'block',
                            maxWidth: '220px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            color: 'var(--text-muted)',
                          }}
                          title={
                            src.sourceType === 'telegram'
                              ? `Regex: ${src.regexPattern || src.regex} (group ${src.regexGroupIndex || 1})`
                              : `JSON Path: ${src.jsonPath || 'بدون مسیر'}`
                          }
                        >
                          {src.sourceType === 'telegram'
                            ? (src.regexPattern || src.regex || 'پیش‌فرض')
                            : (src.jsonPath || '—')}
                        </span>
                      </td>
                      <td>
                        {src.lastPrice && Number(src.lastPrice) > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {src.isCatalog || typeInfo.category === 'multi_output' ? (
                              <strong style={{ fontSize: '13px', color: 'var(--accent-blue)', fontWeight: '700' }}>
                                {Number(src.lastPrice).toLocaleString('fa-IR')} {typeInfo.unit || 'مورد رصدشده'}
                              </strong>
                            ) : (
                              <strong
                                style={{
                                  fontSize: '13.5px',
                                  color: 'var(--accent-green, #10b981)',
                                  fontWeight: '700',
                                }}
                              >
                                {formatNum(src.lastPrice, src.priceType)} {getPriceUnit(src.priceType)}
                              </strong>
                            )}
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                              {formatPersianDate(src.lastFetched)}
                            </span>
                          </div>
                        ) : (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            هنوز دریافت نشده
                          </span>
                        )}
                      </td>
                      <td>
                        {src.isPrimary ? (
                          <span className="primary-badge" title="سورس پیش‌فرض این نوع قیمت">
                            <Star size={11} fill="currentColor" />
                            <span>مرجع</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setPrimary && setPrimary(src)}
                            className="btn-set-primary"
                            title="تبدیل به سورس مرجع برای محاسبات سایت"
                          >
                            <Star size={11} />
                            <span>انتخاب مرجع</span>
                          </button>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => toggleActive && toggleActive(src)}
                          className={`source-toggle-btn ${src.isActive ? 'active' : 'inactive'}`}
                          title={src.isActive ? 'کلیک برای غیرفعال‌سازی' : 'کلیک برای فعال‌سازی'}
                        >
                          <span className="toggle-indicator" />
                          <span>{src.isActive ? 'فعال' : 'غیرفعال'}</span>
                        </button>
                      </td>
                      <td>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => testRow && testRow(src)}
                            disabled={isRowTesting}
                            className="btn-sm btn-primary-action"
                            style={{ padding: '5px 12px', fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                            title="دریافت زنده قیمت و ذخیره در کش"
                          >
                            <PlayCircle
                              size={13}
                              className={isRowTesting ? 'spin-anim' : ''}
                            />
                            <span>{isRowTesting ? 'در حال دریافت...' : 'بروزرسانی نرخ'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Inline Test Result Banner */}
                    {rowResult && (
                      <tr className="test-result-row">
                        <td colSpan="8" style={{ padding: '8px 16px', background: 'rgba(0,0,0,0.06)' }}>
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
                                    <>قیمت با موفقیت استخراج و ذخیره شد: <strong>{formatNum(rowResult.price, src.priceType)} {getPriceUnit(src.priceType)}</strong></>
                                  )}
                                </span>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-rose, #f43f5e)' }}>
                                <AlertCircle size={14} />
                                <span>خطا در استخراج قیمت: {rowResult.error || 'عدم تطابق قیمت'}</span>
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => clearResult && clearResult(src.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                            >
                              <X size={13} />
                            </button>
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
