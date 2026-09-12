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
  Radio,
  Globe,
  Check,
  Building2,
  SlidersHorizontal,
} from 'lucide-react';
import { apiGetPriceSources, apiSearchBourseSymbols } from '../api/client.js';

const CORE_ASSETS = [
  { id: 'gold_18k', name: 'طلای ۱۸ عیار', category: 'gold', unit: 'گرم', type: 'standard' },
  { id: 'gold_melted', name: 'طلای آبشده (گرم ۱۸)', category: 'gold', unit: 'گرم', type: 'standard' },
  { id: 'full_new', name: 'سکه امامی', category: 'coin', unit: 'عدد', type: 'standard' },
  { id: 'full_old', name: 'سکه بهار آزادی', category: 'coin', unit: 'عدد', type: 'standard' },
  { id: 'half', name: 'نیم سکه بهار آزادی', category: 'coin', unit: 'عدد', type: 'standard' },
  { id: 'quarter', name: 'ربع سکه بهار آزادی', category: 'coin', unit: 'عدد', type: 'standard' },
  { id: 'silver_999', name: 'نقره خام ۹۹۹', category: 'silver', unit: 'گرم', type: 'standard' },
  { id: 'USD', name: 'دلار آمریکا', category: 'currency', unit: 'دلار', type: 'standard' },
  { id: 'USDT', name: 'تتر (USDT)', category: 'crypto', unit: 'تتر', type: 'standard' },
  { id: 'EUR', name: 'یورو اروپا', category: 'currency', unit: 'یورو', type: 'standard' },
  { id: 'AED', name: 'درهم امارات', category: 'currency', unit: 'درهم', type: 'standard' },
  { id: 'TRY', name: 'لیر ترکیه', category: 'currency', unit: 'لیر', type: 'standard' },
  { id: 'BTC', name: 'بیت‌کوین (BTC)', category: 'crypto', unit: 'عدد', type: 'standard' },
  { id: 'ETH', name: 'اتریوم (ETH)', category: 'crypto', unit: 'عدد', type: 'standard' },
];

const CATEGORY_TABS = [
  { id: 'all', label: 'همه اقلام' },
  { id: 'sources', label: 'سورس‌های تعریف‌شده' },
  { id: 'multi_output', label: 'اقلام چند خروجی' },
  { id: 'bourse', label: 'بورس و صندوق‌ها' },
  { id: 'gold_coins', label: 'طلا و مسکوکات' },
  { id: 'currency_crypto', label: 'ارز و رمزارز' },
];

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

export function isSourceMultiOutput(s) {
  if (!s) return false;
  const t = (s.priceType || '').toLowerCase();
  if (t === 'bourse' || t === 'bourse_fund' || t === 'forex') return true;
  if (s.category === 'multi_output' || s.isMultiOutput) return true;
  if (s.fieldMapping && (s.fieldMapping.isMultiOutput || s.fieldMapping.idField || s.fieldMapping.symbolField)) return true;
  if (s.lastMultiData) return true;
  if (Array.isArray(s.sampleItems) && s.sampleItems.length > 0) return true;
  if (Array.isArray(s.compactList) && s.compactList.length > 0) return true;
  if (Array.isArray(s.items) && s.items.length > 0) return true;
  return false;
}

export function extractMultiItems(src) {
  if (!src) return [];
  let multi = null;
  if (src.lastMultiData) {
    if (typeof src.lastMultiData === 'string') {
      try {
        multi = JSON.parse(src.lastMultiData);
      } catch (e) {
        console.warn('Failed to parse lastMultiData for', src.name, e);
      }
    } else if (typeof src.lastMultiData === 'object') {
      multi = src.lastMultiData;
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
    else if (Array.isArray(multi.list)) rawList = multi.list;
    else if (Array.isArray(multi)) rawList = multi;
    else if (typeof multi === 'object') {
      rawList = Object.entries(multi)
        .filter(([k]) => !['updatedAt', 'totalCount', 'totalSymbols', 'labels', 'topSymbols', 'error', 'datetime'].includes(k))
        .map(([k, v]) => {
          const val = typeof v === 'object' ? (v?.price || v?.p || v?.val || 0) : v;
          return {
            s: k.toUpperCase(),
            n: k.toUpperCase(),
            p: Number(val) || 0,
            priceTomans: Number(val) || 0,
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

  const isRial = src.unit === 'rial' || (typeof src.fieldMapping === 'object' && src.fieldMapping?.priceUnit === 'rial');

  return rawList
    .filter((item) => {
      if (!item || typeof item !== 'object') return false;
      const sym = String(item.s || item.symbol || item.id || item.code || item.slug || '').trim().toLowerCase();
      const name = String(item.n || item.name || item.title || item.car_name || item.model || '').trim().toLowerCase();
      if (sym && excludedSet.has(sym)) return false;
      if (name && excludedSet.has(name)) return false;
      return true;
    })
    .map((item) => {
      const sym = String(item.s || item.symbol || item.id || item.code || item.slug || '').trim();
      const name = String(item.n || item.name || item.title || item.car_name || item.model || sym).trim();
      const rawPrice = Number(item.priceTomans || item.priceFinal || item.price || item.lastPrice || item.p || 0);
      const finalPrice = isRial && rawPrice > 0 ? Math.round(rawPrice / 10) : (rawPrice >= 100 ? Math.round(rawPrice) : rawPrice);
      const cp = Number(item.cp !== undefined ? item.cp : (item.changePercent !== undefined ? item.changePercent : (item.plp || 0)));

      return {
        ...item,
        symbol: sym,
        name,
        price: finalPrice,
        changePercent: cp,
        category: String(item.cat || item.category || item.brand || item.group || '').trim(),
        extra: String(item.extra || item.model || item.volume || '').trim(),
        isFund: Boolean(item.f === 1 || item.isFund),
      };
    });
}

function getCategoryIcon(cat) {
  switch (cat) {
    case 'gold':
    case 'gold_18k':
      return <Award size={15} />;
    case 'coin':
    case 'full_coin':
    case 'half_coin':
    case 'quarter_coin':
      return <Coins size={15} />;
    case 'silver':
      return <Disc size={15} />;
    case 'currency':
    case 'usd':
    case 'eur':
    case 'aed':
    case 'try':
      return <Banknote size={15} />;
    case 'crypto':
      return <Zap size={15} />;
    case 'bourse':
    case 'bourse_fund':
      return <Building2 size={15} />;
    case 'multi_output':
      return <Layers size={15} />;
    default:
      return <Sparkles size={15} />;
  }
}

export default function UniversalAssetSearch({
  mode = 'explorer', // 'explorer' | 'picker'
  onSelect = () => {},
  selectedAsset = null,
  selectedAssetId = null,
  sources: propSources = null,
  title = '',
  subtitle = '',
  placeholder = 'جستجو در تمامی سورس‌ها، طلا، سکه، ارز، بورس، خودرو و فیدها...',
  showCategories = true,
  autoFocus = false,
  className = '',
}) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [internalSources, setInternalSources] = useState([]);
  const [bourseResults, setBourseResults] = useState([]);
  const [isSearchingBourse, setIsSearchingBourse] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const searchContainerRef = useRef(null);

  // Load sources if not provided via props
  useEffect(() => {
    if (propSources && Array.isArray(propSources)) {
      setInternalSources(propSources);
    } else {
      let isMounted = true;
      apiGetPriceSources()
        .then((res) => {
          if (isMounted && res?.success && Array.isArray(res.sources)) {
            setInternalSources(res.sources);
          }
        })
        .catch((err) => console.error('Error fetching sources for search:', err));
      return () => {
        isMounted = false;
      };
    }
  }, [propSources]);

  // Handle click outside to close picker dropdown
  useEffect(() => {
    if (mode !== 'picker') return;
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [mode]);

  // Debounced Bourse Symbol Search
  useEffect(() => {
    const q = query.trim();
    if (!q || q.length < 2) {
      setBourseResults([]);
      setIsSearchingBourse(false);
      return;
    }

    if (activeCategory !== 'all' && activeCategory !== 'bourse') {
      setBourseResults([]);
      return;
    }

    setIsSearchingBourse(true);
    const timer = setTimeout(async () => {
      try {
        const res = await apiSearchBourseSymbols(q, 10);
        if (res?.success && Array.isArray(res.symbols)) {
          setBourseResults(res.symbols);
        } else {
          setBourseResults([]);
        }
      } catch (e) {
        console.error('Error searching bourse:', e);
        setBourseResults([]);
      } finally {
        setIsSearchingBourse(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [query, activeCategory]);

  // Build Unified Searchable Items
  const filteredItems = useMemo(() => {
    const qNorm = normalizeSearchText(query);
    const results = [];

    // 1. Configured Price Sources & Multi-Output Sub-Items
    internalSources.forEach((src) => {
      const isMulti = isSourceMultiOutput(src);

      if (isMulti) {
        const subItems = extractMultiItems(src);
        const srcNameNorm = normalizeSearchText(src.name);
        const srcEndpointNorm = normalizeSearchText(src.endpoint);
        const srcPriceTypeNorm = normalizeSearchText(src.priceType);

        // 1A. Parent Multi-Output Feed container
        const allowFeedInTab = activeCategory === 'all' || activeCategory === 'sources' || activeCategory === 'multi_output';
        const parentMatch = !qNorm || srcNameNorm.includes(qNorm) || srcPriceTypeNorm.includes(qNorm) || srcEndpointNorm.includes(qNorm);

        if (allowFeedInTab && parentMatch) {
          results.push({
            id: src.id,
            sourceId: src.id,
            name: src.name || 'فید چند خروجی بدون نام',
            subText: `فید چند خروجی • ${subItems.length > 0 ? `${subItems.length.toLocaleString('fa-IR')} قلم خروجی` : 'فاقد اقلام فعال'} • ${src.endpoint ? 'وب‌سرویس API' : 'سورس اختصاصی'}`,
            badge: `${subItems.length > 0 ? `${subItems.length.toLocaleString('fa-IR')} قلم` : 'چند خروجی'}`,
            badgeClass: 'multi_output',
            price: Number(src.lastPrice || 0),
            unit: src.unit || 'مورد',
            category: 'multi_output',
            type: 'source',
            priceType: src.priceType,
            isMultiFeed: true,
            raw: src,
          });
        }

        // 1B. Search individual Sub-Items of this multi-output source
        subItems.forEach((subItem) => {
          let allowSubItemInTab = false;
          if (activeCategory === 'all' || activeCategory === 'sources' || activeCategory === 'multi_output') {
            allowSubItemInTab = true;
          } else if (activeCategory === 'bourse') {
            allowSubItemInTab = src.priceType === 'bourse' || src.priceType === 'bourse_fund' || subItem.isFund ||
              subItem.category.includes('بورس') || subItem.category.includes('صندوق');
          } else if (activeCategory === 'gold_coins') {
            allowSubItemInTab = src.priceType?.includes('gold') || src.priceType?.includes('coin') ||
              subItem.category.includes('طلا') || subItem.category.includes('سکه');
          } else if (activeCategory === 'currency_crypto') {
            allowSubItemInTab = src.priceType?.includes('currency') || src.priceType?.includes('crypto') || src.priceType === 'forex' ||
              subItem.category.includes('ارز') || subItem.category.includes('رمزارز');
          }

          if (!allowSubItemInTab) return;

          let matchesQuery = false;
          if (!qNorm) {
            matchesQuery = activeCategory === 'multi_output' || results.filter((r) => r.sourceId === src.id && r.isMultiItem).length < 4;
          } else {
            const subNameNorm = normalizeSearchText(subItem.name);
            const subSymNorm = normalizeSearchText(subItem.symbol);
            const subCatNorm = normalizeSearchText(subItem.category);
            const subExtraNorm = normalizeSearchText(subItem.extra);

            matchesQuery = subNameNorm.includes(qNorm) ||
              subSymNorm.includes(qNorm) ||
              subCatNorm.includes(qNorm) ||
              subExtraNorm.includes(qNorm) ||
              srcNameNorm.includes(qNorm);
          }

          if (matchesQuery) {
            results.push({
              id: `${src.id}::${subItem.symbol || subItem.name}`,
              sourceId: src.id,
              subItemId: subItem.symbol || subItem.name,
              symbol: subItem.symbol,
              name: subItem.name,
              subText: `${src.name}${subItem.category ? ` • ${subItem.category}` : ''}${subItem.extra ? ` • ${subItem.extra}` : ''}`,
              badge: subItem.category || src.name,
              badgeClass: 'multi_output',
              price: subItem.price,
              unit: src.unit || 'تومان',
              category: 'multi_output',
              type: 'source',
              isMultiItem: true,
              changePercent: subItem.changePercent,
              raw: {
                ...subItem,
                sourceId: src.id,
                sourceName: src.name,
                unit: src.unit || 'تومان',
              },
            });
          }
        });
      } else {
        // Standard Single-Rate Source
        if (activeCategory === 'all' || activeCategory === 'sources') {
          const nameMatch = !qNorm || normalizeSearchText(src.name).includes(qNorm);
          const typeMatch = !qNorm || normalizeSearchText(src.priceType).includes(qNorm);
          const channelMatch = !qNorm || normalizeSearchText(src.channelUsername).includes(qNorm);
          const endpointMatch = !qNorm || normalizeSearchText(src.endpoint).includes(qNorm);

          if (nameMatch || typeMatch || channelMatch || endpointMatch) {
            results.push({
              id: src.id,
              sourceId: src.id,
              name: src.name || 'سورس بدون نام',
              subText: src.sourceType === 'telegram'
                ? `@${src.channelUsername || src.endpoint || ''}`
                : (src.endpoint ? 'وب‌سرویس API' : 'سورس اختصاصی'),
              badge: src.sourceType === 'telegram' ? 'تلگرام' : 'API',
              badgeClass: src.sourceType === 'telegram' ? 'telegram' : 'api',
              price: Number(src.lastPrice || 0),
              unit: src.unit || 'تومان',
              category: 'source',
              type: 'source',
              priceType: src.priceType,
              raw: src,
            });
          }
        }
      }
    });

    // 2. Bourse Symbols
    if (activeCategory === 'all' || activeCategory === 'bourse') {
      bourseResults.forEach((sym) => {
        results.push({
          id: `bourse_${sym.symbol}`,
          symbol: sym.symbol,
          name: sym.isFund ? (sym.name || sym.symbol) : `سهام ${sym.symbol} (${sym.name})`,
          subText: sym.isFund ? 'صندوق سرمایه‌گذاری' : 'بورس اوراق بهادار تهران',
          badge: sym.isFund ? 'صندوق' : 'بورس',
          badgeClass: 'bourse',
          price: sym.priceToman || Math.round((sym.priceRial || 0) / 10),
          unit: sym.isFund ? 'واحد' : 'برگ سهم',
          category: sym.isFund ? 'bourse_fund' : 'bourse',
          type: 'bourse',
          changePercent: sym.changePercent,
          raw: sym,
        });
      });
    }

    // 3. Core & Standard Assets (Gold, Coins, Currencies, Crypto)
    const allowGoldCoins = activeCategory === 'all' || activeCategory === 'gold_coins';
    const allowCurrencies = activeCategory === 'all' || activeCategory === 'currency_crypto';

    CORE_ASSETS.forEach((core) => {
      const isGoldCoin = core.category === 'gold' || core.category === 'coin' || core.category === 'silver';
      const isCurrCrypto = core.category === 'currency' || core.category === 'crypto';

      if ((allowGoldCoins && isGoldCoin) || (allowCurrencies && isCurrCrypto)) {
        const nameMatch = !qNorm ||
          normalizeSearchText(core.name).includes(qNorm) ||
          normalizeSearchText(core.id).includes(qNorm);
        if (nameMatch) {
          results.push({
            id: core.id,
            name: core.name,
            subText: core.category === 'gold' ? 'طلای خام و آب‌شده'
              : core.category === 'coin' ? 'مسکوکات رسمی بانکی'
              : core.category === 'currency' ? 'ارز بازار آزاد'
              : core.category === 'crypto' ? 'رمزارز پایه' : 'دارایی پایه',
            badge: core.unit,
            badgeClass: core.category,
            price: 0,
            unit: core.unit,
            category: core.category,
            type: 'standard',
            raw: core,
          });
        }
      }
    });

    return results;
  }, [query, activeCategory, internalSources, bourseResults]);

  // Check if item matches current selection
  const isItemActive = (item) => {
    const targetId = selectedAssetId || (selectedAsset?.id ? selectedAsset.id : null);
    if (!targetId) return false;
    if (item.id === targetId) return true;
    if (item.symbol && targetId === `bourse_${item.symbol}`) return true;
    if (item.isMultiItem) {
      if (item.subItemId && (targetId === item.subItemId || targetId === item.id || targetId === `${item.sourceId}::${item.subItemId}`)) return true;
      return false;
    }
    if (item.sourceId && item.sourceId === targetId) return true;
    return false;
  };

  const handleSelectItem = (item) => {
    onSelect(item);
    if (mode === 'picker') {
      setIsDropdownOpen(false);
    }
  };

  const activeAssetName = useMemo(() => {
    if (selectedAsset?.name) return selectedAsset.name;
    if (selectedAssetId) {
      const foundSource = internalSources.find((s) => s.id === selectedAssetId);
      if (foundSource) return foundSource.name;
      const foundCore = CORE_ASSETS.find((c) => c.id === selectedAssetId);
      if (foundCore) return foundCore.name;
      if (selectedAssetId.startsWith('bourse_')) return selectedAssetId.replace('bourse_', 'نماد ');

      // Check multi-output sub-items
      for (const src of internalSources) {
        if (isSourceMultiOutput(src)) {
          const subItems = extractMultiItems(src);
          const foundSub = subItems.find(
            (it) => it.symbol === selectedAssetId || `${src.id}::${it.symbol || it.name}` === selectedAssetId
          );
          if (foundSub) return `${foundSub.name} (${src.name})`;
        }
      }
    }
    return '';
  }, [selectedAsset, selectedAssetId, internalSources]);

  return (
    <div
      ref={searchContainerRef}
      className={`universal-asset-search-wrap ${mode === 'picker' ? 'picker-mode' : 'explorer-mode'} ${className}`}
    >
      {/* Explorer Top Toolbar (Header + Title) */}
      {mode === 'explorer' && (
        <div className="universal-search-topbar">
          <div className="universal-search-title-box">
            <SlidersHorizontal size={18} style={{ color: 'var(--accent-blue, #3b82f6)' }} />
            <div>
              <h4>{title || 'مرکز جستجو و کاوشگر داده‌ها و سورس‌ها'}</h4>
              <span>{subtitle || 'جستجوی آنی در تمامی سورس‌ها، وب‌سرویس‌ها، بورس تهران، طلا، سکه و ارز'}</span>
            </div>
          </div>

          {activeAssetName && (
            <div className="universal-active-asset-banner">
              <div className="universal-active-asset-info">
                <span className="universal-active-label">آیتم فعال:</span>
                <strong className="universal-active-name">{activeAssetName}</strong>
                {selectedAsset?.lastPrice > 0 && (
                  <span className="universal-active-price">
                    {Math.round(selectedAsset.lastPrice).toLocaleString('fa-IR')} {selectedAsset.unit || 'تومان'}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Category Filter Pills (Explorer or Picker when enabled) */}
      {showCategories && (
        <div className="universal-categories-strip">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`universal-category-pill ${activeCategory === tab.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Search Bar Input */}
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
        <div className="universal-search-trailing">
          {isSearchingBourse && <span className="universal-search-spinner" title="در حال جستجوی بورس..." />}
          {query && (
            <button
              type="button"
              className="universal-search-clear"
              onClick={() => {
                setQuery('');
                setBourseResults([]);
              }}
              title="پاک کردن"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Results Rendering: Mode Dependent */}
      {mode === 'picker' ? (
        /* Picker Dropdown Popover */
        isDropdownOpen && (
          <div className="universal-results-picker-dropdown">
            {filteredItems.length === 0 ? (
              <div className="universal-empty-results">
                {isSearchingBourse ? 'در حال جستجو در پایگاه داده...' : 'هیچ دارایی یا سورسی مطابق با عبارت جستجو یافت نشد.'}
              </div>
            ) : (
              filteredItems.slice(0, 30).map((item) => {
                const active = isItemActive(item);
                return (
                  <div
                    key={item.id}
                    className={`universal-result-card ${active ? 'active-selected' : ''}`}
                    onClick={() => handleSelectItem(item)}
                  >
                    <div className="universal-result-info">
                      <div className={`universal-result-icon ${item.category}`}>
                        {getCategoryIcon(item.category)}
                      </div>
                      <div className="universal-result-text">
                        <span className="universal-result-name">{item.name}</span>
                        <div className="universal-result-sub">
                          <span className={`universal-result-badge ${item.badgeClass || ''}`}>{item.badge}</span>
                          <span>{item.subText}</span>
                        </div>
                      </div>
                    </div>

                    <div className="universal-result-pricing">
                      {item.price > 0 && (
                        <span className="universal-result-price">
                          {item.price < 100
                            ? Number(item.price).toLocaleString('fa-IR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
                            : Math.round(item.price).toLocaleString('fa-IR')}
                        </span>
                      )}
                      {item.changePercent !== undefined && Number(item.changePercent) !== 0 && (
                        <span className={`universal-result-change ${Number(item.changePercent) > 0 ? 'positive' : 'negative'}`}>
                          {Number(item.changePercent) > 0 ? '+' : ''}{Number(item.changePercent).toFixed(2)}%
                        </span>
                      )}
                      <span className="universal-result-unit">{item.unit}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )
      ) : (
        /* Explorer Mode Grid (when searching or active) */
        query.trim().length > 0 && (
          <div className="universal-results-explorer">
            {filteredItems.length === 0 ? (
              <div className="universal-empty-results" style={{ gridColumn: '1 / -1' }}>
                {isSearchingBourse ? 'در حال جستجو...' : 'موردی با این مشخصات یافت نشد.'}
              </div>
            ) : (
              filteredItems.slice(0, 30).map((item) => {
                const active = isItemActive(item);
                return (
                  <div
                    key={item.id}
                    className={`universal-result-card ${active ? 'active-selected' : ''}`}
                    onClick={() => handleSelectItem(item)}
                  >
                    <div className="universal-result-info">
                      <div className={`universal-result-icon ${item.category}`}>
                        {getCategoryIcon(item.category)}
                      </div>
                      <div className="universal-result-text">
                        <span className="universal-result-name">{item.name}</span>
                        <div className="universal-result-sub">
                          <span className={`universal-result-badge ${item.badgeClass || ''}`}>{item.badge}</span>
                          <span>{item.subText}</span>
                        </div>
                      </div>
                    </div>

                    <div className="universal-result-pricing">
                      {item.price > 0 ? (
                        <span className="universal-result-price">
                          {item.price < 100
                            ? Number(item.price).toLocaleString('fa-IR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
                            : Math.round(item.price).toLocaleString('fa-IR')}
                        </span>
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
                      <span className="universal-result-unit">{item.unit}</span>
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
