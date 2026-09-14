import React, { useMemo } from 'react';
import { Eye, Search, RefreshCw } from 'lucide-react';
import Modal from '../../../../shared/ui/Modal.jsx';

function normalizeSearch(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[ي]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .replace(/[آأإ]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/‌/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function FeedDataExplorerModal({
  isOpen,
  onClose,
  explorerFeed,
  explorerSearch,
  setExplorerSearch,
  explorerLoading,
  explorerItems = [],
  handleOpenExplorer,
}) {
  const filteredItems = useMemo(() => {
    const q = normalizeSearch(explorerSearch);
    if (!q) return explorerItems.slice(0, 150);
    return explorerItems
      .filter((item) => {
        const sym = normalizeSearch(item.s || item.symbol || '');
        const name = normalizeSearch(item.n || item.name || '');
        const cat = normalizeSearch(item.cat || item.category || '');
        return sym.includes(q) || name.includes(q) || cat.includes(q);
      })
      .slice(0, 150);
  }, [explorerItems, explorerSearch]);

  const totalFilteredCount = useMemo(() => {
    const q = normalizeSearch(explorerSearch);
    if (!q) return explorerItems.length;
    return explorerItems.filter((item) => {
      const sym = normalizeSearch(item.s || item.symbol || '');
      const name = normalizeSearch(item.n || item.name || '');
      const cat = normalizeSearch(item.cat || item.category || '');
      return sym.includes(q) || name.includes(q) || cat.includes(q);
    }).length;
  }, [explorerItems, explorerSearch]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`کاوشگر داده‌های زنده: ${explorerFeed?.name || ''}`}
      icon={<Eye size={18} style={{ color: '#818cf8' }} />}
      maxWidth="900px"
      className="source-edit-modal-card"
      footer={
        <div className="modal-actions-right">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
          >
            بستن
          </button>
        </div>
      }
    >
      {explorerFeed && (
        <div>
          {/* Toolbar */}
          <div className="data-explorer-toolbar">
            <div className="data-explorer-search">
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
              />
              <input
                type="text"
                placeholder="جستجو در بین اقلام (نماد، نام، دسته)..."
                value={explorerSearch}
                onChange={(e) => setExplorerSearch(e.target.value)}
                style={{ width: '100%', paddingRight: '32px', fontSize: '12px' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {explorerSearch.trim()
                  ? `${totalFilteredCount.toLocaleString('fa-IR')} از ${explorerItems.length.toLocaleString('fa-IR')} رکورد`
                  : `مجموع: ${explorerItems.length.toLocaleString('fa-IR')} رکورد`}
              </span>
              <button
                type="button"
                onClick={() => handleOpenExplorer(explorerFeed)}
                disabled={explorerLoading}
                className="btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <RefreshCw size={12} className={explorerLoading ? 'spin-anim' : ''} />
                <span>بروزرسانی زنده</span>
              </button>
            </div>
          </div>

          {/* Items Table */}
          <div className="data-explorer-table-wrap">
            {explorerLoading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <RefreshCw size={24} className="spin-anim" style={{ margin: '0 auto 8px', color: '#818cf8' }} />
                <p>در حال دریافت آخرین داده‌های فید از منبع...</p>
              </div>
            ) : explorerItems.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                هیچ رکوردی برای نمایش یافت نشد.
              </div>
            ) : filteredItems.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                هیچ موردی مطابق با جستجوی شما یافت نشد.
              </div>
            ) : (
              <table className="users-table" style={{ width: '100%', fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th style={{ width: '120px' }}>نماد</th>
                    <th>نام دارایی</th>
                    <th style={{ width: '140px' }}>نوع / دسته</th>
                    <th style={{ width: '150px', textAlign: 'left' }}>آخرین قیمت</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, idx) => {
                    const sym = item.s || item.symbol || '—';
                    const name = item.n || item.name || sym;
                    const price = Number(item.priceToman || item.priceTomans || item.p || item.price || 0);
                    const cat = item.cat || item.category || (item.isFund ? 'صندوق سرمایه‌گذاری' : 'سهام بورس');
                    return (
                      <tr key={idx}>
                        <td>
                          <strong style={{ fontFamily: 'monospace', fontSize: '13px' }}>{sym}</strong>
                        </td>
                        <td>{name}</td>
                        <td>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {cat}
                          </span>
                        </td>
                        <td style={{ color: 'var(--accent-green, #10b981)', fontWeight: '700', textAlign: 'left' }}>
                          {price > 0 ? `${price.toLocaleString('fa-IR')} تومان` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
