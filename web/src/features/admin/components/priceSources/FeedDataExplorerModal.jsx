import React from 'react';
import { Eye, Search, RefreshCw } from 'lucide-react';
import Modal from '../../../../shared/ui/Modal.jsx';

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
  const filteredItems = explorerItems
    .filter((item) => {
      if (!explorerSearch.trim()) return true;
      const q = explorerSearch.toLowerCase();
      return (
        (item.s && String(item.s).toLowerCase().includes(q)) ||
        (item.n && String(item.n).toLowerCase().includes(q))
      );
    })
    .slice(0, 100);

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
                placeholder="جستجو در بین اقلام (کد، نام، دسته)..."
                value={explorerSearch}
                onChange={(e) => setExplorerSearch(e.target.value)}
                style={{ width: '100%', paddingRight: '32px', fontSize: '12px' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                مجموع: {explorerItems.length.toLocaleString('fa-IR')} رکورد
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
            ) : (
              <table className="users-table" style={{ width: '100%', fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th>نماد</th>
                    <th>نام دارایی</th>
                    <th>آخرین قیمت (تومان)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, idx) => (
                    <tr key={idx}>
                      <td><strong>{item.s}</strong></td>
                      <td>{item.n}</td>
                      <td style={{ color: 'var(--accent-green, #10b981)', fontWeight: '700' }}>
                        {Number(item.priceToman || item.priceTomans || item.p || item.price || 0).toLocaleString('fa-IR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
