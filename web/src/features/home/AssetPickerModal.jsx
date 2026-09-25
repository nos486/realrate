/**
 * AssetPickerModal.jsx — Search every market asset and add/remove it from a home section
 */

import React, { useMemo, useState } from 'react';
import { Plus, Check, Search } from 'lucide-react';
import Modal from '../../shared/ui/Modal.jsx';
import { usePricing } from '../market/context/PricingContext.jsx';
import { CategoryIcon } from '../portfolio/utils/holdingHelpers.js';

const CATEGORY_FILTERS = [
  { key: '', label: 'همه' },
  { key: 'gold_coin', label: 'طلا و سکه' },
  { key: 'silver', label: 'نقره' },
  { key: 'currency', label: 'ارز' },
  { key: 'crypto', label: 'رمزارز' },
  { key: 'bourse', label: 'بورس' },
  { key: 'bourse_fund', label: 'صندوق' },
];

const RESULT_LIMIT = 60;

export default function AssetPickerModal({ isOpen, onClose, section, onToggle }) {
  const pricing = usePricing();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');

  const results = useMemo(() => {
    if (!pricing?.searchAssets) return [];
    return pricing
      .searchAssets(query, { category, limit: RESULT_LIMIT })
      .filter((a) => a?.id && a.category !== 'cash');
  }, [pricing, query, category]);

  if (!isOpen || !section) return null;
  const selected = new Set(section.items);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`افزودن به «${section.title || 'بخش'}»`}
      subtitle="هر دارایی بازار — طلا، سکه، ارز، رمزارز، نماد بورس یا صندوق — را می‌توانید اضافه کنید."
      icon={<Plus size={18} />}
      maxWidth="560px"
      footer={
        <div className="modal-actions-right">
          <button type="button" className="btn-primary" onClick={onClose}>
            تأیید ({selected.size.toLocaleString('fa-IR')} مورد)
          </button>
        </div>
      }
    >
      <div className="asset-picker">
        <div className="asset-picker-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی نام یا نماد (مثلاً دلار، BTC، فولاد، عیار)…"
            aria-label="جستجوی دارایی"
            autoFocus
          />
        </div>

        <div className="asset-picker-filters" role="group" aria-label="دسته‌بندی">
          {CATEGORY_FILTERS.map((f) => (
            <button
              key={f.key || 'all'}
              type="button"
              className={`tx-filter-pill ${category === f.key ? 'active' : ''}`}
              onClick={() => setCategory(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {results.length === 0 ? (
          <p className="asset-picker-empty">موردی پیدا نشد.</p>
        ) : (
          <ul className="asset-picker-list">
            {results.map((asset) => {
              const isAdded = selected.has(asset.id);
              return (
                <li key={asset.id}>
                  <button
                    type="button"
                    className={`asset-picker-row ${isAdded ? 'is-added' : ''}`}
                    onClick={() => onToggle(asset.id, !isAdded)}
                    aria-pressed={isAdded}
                  >
                    <span className="home-asset-icon" aria-hidden="true">
                      {asset.flag || <CategoryIcon category={asset.category} size={14} />}
                    </span>
                    <span className="asset-picker-name">
                      <strong>{asset.name}</strong>
                      <small>
                        {[asset.badge, asset.code || asset.symbol].filter(Boolean).join(' • ')}
                      </small>
                    </span>
                    <span className="asset-picker-price">
                      {asset.price ? Math.round(asset.price).toLocaleString('fa-IR') : '—'}
                    </span>
                    <span className="asset-picker-action">{isAdded ? <Check size={16} /> : <Plus size={16} />}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
