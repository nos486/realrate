import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  X,
  Award,
  Coins,
  Disc,
  Banknote,
  Zap,
  TrendingUp,
  Layers,
  Sparkles,
  Check,
} from 'lucide-react';
import { apiGetPriceSources, apiSearchBourseSymbols } from '../api/client.js';

export function isSourceMultiOutput(s, priceTypeInfo = {}) {
  if (!s) return false;
  const t = (s.priceType || '').toLowerCase();
  const info = priceTypeInfo ? (priceTypeInfo[t] || priceTypeInfo[s.priceType]) : null;
  if (info?.category === 'multi_output') return true;
  if (s.category === 'multi_output' || s.isMultiOutput) return true;
  if (t === 'bourse' || t === 'bourse_fund' || t === 'forex') return true;
  if (s.fieldMapping) {
    let fm = s.fieldMapping;
    if (typeof fm === 'string') {
      try { fm = JSON.parse(fm); } catch {}
    }
    if (fm && (fm.isMultiOutput || fm.idField || fm.symbolField || fm.currencies || fm.arrayPath)) return true;
  }
  if (s.lastMultiData) return true;
  if (Array.isArray(s.sampleItems) && s.sampleItems.length > 0) return true;
  if (Array.isArray(s.compactList) && s.compactList.length > 0) return true;
  if (Array.isArray(s.items) && s.items.length > 0) return true;
  return false;
}

export function extractMultiItems(src) {
  if (!src) return [];
  let multi = src.lastMultiData;
  if (typeof multi === 'string') {
    try {
      multi = JSON.parse(multi);
    } catch (e) {
      console.warn('Failed to parse lastMultiData for', src.name, e);
    }
  }

  let rawList = [];
  if (multi) {
    if (Array.isArray(multi.sampleItems)) rawList = multi.sampleItems;
    else if (Array.isArray(multi.compactList)) rawList = multi.compactList;
    else if (Array.isArray(multi.items)) rawList = multi.items;
    else if (Array.isArray(multi.symbols)) rawList = multi.symbols;
    else if (Array.isArray(multi.data)) rawList = multi.data;
    else if (Array.isArray(multi.results)) rawList = multi.results;
    else if (Array.isArray(multi.result)) rawList = multi.result;
    else if (Array.isArray(multi.list)) rawList = multi.list;
    else if (Array.isArray(multi)) rawList = multi;
    else if (typeof multi === 'object') {
      rawList = Object.entries(multi)
        .filter(([k]) => !['updatedAt', 'totalCount', 'totalSymbols', 'totalFunds', 'fundsCount', 'labels', 'topSymbols', 'error', 'datetime', 'lastUpdated'].includes(k))
        .map(([k, v]) => {
          if (v && typeof v === 'object') {
            return {
              s: v.symbol || v.s || v.code || k,
              n: v.name || v.n || v.title || v.label || k,
              p: v.price || v.p || v.priceTomans || v.lastPrice || v.val || 0,
              priceTomans: v.priceTomans || v.price || v.p || 0,
              cp: v.changePercent || v.cp || v.plp || 0,
              cat: v.category || v.cat || v.group || '',
              extra: v.extra || '',
            };
          }
          return {
            s: k,
            n: k,
            p: Number(v) || 0,
            priceTomans: Number(v) || 0,
          };
        });
    }
  }

  if (rawList.length === 0) {
    if (Array.isArray(src.sampleItems)) rawList = src.sampleItems;
    else if (Array.isArray(src.compactList)) rawList = src.compactList;
    else if (Array.isArray(src.items)) rawList = src.items;
  }

  if (!rawList || rawList.length === 0) return [];

  let excludedSet = new Set();
  if (src.excludedOutputs) {
    let excludedArr = [];
    if (Array.isArray(src.excludedOutputs)) {
      excludedArr = src.excludedOutputs;
    } else if (typeof src.excludedOutputs === 'string') {
      try { excludedArr = JSON.parse(src.excludedOutputs); } catch {}
    }
    excludedSet = new Set(excludedArr.map((x) => String(x).trim().toLowerCase()));
  }

  const isBourse = src.priceType === 'bourse' || src.priceType === 'bourse_fund';
  const isRial = src.unit === 'rial' || (typeof src.fieldMapping === 'object' && src.fieldMapping?.priceUnit === 'rial') || isBourse;

  return rawList
    .filter((item) => {
      if (!item || typeof item !== 'object') return false;
      const sym = String(item.s || item.symbol || item.id || item.code || item.slug || item.l18 || item.ticker || '').trim().toLowerCase();
      const name = String(item.n || item.name || item.title || item.car_name || item.model || item.l30 || '').trim().toLowerCase();
      if (sym && excludedSet.has(sym)) return false;
      if (name && excludedSet.has(name)) return false;
      return true;
    })
    .map((item) => {
      const sym = String(item.s || item.symbol || item.id || item.code || item.slug || item.l18 || item.ticker || '').trim();
      const name = String(item.n || item.name || item.title || item.car_name || item.model || item.l30 || sym).trim();
      const rawPrice = Number(item.priceTomans || item.priceFinal || item.price || item.lastPrice || item.p || item.pl || item.pc || 0);
      const finalPrice = isRial && rawPrice > 0 ? Math.round(rawPrice / 10) : (rawPrice >= 100 ? Math.round(rawPrice) : rawPrice);
      const cp = Number(item.cp !== undefined ? item.cp : (item.changePercent !== undefined ? item.changePercent : (item.plp || 0)));
      const rawCategory = String(item.cat || item.category || item.brand || item.group || '').trim();
      const isFund = Boolean(item.f === 1 || item.isFund || src.priceType === 'bourse_fund' || rawCategory.includes('صندوق') || name.includes('صندوق'));

      return {
        ...item,
        symbol: sym,
        name,
        price: finalPrice,
        changePercent: cp,
        category: rawCategory,
        extra: String(item.extra || item.model || item.volume || '').trim(),
        isFund,
      };
    });
}

function getAssetIcon(item) {
  if (!item) return <Sparkles size={15} />;
  if (item.type === 'bourse') return <TrendingUp size={15} />;
  const badge = String(item.badge || item.category || item.name || '').toLowerCase();
  if (badge.includes('طلا') || badge.includes('gold')) return <Award size={15} />;
  if (badge.includes('سکه') || badge.includes('coin')) return <Coins size={15} />;
  if (badge.includes('نقره') || badge.includes('silver')) return <Disc size={15} />;
  if (badge.includes('ارز') || badge.includes('currency') || badge.includes('دلار')) return <Banknote size={15} />;
  if (badge.includes('رمز') || badge.includes('crypto')) return <Zap size={15} />;
  if (badge.includes('صندوق') || badge.includes('fund')) return <Layers size={15} />;
  return <Sparkles size={15} />;
}

export function normalizeSearchText(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/\u200C/g, ' ')
    .replace(/[\u200B\u200D\uFEFF]/g, '')
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

export default function UniversalAssetSearch({
  mode = 'picker',
  sources = null,
  priceTypeInfo = null,
  selectedAsset = null,
  selectedAssetId = null,
  onSelect = () => {},
  placeholder = 'جستجو در تمامی دارایی‌ها و سورس‌ها...',
  title = '',
  subtitle = '',
  autoFocus = false,
}) {
  const [query, setQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [internalSources, setInternalSources] = useState(sources || []);
  const [bourseSymbols, setBourseSymbols] = useState([]);
  const containerRef = useRef(null);

  // 1. Fetch Sources if not passed in props
  useEffect(() => {
    if (sources && sources.length > 0) {
      setInternalSources(sources);
      return;
    }
    let isMounted = true;
    apiGetPriceSources()
      .then((res) => {
        if (isMounted && res?.success && Array.isArray(res.sources)) {
          setInternalSources(res.sources);
        }
      })
      .catch((err) => console.error('Error loading sources:', err));
    return () => { isMounted = false; };
  }, [sources]);

  // 2. Fetch Bourse symbols once upfront for instant client-side search
  useEffect(() => {
    let isMounted = true;
    apiSearchBourseSymbols('', 2000)
      .then((res) => {
        if (isMounted && res?.success && Array.isArray(res.symbols)) {
          setBourseSymbols(res.symbols);
        }
      })
      .catch((err) => console.error('Error preloading bourse symbols:', err));
    return () => { isMounted = false; };
  }, []);

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

  // 3. Build Unified Items List (100% Client-Side, Exact 2 Types)
  const allItems = useMemo(() => {
    const items = [];
    const seenKeys = new Set();

    // ── نوع ۱: سورس‌های نرخ پایه ──────────────────────────────────────────
    // فقط نوع نرخ را بنویس، فقط در صورت فعال بودن و مرجع بودن
    internalSources.forEach((src) => {
      const isActive = src.isActive === 1 || src.isActive === true || src.is_active === 1 || src.is_active === true;
      if (!isActive) return;

      const isMulti = isSourceMultiOutput(src, priceTypeInfo);
      if (isMulti) return;

      const isPrimary = src.isPrimary === 1 || src.isPrimary === true || src.is_primary === 1 || src.is_primary === true;
      if (!isPrimary) return;

      const typeLabel = (priceTypeInfo && priceTypeInfo[src.priceType]?.label) || src.priceType || src.name;

      items.push({
        id: src.id,
        sourceId: src.id,
        name: typeLabel, // فقط عنوان نوع نرخ
        symbol: '',
        subText: 'نرخ پایه بازار (سورس مرجع)',
        badge: typeLabel,
        badgeClass: 'single-rate',
        price: Number(src.lastPrice || 0),
        unit: src.unit || 'تومان',
        type: 'source',
        changePercent: src.diff !== undefined ? src.diff : src.changePercent,
        raw: src,
      });
      seenKeys.add(src.id);
    });

    // ── نوع ۲: هاب سورس‌های چند خروجی و فیدها (تمام دسته‌بندی‌ها) ───────────────
    // هر اقلامی که زیرش هست رو بیار، در صورت فعال بودن
    internalSources.forEach((src) => {
      const isActive = src.isActive === 1 || src.isActive === true || src.is_active === 1 || src.is_active === true;
      if (!isActive) return;

      const isMulti = isSourceMultiOutput(src, priceTypeInfo);
      if (!isMulti) return;

      const feedCategoryLabel = (priceTypeInfo && priceTypeInfo[src.priceType]?.label) || src.priceType || src.name;
      const isBourse = src.priceType === 'bourse' || src.priceType === 'bourse_fund';

      // ۱. اگر فید بورس است و دیتای نمادها از قبل لود شده
      if (isBourse && bourseSymbols.length > 0) {
        bourseSymbols.forEach((sym) => {
          const symCode = (sym.symbol || sym.s || '').trim();
          const symName = (sym.name || sym.n || symCode).trim();
          if (!symCode && !symName) return;

          const itemKey = `bourse_${symCode || symName}`;
          if (seenKeys.has(itemKey)) return;
          seenKeys.add(itemKey);

          const isFund = Boolean(sym.isFund || sym.f === 1 || src.priceType === 'bourse_fund' || sym.category?.includes('صندوق') || symName.includes('صندوق'));
          const priceToman = sym.priceToman !== undefined
            ? Number(sym.priceToman)
            : Math.round(Number(sym.priceRial || sym.p || sym.price || 0) / 10);
          const cp = Number(sym.changePercent !== undefined ? sym.changePercent : (sym.cp !== undefined ? sym.cp : (sym.plp || 0)));

          items.push({
            id: itemKey,
            sourceId: src.id,
            symbol: symCode,
            name: symCode && !symName.includes(symCode) ? `${symName} (${symCode})` : symName,
            subText: sym.category ? `${sym.category}${symCode ? ` • نماد: ${symCode}` : ''}` : (isFund ? `صندوق سرمایه‌گذاری${symCode ? ` • نماد: ${symCode}` : ''}` : `سهام بورس${symCode ? ` • نماد: ${symCode}` : ''}`),
            badge: isFund ? 'صندوق' : 'بورس',
            badgeClass: 'bourse',
            price: priceToman,
            unit: isFund ? 'واحد' : 'برگ سهم',
            type: 'bourse',
            changePercent: cp,
            raw: {
              symbol: symCode,
              name: symName,
              priceToman,
              priceRial: priceToman * 10,
              isFund,
              category: sym.category,
              sourceId: src.id,
            },
          });
        });
      }

      // ۲. استخراج تمامی اقلام زیرمجموعه این فید (فارکس، خودرو، رمزارز، کالا، مسکن و تمامی دسته‌بندی‌ها)
      const subItems = extractMultiItems(src);
      subItems.forEach((sub) => {
        const symCode = (sub.symbol || sub.s || '').trim();
        const itemName = (sub.name || sub.n || symCode).trim();
        if (!symCode && !itemName) return;

        const itemKey = `${src.id}::${symCode || itemName}`;
        if (seenKeys.has(itemKey)) return;
        seenKeys.add(itemKey);

        const isFund = Boolean(sub.isFund || (isBourse && (sub.category?.includes('صندوق') || itemName.includes('صندوق'))));
        const itemBadge = sub.category || (isBourse ? (isFund ? 'صندوق' : 'بورس') : feedCategoryLabel);

        const displayName = symCode && !itemName.includes(symCode) ? `${itemName} (${symCode})` : itemName;
        const subDetails = [sub.category, symCode ? `کد: ${symCode}` : '', sub.extra].filter(Boolean).join(' • ') || feedCategoryLabel;

        items.push({
          id: itemKey,
          sourceId: src.id,
          symbol: symCode,
          name: displayName,
          subText: subDetails,
          badge: itemBadge,
          badgeClass: isBourse ? 'bourse' : 'multi-item',
          price: Number(sub.price || sub.priceTomans || 0),
          unit: isBourse ? (isFund ? 'واحد' : 'برگ سهم') : (src.unit || 'تومان'),
          type: isBourse ? 'bourse' : 'source',
          changePercent: Number(sub.changePercent || 0),
          raw: {
            ...sub,
            symbol: symCode,
            name: itemName,
            priceToman: Number(sub.price || sub.priceTomans || 0),
            priceRial: Number(sub.price || sub.priceTomans || 0) * 10,
            isFund,
            sourceId: src.id,
            sourceName: src.name,
            unit: isBourse ? (isFund ? 'واحد' : 'برگ سهم') : (src.unit || 'تومان'),
          },
        });
      });
    });

    return items;
  }, [internalSources, bourseSymbols, priceTypeInfo]);

  // 4. Pure Client-Side Instant Search Filter
  const filteredItems = useMemo(() => {
    const q = normalizeSearchText(query);
    if (!q) return allItems;

    return allItems.filter((item) => {
      const nameNorm = normalizeSearchText(item.name);
      const symNorm = normalizeSearchText(item.symbol);
      const subNorm = normalizeSearchText(item.subText);
      const badgeNorm = normalizeSearchText(item.badge);

      return nameNorm.includes(q) || symNorm.includes(q) || subNorm.includes(q) || badgeNorm.includes(q);
    });
  }, [allItems, query]);

  const isItemActive = (item) => {
    const targetId = selectedAssetId || (selectedAsset?.id ? selectedAsset.id : null);
    if (!targetId) return false;
    if (item.id === targetId) return true;
    if (item.symbol && targetId === `bourse_${item.symbol}`) return true;
    if (item.sourceId && item.sourceId === targetId) return true;
    return false;
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
                  {(priceTypeInfo && priceTypeInfo[selectedAsset?.priceType]?.label) || selectedAsset?.name || 'انتخاب نشده'}
                </strong>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search Input Bar */}
      <div className="universal-search-bar">
        <Search size={16} className="universal-search-icon" />
        <input
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
                            {item.price % 1 !== 0
                              ? Number(item.price).toLocaleString('fa-IR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
                              : Math.round(item.price).toLocaleString('fa-IR')}
                          </span>
                          <span className="universal-result-unit">{item.unit || 'تومان'}</span>
                        </>
                      ) : (
                        <span className="universal-result-badge" style={{ color: '#60a5fa' }}>
                          {active ? <Check size={12} /> : 'انتخاب'}
                        </span>
                      )}
                      {item.changePercent !== undefined && Number(item.changePercent) !== 0 && (
                        <span className={`universal-result-change ${Number(item.changePercent) > 0 ? 'positive' : 'negative'}`}>
                          {Number(item.changePercent) > 0 ? '+' : ''}{Number(item.changePercent).toFixed(2)}%
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
                            {item.price % 1 !== 0
                              ? Number(item.price).toLocaleString('fa-IR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
                              : Math.round(item.price).toLocaleString('fa-IR')}
                          </span>
                          <span className="universal-result-unit">{item.unit || 'تومان'}</span>
                        </>
                      ) : (
                        <span className="universal-result-badge" style={{ color: '#60a5fa' }}>
                          {active ? <Check size={12} /> : 'انتخاب'}
                        </span>
                      )}
                      {item.changePercent !== undefined && Number(item.changePercent) !== 0 && (
                        <span className={`universal-result-change ${Number(item.changePercent) > 0 ? 'positive' : 'negative'}`}>
                          {Number(item.changePercent) > 0 ? '+' : ''}{Number(item.changePercent).toFixed(2)}%
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
