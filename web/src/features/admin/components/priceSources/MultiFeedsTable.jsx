import React from 'react';
import {
  Layers,
  X,
  Eye,
  PlayCircle,
} from 'lucide-react';
import EmptyState from '../../../../components/ui/EmptyState.jsx';
import { formatPersianDate, CANONICAL_PRICE_TYPE_INFO } from './priceSourceConstants.js';

export default function MultiFeedsTable({
  multiSources = [],
  multiSearch = '',
  setMultiSearch,
  loadingSources = false,
  handleOpenAddMultiFeed,
  onOpenAddMultiFeed,
  handleOpenExplorer,
  onOpenExplorer,
  handleTestRowSource,
  onTestMultiSource,
  handleOpenEditMultiFeed,
  onOpenEditMultiFeed,
  handleDeleteSource,
  onDeleteMultiFeed,
  handleToggleActive,
  onToggleActive,
  rowTestingId = null,
  testingFeedId = null,
  PRICE_TYPE_INFO,
  priceTypeInfo,
}) {
  const addFeed = onOpenAddMultiFeed || handleOpenAddMultiFeed;
  const openExplorer = onOpenExplorer || handleOpenExplorer;
  const testFeed = onTestMultiSource || handleTestRowSource;
  const editFeed = onOpenEditMultiFeed || handleOpenEditMultiFeed;
  const deleteFeed = onDeleteMultiFeed || handleDeleteSource;
  const toggleActive = onToggleActive || handleToggleActive;
  const activeTestingId = testingFeedId || rowTestingId;
  const typeInfoMap = priceTypeInfo || PRICE_TYPE_INFO || CANONICAL_PRICE_TYPE_INFO;

  const filteredMultiSources = multiSources.filter((s) => {
    if (!multiSearch.trim()) return true;
    const q = multiSearch.toLowerCase();
    return (
      (s.name && s.name.toLowerCase().includes(q)) ||
      (s.endpoint && s.endpoint.toLowerCase().includes(q)) ||
      (s.priceType && s.priceType.toLowerCase().includes(q))
    );
  });

  return (
    <section className="multi-feeds-hub-wrap">
      {/* Table Toolbar */}
      <div className="table-header-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={17} style={{ color: 'var(--accent-indigo, #6366f1)' }} />
          <h3 style={{ fontSize: '15px', fontWeight: '800', margin: 0, color: 'var(--text-heading)' }}>
            هاب سورس‌های چند خروجی و فیدها (Multi-Output Feeds)
          </h3>
        </div>
      </div>

      {/* Multi-Output Feeds Table */}
      <div className="users-table-wrap sources-fullscreen-table-wrap">
        <table className="users-table sources-table">
          <thead>
            <tr>
              <th>نام فید و آدرس</th>
              <th>دسته‌بندی</th>
              <th>تعداد اقلام رصدشده</th>
              <th>نگاشت ساختار ستون‌ها</th>
              <th>موارد مستثنی‌شده</th>
              <th>وضعیت</th>
              <th style={{ textAlign: 'center' }}>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {filteredMultiSources.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '36px' }}>
                  <EmptyState
                    title={loadingSources ? 'در حال دریافت فیدها...' : 'هیچ فید چند خروجی یافت نشد.'}
                    description="برای اتصال به API خودرو، بورس، کریپتو یا وب‌سرویس دلخواه، یک فید جدید ایجاد کنید."
                    action={
                      <button
                        type="button"
                        className="btn-primary"
                        style={{ fontSize: '12px', padding: '8px 16px' }}
                        onClick={addFeed}
                      >
                        + ایجاد اولین فید هوشمند
                      </button>
                    }
                  />
                </td>
              </tr>
            ) : (
              filteredMultiSources.map((src) => {
                const typeInfo = typeInfoMap[src.priceType] || { label: src.priceType, badgeColor: 'indigo' };
                const mapping = typeof src.fieldMapping === 'string' ? JSON.parse(src.fieldMapping || '{}') : (src.fieldMapping || {});
                const labels = mapping.labels || {};
                const excluded = Array.isArray(src.excludedOutputs)
                  ? src.excludedOutputs
                  : (typeof src.excludedOutputs === 'string' ? JSON.parse(src.excludedOutputs || '[]') : []);

                return (
                  <tr key={src.id}>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <strong style={{ fontSize: '13.5px', color: 'var(--text-heading)' }}>{src.name}</strong>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', direction: 'ltr', textAlign: 'right' }}>
                          {src.endpoint || src.apiUrl || '-'}
                        </span>
                      </div>
                    </td>

                    <td>
                      <span className={`badge badge-${typeInfo.badgeColor || 'indigo'}`} style={{ fontSize: '11px' }}>
                        {typeInfo.label || src.priceType}
                      </span>
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--accent-green, #10b981)' }}>
                          {Number(src.lastPrice || 0).toLocaleString('fa-IR')}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{typeInfo.unit || 'مورد'}</span>
                      </div>
                      {src.lastFetched && (
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>
                          {formatPersianDate(src.lastFetched)}
                        </span>
                      )}
                    </td>

                    <td>
                      {mapping.feedType === 'key_value' || src.priceType === 'forex' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8', width: 'fit-content', fontWeight: '700' }}>
                            کلید-مقدار (Key-Value)
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            ریشه: <code style={{ color: 'var(--text-heading)' }}>{mapping.rootPath || mapping.arrayPath || 'rates'}</code>
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--accent-green, #10b981)' }}>
                            فرمول: <strong>{mapping.defaultMode === 'invert' ? 'معکوس (1/rate)' : (mapping.defaultMode === 'direct' ? 'مستقیم' : 'ضرب')}</strong>
                          </span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '280px' }}>
                          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                            شناسه: <code style={{ color: 'var(--text-heading)' }}>{mapping.idField || mapping.symbolField || 'l18'}</code>
                            {labels.id ? ` (${labels.id})` : ''}
                          </span>
                          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                            عنوان: <code style={{ color: 'var(--text-heading)' }}>{mapping.titleField || mapping.nameField || 'l30'}</code>
                            {labels.title ? ` (${labels.title})` : ''}
                          </span>
                          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: 'var(--accent-green, #10b981)' }}>
                            قیمت: <code style={{ color: 'var(--accent-green, #10b981)' }}>{mapping.priceField || 'pl'}</code>
                            {labels.price ? ` (${labels.price})` : ''}
                          </span>
                          {mapping.altPriceField && (
                            <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                              دوم: <code>{mapping.altPriceField}</code>
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    <td>
                      {mapping.selectionMode === 'whitelist' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            padding: '2px 8px', borderRadius: '6px',
                            background: 'rgba(16, 185, 129, 0.12)', color: '#10b981',
                            fontSize: '11px', fontWeight: '700', width: 'fit-content',
                          }}>
                            فیلتر گزینشی (لیست سفید)
                          </span>
                          <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                            {(mapping.includedKeys || mapping.currencies || []).length.toLocaleString('fa-IR')} قلم انتخابی
                          </span>
                        </div>
                      ) : excluded.length > 0 ? (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          padding: '2px 8px', borderRadius: '6px',
                          background: 'rgba(244,63,94,0.12)', color: '#f43f5e',
                          fontSize: '11px', fontWeight: '700',
                        }}>
                          {excluded.length.toLocaleString('fa-IR')} مورد مستثنی
                        </span>
                      ) : (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>کامل (بدون فیلتر)</span>
                      )}
                    </td>

                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <span className={`status-dot ${src.isActive ? 'active' : 'inactive'}`} />
                          <span style={{ fontSize: '11px', marginRight: '4px' }}>{src.isActive ? 'فعال' : 'غیرفعال'}</span>
                        </div>
                        {(() => {
                          const dc = typeof src.displayConfig === 'string'
                            ? (() => { try { return JSON.parse(src.displayConfig); } catch { return {}; } })()
                            : (src.displayConfig || {});
                          const homeList = Array.isArray(dc.homePageOutputs)
                            ? dc.homePageOutputs
                            : (Array.isArray(dc.showOnHomePage) ? dc.showOnHomePage : null);

                          if (dc.showOnHomePage === false) {
                            return (
                              <span style={{ fontSize: '9.5px', color: '#f43f5e', background: 'rgba(244,63,94,0.12)', padding: '1px 5px', borderRadius: '4px', width: 'fit-content' }}>
                                مخفی در خانه
                              </span>
                            );
                          }
                          if (homeList && homeList.length > 0) {
                            return (
                              <span style={{ fontSize: '9.5px', color: '#818cf8', background: 'rgba(99,102,241,0.12)', padding: '1px 5px', borderRadius: '4px', width: 'fit-content' }} title={`اقلام مجاز: ${homeList.join(', ')}`}>
                                {homeList.length.toLocaleString('fa-IR')} آیتم در خانه
                              </span>
                            );
                          }
                          return (
                            <span style={{ fontSize: '9.5px', color: '#10b981', background: 'rgba(16,185,129,0.12)', padding: '1px 5px', borderRadius: '4px', width: 'fit-content' }}>
                              همه در خانه
                            </span>
                          );
                        })()}
                      </div>
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        {/* Data Explorer button */}
                        <button
                          type="button"
                          className="btn-action-icon"
                          title="کاوشگر زنده داده‌ها (مشاهده و جستجو در اقلام)"
                          onClick={() => openExplorer && openExplorer(src)}
                          style={{ color: '#818cf8', background: 'rgba(99,102,241,0.12)' }}
                        >
                          <Eye size={15} />
                        </button>

                        {/* Live test / refresh button */}
                        <button
                          type="button"
                          className="btn-action-icon"
                          title="تست اتصال و بروزرسانی آنی نرخ‌ها"
                          onClick={() => testFeed && testFeed(src)}
                          disabled={activeTestingId === src.id}
                        >
                          <PlayCircle size={15} className={activeTestingId === src.id ? 'spin-anim' : ''} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
