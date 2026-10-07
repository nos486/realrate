import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  X,
  Award,
  Coins,
  Disc,
  Fuel,
  Gauge,
  Banknote,
  Zap,
  TrendingUp,
  Layers,
  Sparkles,
  Check,
  Wallet,
} from 'lucide-react';
import { usePricing } from '../features/market/index.js';
import { toPriceId } from '../utils/priceIds.js';
import { getItemCategory } from '../config/displayEngine.js';
import { getCategoryIconName, isHoldableCategory } from '../config/categories.config.js';
import {
  PORTFOLIO_CATEGORIES,
} from '../utils/financialSpecs.js';
import TextField from '../shared/ui/TextField.jsx';
import { ownPriceOf, formatPrice } from '../features/market/assetPrice.js';

export function normalizeSearchText(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/\u200C/g, ' ')
    .replace(/\u200B|\u200D|\uFEFF/g, '')
    .replace(/[ي]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .replace(/[آأإ]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/[۰٠]/g, '0')
    .replace(/[۱١]/g, '1')
    .replace(/[۲٢]/g, '2')
    .replace(/[۳٣]/g, '3')
    .replace(/[۴٤]/g, '4')
    .replace(/[۵٥]/g, '5')
    .replace(/[۶٦]/g, '6')
    .replace(/[۷٧]/g, '7')
    .replace(/[۸٨]/g, '8')
    .replace(/[۹٩]/g, '9')
    .replace(/\s+/g, ' ')
    .trim();
}

const ICON_COMPONENT_MAP = {
  Fuel,
  Gauge,
  Award,
  Coins,
  Disc,
  Banknote,
  Zap,
  TrendingUp,
  Layers,
  Sparkles,
  Wallet,
};

function getAssetIcon(item) {
  if (!item) return <Sparkles size={15} />;
  const cat = getItemCategory(item);
  const iconName = getCategoryIconName(cat);
  const IconComponent = ICON_COMPONENT_MAP[iconName] || Sparkles;
  return <IconComponent size={15} />;
}

export default function UniversalAssetSearch({
  mode = 'picker',
  selectedAsset = null,
  selectedAssetId = null,
  onSelect = () => {},
  placeholder = 'جستجو در تمامی دارایی‌ها و سورس‌ها...',
  title = '',
  subtitle = '',
  autoFocus = false,
  showCategories = false,
}) {
  const pricingContext = usePricing();
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const containerRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 3. Every asset of the price book — the one list, the one id and the one price the whole app uses
  const resolvedAssets = pricingContext?.resolvedAssets;
  // Only what can be held: market indicators (a coin's bubble) are never bought or paid with
  const allItems = useMemo(() => (resolvedAssets || []).filter((asset) => isHoldableCategory(asset.category)).map((asset) => {
    const category = asset.category || 'custom';
    const isBourse = category.startsWith('bourse');
    return {
      id: asset.id,
      sourceId: asset.sourceId || null,
      sourceName: asset.sourceName || undefined,
      name: asset.name,
      symbol: asset.symbol || '',
      subText: asset.subText || '',
      badge: asset.badge,
      badgeClass: category,
      category,
      aliases: asset.aliases || [],
      // `price` stays in tomans (what a picked asset fills in a form); a dollar-priced asset is
      // shown at its dollar price (assetPrice.js)
      price: asset.price,
      shown: ownPriceOf(asset),
      unit: asset.unit,
      type: category === 'currency' ? 'forex' : (isBourse ? 'bourse' : 'standard'),
      changePercent: asset.changePercent,
      isFund: asset.isFund,
      raw: asset,
    };
  }), [resolvedAssets]);

  // 4. Pure Client-Side Instant Search Filter with Scoring, Category Filter, and Tokenized Matching
  const filteredItems = useMemo(() => {
    let list = allItems;

    // Filter by category pill if selected
    if (activeCategory && activeCategory !== 'all') {
      list = list.filter((item) => item.category === activeCategory);
    }

    const q = normalizeSearchText(query);
    if (!q) return list;

    const qTokens = q.split(/\s+/).filter(Boolean);

    const scored = [];
    for (const item of list) {
      const nameNorm = normalizeSearchText(item.name);
      const symNorm = normalizeSearchText(item.symbol);
      const idNorm = normalizeSearchText(item.id);
      const subNorm = normalizeSearchText(item.subText);
      const aliases = Array.isArray(item.aliases) ? item.aliases : [];
      const aliasesNorm = aliases.map(normalizeSearchText).filter(Boolean);

      let score = 0;

      // 1. Exact matches
      if (symNorm && symNorm === q) {
        score += 1200;
      } else if (nameNorm === q) {
        score += 1000;
      } else if (aliasesNorm.includes(q)) {
        score += 950;
      } else if (idNorm === q) {
        score += 900;
      }
      // 2. Starts with query
      else if (symNorm && symNorm.startsWith(q)) {
        score += 600;
      } else if (nameNorm.startsWith(q)) {
        score += 500;
      } else if (aliasesNorm.some((a) => a.startsWith(q))) {
        score += 450;
      }
      // 3. Contains query as substring
      else if (symNorm && symNorm.includes(q)) {
        score += 300;
      } else if (nameNorm.includes(q)) {
        score += 250;
      } else if (aliasesNorm.some((a) => a.includes(q))) {
        score += 200;
      } else if (subNorm.includes(q)) {
        score += 100;
      } else if (idNorm.includes(q)) {
        score += 80;
      }
      // 4. Multi-token match
      else if (qTokens.length > 1) {
        const combined = `${nameNorm} ${symNorm} ${aliasesNorm.join(' ')} ${subNorm} ${idNorm}`;
        const allTokensMatch = qTokens.every((tok) => combined.includes(tok));
        if (allTokensMatch) {
          score += 150;
        }
      }

      if (score > 0) {
        if (item.type === 'standard' || item.type === 'forex') score += 20;
        scored.push({ item, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);

    // Deduplicate
    const unique = [];
    const seenResultKeys = new Set();
    for (const entry of scored) {
      const canonicalKey = (entry.item.id || '').toLowerCase().trim();
      if (seenResultKeys.has(canonicalKey)) continue;
      seenResultKeys.add(canonicalKey);
      unique.push(entry.item);
    }

    return unique;
  }, [allItems, query, activeCategory]);

  const isItemActive = (item) => {
    const targetId = selectedAssetId || (selectedAsset?.id ? selectedAsset.id : null);
    // A stored id may be an older form of the book id
    return Boolean(targetId) && item.id === toPriceId(targetId, pricingContext?.itemMap);
  };

  const handleSelectItem = (item) => {
    onSelect(item);
    if (mode === 'picker') {
      setIsDropdownOpen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`universal-search-container mode-${mode}`}
      style={{ position: 'relative', width: '100%' }}
    >
      {/* Header Area (No tabs) */}
      {(title || subtitle || (mode === 'explorer' && selectedAsset)) && (
        <div className="universal-search-header-area" style={{ marginBottom: '10px' }}>
          {title && (
            <div className="universal-header-titles">
              <h4 className="universal-search-title">{title}</h4>
              {subtitle && <p className="universal-search-subtitle">{subtitle}</p>}
            </div>
          )}

          {/* Active Asset Banner in Explorer Mode */}
          {mode === 'explorer' && selectedAsset && (
            <div className="universal-active-asset-banner">
              <div className="universal-active-badge">دارایی فعال</div>
              <div className="universal-active-details">
                <div className="universal-active-icon">
                  {getAssetIcon(selectedAsset)}
                </div>
                <strong className="universal-active-name">
                  {selectedAsset?.name || 'انتخاب نشده'}
                </strong>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search Input Bar */}
      <div className="universal-search-bar">
        <Search size={16} className="universal-search-icon" />
        <TextField
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (mode === 'picker') setIsDropdownOpen(true);
          }}
          onFocus={() => {
            if (mode === 'picker') setIsDropdownOpen(true);
          }}
          placeholder={placeholder}
          className="universal-search-input"
          autoFocus={autoFocus}
        />
        {query && (
          <button
            type="button"
            className="universal-search-clear"
            onClick={() => setQuery('')}
            title="پاک کردن"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Category Filter Pills Strip */}
      {showCategories && (
        <div className="universal-categories-strip" style={{ marginTop: '8px', marginBottom: '4px' }}>
          <button
            type="button"
            className={`universal-category-pill ${activeCategory === 'all' ? 'active' : ''}`}
            onClick={() => {
              setActiveCategory('all');
              if (mode === 'picker') setIsDropdownOpen(true);
            }}
          >
            <span>همه</span>
          </button>
          {PORTFOLIO_CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              type="button"
              className={`universal-category-pill ${activeCategory === cat.key ? 'active' : ''}`}
              onClick={() => {
                setActiveCategory(cat.key);
                if (mode === 'picker') setIsDropdownOpen(true);
              }}
            >
              <span>{cat.badge || cat.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Results Rendering */}
      {mode === 'picker' ? (
        /* Picker Mode: Dropdown Popover */
        isDropdownOpen && (
          <div className="universal-results-picker-dropdown">
            {filteredItems.length === 0 ? (
              <div className="universal-empty-results">
                هیچ دارایی یا سورسی یافت نشد.
              </div>
            ) : (
              filteredItems.slice(0, 50).map((item) => {
                const active = isItemActive(item);
                return (
                  <div
                    key={item.id}
                    className={`universal-result-card ${active ? 'active-selected' : ''}`}
                    onClick={() => handleSelectItem(item)}
                  >
                    <div className="universal-result-info">
                      <div className="universal-result-icon">
                        {getAssetIcon(item)}
                      </div>
                      <div className="universal-result-text">
                        <span className="universal-result-name">{item.name}</span>
                        <div className="universal-result-sub">
                          <span className="universal-result-badge">
                            {item.badge}
                          </span>
                          {item.subText && <span>{item.subText}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="universal-result-pricing">
                      {item.price > 0 ? (
                        <>
                          <span className="universal-result-price">
                            {item.shown?.currency === 'usd'
                              ? formatPrice(item.shown.value, 'usd')
                              : item.price % 1 !== 0
                                ? Number(item.price).toLocaleString('fa-IR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
                                : Math.round(item.price).toLocaleString('fa-IR')}
                          </span>
                          <span className="universal-result-unit">{item.shown?.currency === 'usd' ? 'دلار' : item.unit || 'تومان'}</span>
                        </>
                      ) : (
                        <span className="universal-result-badge" style={{ color: 'var(--color-primary-text)' }}>
                          {active ? <Check size={12} /> : 'انتخاب'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )
      ) : (
        /* Explorer Mode: Grid View */
        query.trim().length > 0 && (
          <div className="universal-results-explorer">
            {filteredItems.length === 0 ? (
              <div className="universal-empty-results" style={{ gridColumn: '1 / -1' }}>
                موردی با این مشخصات یافت نشد.
              </div>
            ) : (
              filteredItems.slice(0, 50).map((item) => {
                const active = isItemActive(item);
                return (
                  <div
                    key={item.id}
                    className={`universal-result-card ${active ? 'active-selected' : ''}`}
                    onClick={() => handleSelectItem(item)}
                  >
                    <div className="universal-result-info">
                      <div className="universal-result-icon">
                        {getAssetIcon(item)}
                      </div>
                      <div className="universal-result-text">
                        <span className="universal-result-name">{item.name}</span>
                        <div className="universal-result-sub">
                          <span className="universal-result-badge">
                            {item.badge}
                          </span>
                          {item.subText && <span>{item.subText}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="universal-result-pricing">
                      {item.price > 0 ? (
                        <>
                          <span className="universal-result-price">
                            {item.shown?.currency === 'usd'
                              ? formatPrice(item.shown.value, 'usd')
                              : item.price % 1 !== 0
                                ? Number(item.price).toLocaleString('fa-IR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
                                : Math.round(item.price).toLocaleString('fa-IR')}
                          </span>
                          <span className="universal-result-unit">{item.shown?.currency === 'usd' ? 'دلار' : item.unit || 'تومان'}</span>
                        </>
                      ) : (
                        <span className="universal-result-badge" style={{ color: 'var(--color-primary-text)' }}>
                          {active ? <Check size={12} /> : 'انتخاب'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )
      )}
    </div>
  );
}
